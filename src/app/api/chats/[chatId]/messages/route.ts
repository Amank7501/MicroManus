import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { decrypt } from "@/lib/crypto";
import { runAgent, type AgentMessage, type ToolCall, type ToolDefinition } from "@/lib/agent";
import { generateReportPdf } from "@/lib/pdf";

export const maxDuration = 60;

const SYSTEM_PROMPT =
  "You are MicroManus, a deep-research assistant. You have a web_search tool — " +
  "use it whenever a question needs current facts, statistics, or news you " +
  "aren't confident about. Think step by step, search as needed, and then " +
  "give a clear, well-structured final answer. When asked for a report, " +
  "organize it with headings and cover causes, impact, and what can be done. " +
  "If the user asked for a report or a document they can download, call " +
  "create_pdf_report once you have enough material, then still give a short " +
  "final reply summarizing it — the download link is shown separately in the UI.";

const PDF_TOOL: ToolDefinition = {
  type: "function",
  function: {
    name: "create_pdf_report",
    description:
      "Generate a downloadable PDF report of your findings. Call this once, " +
      "when the user asked for a report or a document they can download. " +
      "Provide a clear title and the full content in simple markdown " +
      "('# '/'## ' for headings, '- ' for bullet points).",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "Short report title" },
        markdown: { type: "string", description: "Full report content in simple markdown" },
      },
      required: ["title", "markdown"],
    },
  },
};

type MessageRow = {
  id: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  tool_calls: unknown;
  tool_call_id: string | null;
  created_at: string;
};

export async function POST(
  request: Request,
  { params }: { params: Promise<{ chatId: string }> },
) {
  const { chatId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const userId = user.id;

  const body = await request.json().catch(() => null);
  const content = typeof body?.content === "string" ? body.content.trim() : "";
  if (!content) {
    return NextResponse.json({ error: "Message is required" }, { status: 400 });
  }

  const { data: chat } = await supabase
    .from("chats")
    .select("id")
    .eq("id", chatId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!chat) {
    return NextResponse.json({ error: "Chat not found" }, { status: 404 });
  }

  const { data: credits } = await supabase
    .from("credits")
    .select("balance")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!credits || credits.balance <= 0) {
    return NextResponse.json({ error: "You're out of credits" }, { status: 402 });
  }

  const admin = createAdminClient();
  const { data: keyRow } = await admin
    .from("api_keys")
    .select("endpoint, encrypted_key, selected_model")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!keyRow) {
    return NextResponse.json(
      { error: "Connect an LLM API key in Settings before chatting" },
      { status: 400 },
    );
  }

  const { data: userMessage, error: insertError } = await supabase
    .from("messages")
    .insert({ chat_id: chatId, role: "user", content })
    .select("id, role, content, tool_calls, tool_call_id, created_at")
    .single();

  if (insertError || !userMessage) {
    return NextResponse.json({ error: "Could not save message" }, { status: 500 });
  }

  const { data: existingMessages } = await supabase
    .from("messages")
    .select("id")
    .eq("chat_id", chatId);

  if (existingMessages && existingMessages.length === 1) {
    await supabase.from("chats").update({ title: content.slice(0, 60) }).eq("id", chatId);
  }

  const { data: history } = await supabase
    .from("messages")
    .select("role, content, tool_calls, tool_call_id")
    .eq("chat_id", chatId)
    .order("seq", { ascending: true });

  const priorMessages: AgentMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...(history ?? []).map((m): AgentMessage => {
      if (m.role === "tool") {
        return { role: "tool", content: m.content, tool_call_id: m.tool_call_id ?? "" };
      }
      if (m.role === "assistant") {
        return {
          role: "assistant",
          content: m.content,
          tool_calls: (m.tool_calls as ToolCall[] | null) ?? undefined,
        };
      }
      return { role: m.role as "system" | "user", content: m.content };
    }),
  ];

  const createdReports: { id: string; title: string; created_at: string }[] = [];

  async function createPdfReportExecutor(args: Record<string, unknown>): Promise<string> {
    const title = typeof args.title === "string" && args.title.trim() ? args.title.trim() : "Report";
    const markdown = typeof args.markdown === "string" ? args.markdown : "";

    const pdfBytes = await generateReportPdf(title, markdown);
    const reportId = crypto.randomUUID();
    const storagePath = `${userId}/${reportId}.pdf`;

    const { error: uploadError } = await admin.storage
      .from("reports")
      .upload(storagePath, Buffer.from(pdfBytes), { contentType: "application/pdf" });

    if (uploadError) {
      return JSON.stringify({ error: "Could not generate the PDF" });
    }

    const { data: reportRow, error: reportInsertError } = await supabase
      .from("reports")
      .insert({ id: reportId, user_id: userId, chat_id: chatId, title, storage_path: storagePath })
      .select("id, title, created_at")
      .single();

    if (reportInsertError || !reportRow) {
      return JSON.stringify({ error: "Could not save the report" });
    }

    createdReports.push(reportRow);
    return JSON.stringify({ status: "created", reportId: reportRow.id, title: reportRow.title });
  }

  const apiKey = decrypt(keyRow.encrypted_key);
  const agentResult = await runAgent(
    keyRow.endpoint,
    apiKey,
    keyRow.selected_model,
    priorMessages,
    [PDF_TOOL],
    { create_pdf_report: createPdfReportExecutor },
  );

  const persisted: MessageRow[] = [];
  for (const msg of agentResult.newMessages) {
    const { data: row } = await supabase
      .from("messages")
      .insert({
        chat_id: chatId,
        role: msg.role,
        content: msg.content,
        tool_calls: "tool_calls" in msg ? (msg.tool_calls ?? null) : null,
        tool_call_id: msg.role === "tool" ? msg.tool_call_id : null,
      })
      .select("id, role, content, tool_calls, tool_call_id, created_at")
      .single();

    if (row) persisted.push(row);
  }

  if (!agentResult.ok) {
    return NextResponse.json(
      {
        userMessage,
        steps: persisted,
        reports: createdReports,
        error: agentResult.message,
        balance: credits.balance,
      },
      { status: 502 },
    );
  }

  const { data: freshCredits } = await admin
    .from("credits")
    .select("balance")
    .eq("user_id", user.id)
    .maybeSingle();

  const newBalance = Math.max((freshCredits?.balance ?? credits.balance) - 1, 0);
  await admin
    .from("credits")
    .update({ balance: newBalance, updated_at: new Date().toISOString() })
    .eq("user_id", user.id);

  return NextResponse.json({
    userMessage,
    steps: persisted,
    reports: createdReports,
    balance: newBalance,
  });
}
