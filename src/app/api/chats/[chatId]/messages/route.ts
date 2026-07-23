import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { decrypt } from "@/lib/crypto";
import {
  runAgent,
  type AgentMessage,
  type SourceRef,
  type ToolCall,
  type ToolDefinition,
} from "@/lib/agent";
import { generateReportPdf } from "@/lib/pdf";
import { computeCost } from "@/lib/pricing";
import type { ConnectionAuth } from "@/lib/connection-auth";

export const maxDuration = 60;

function buildSystemPrompt(): string {
  const now = new Date();
  const todayLong = now.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
  const todayIso = now.toISOString().slice(0, 10);

  return (
    `Today's date is ${todayLong} (${todayIso}, UTC). Use this as the current ` +
    "date for anything time-sensitive — relative terms like \"tomorrow\", " +
    "\"this year\", or \"recent\", and any web_search queries — instead of a " +
    "date from your training data. " +
    "You are MicroManus, a deep-research assistant. You have a web_search tool — " +
    "use it whenever a question needs current facts, statistics, or news you " +
    "aren't confident about. Think step by step, search as needed, and then " +
    "give a clear, well-structured final answer. When asked for a report, " +
    "organize it with headings and cover causes, impact, and what can be done. " +
    "If the user asked for a report or a document they can download, call " +
    "create_pdf_report once you have enough material, then give a short final " +
    "reply summarizing it. Reuse the exact same [n] citations in that summary " +
    "that you used in the report — don't drop them just because they're already " +
    "in the PDF; the chat reply needs its own sources shown too. Never include a " +
    "download link, markdown link, file path, or URL for the report in your " +
    "reply — a download button already appears directly above your reply in the " +
    "UI, so there is nothing to link to; refer to it in plain words only " +
    "(\"the report above\") if you need to at all. " +
    "Each web_search result includes a numbered \"index\". When a sentence in your " +
    "answer (or in a PDF report) relies on a specific result, cite it immediately " +
    "after with [n] using that exact index — e.g. \"Wildfire acreage doubled [2].\" " +
    "Only cite results you actually used; never invent a number or cite one you " +
    "didn't rely on. A sources list is generated for you automatically from your " +
    "citations — do not write your own References or Sources section."
  );
}

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
    .select("endpoint, auth_type, encrypted_key, encrypted_username, encrypted_password, selected_model")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!keyRow) {
    return NextResponse.json(
      { error: "Connect an LLM API key in Settings before chatting" },
      { status: 400 },
    );
  }

  let auth: ConnectionAuth;
  if (keyRow.auth_type === "basic") {
    const username = keyRow.encrypted_username ? decrypt(keyRow.encrypted_username) : "";
    const password = keyRow.encrypted_password ? decrypt(keyRow.encrypted_password) : "";
    // Both fields are stored encrypted even when blank (see the settings
    // route), so check the *decrypted* values — not just ciphertext
    // presence — before deciding whether to send a Basic auth header at
    // all. Sending "Basic <base64 of \":\">" to an instance that expects no
    // auth can cause it to reject the request outright.
    auth = username || password ? { type: "basic", username, password } : { type: "none" };
  } else {
    auth = { type: "bearer", token: keyRow.encrypted_key ? decrypt(keyRow.encrypted_key) : "" };
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
    { role: "system", content: buildSystemPrompt() },
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

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      function send(event: Record<string, unknown>) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      }

      send({ type: "user_message", message: userMessage });

      const createdReports: { id: string; title: string; created_at: string }[] = [];

      async function createPdfReportExecutor(
        args: Record<string, unknown>,
        context: { sources: SourceRef[] },
      ): Promise<string> {
        const title =
          typeof args.title === "string" && args.title.trim() ? args.title.trim() : "Report";
        const markdown = typeof args.markdown === "string" ? args.markdown : "";

        const pdfBytes = await generateReportPdf(title, markdown, context.sources);
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
        send({ type: "report", report: reportRow });
        return JSON.stringify({ status: "created", reportId: reportRow.id, title: reportRow.title });
      }

      let toolsWereUnavailable = false;
      let runFailed = false;

      try {
        for await (const event of runAgent(
          keyRow.endpoint,
          auth,
          keyRow.selected_model,
          priorMessages,
          [PDF_TOOL],
          { create_pdf_report: createPdfReportExecutor },
        )) {
          if (event.type === "token") {
            send({ type: "token", content: event.content });
            continue;
          }

          if (event.type === "error") {
            runFailed = true;
            send({ type: "error", error: event.message });
            continue;
          }

          // event.type === "message" — persist it, then forward the
          // persisted row (with its real id/created_at) to the client.
          const msg = event.step.message;
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

          if (row && msg.role === "assistant" && event.step.usage) {
            const { input, output, cached } = event.step.usage;
            const cost = computeCost(keyRow.selected_model, input, output, cached);
            await supabase.from("usage").insert({
              message_id: row.id,
              chat_id: chatId,
              user_id: userId,
              model: keyRow.selected_model,
              input_tokens: input,
              output_tokens: output,
              cached_tokens: cached,
              cost,
            });
          }

          if (event.step.toolsUnavailable) {
            toolsWereUnavailable = true;
          }

          send({
            type: "message",
            message: row ?? {
              id: crypto.randomUUID(),
              role: msg.role,
              content: msg.content,
              tool_calls: "tool_calls" in msg ? (msg.tool_calls ?? null) : null,
              tool_call_id: msg.role === "tool" ? msg.tool_call_id : null,
              created_at: new Date().toISOString(),
            },
          });
        }
      } catch (err) {
        runFailed = true;
        send({
          type: "error",
          error: err instanceof Error ? err.message : "Unexpected error",
        });
      }

      let newBalance = credits.balance;
      if (!runFailed) {
        const { data: freshCredits } = await admin
          .from("credits")
          .select("balance")
          .eq("user_id", userId)
          .maybeSingle();

        newBalance = Math.max((freshCredits?.balance ?? credits.balance) - 1, 0);
        await admin
          .from("credits")
          .update({ balance: newBalance, updated_at: new Date().toISOString() })
          .eq("user_id", userId);
      }

      send({
        type: "done",
        balance: newBalance,
        warning: toolsWereUnavailable
          ? "Tools (like web search) were temporarily unavailable, so this answer was generated without them."
          : undefined,
      });

      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
