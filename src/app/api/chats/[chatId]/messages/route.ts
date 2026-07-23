import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { decrypt } from "@/lib/crypto";
import { chatCompletion, type ChatMessage } from "@/lib/llm";

const SYSTEM_PROMPT =
  "You are MicroManus, a helpful research assistant. Answer clearly and concisely.";

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
    .select("id, role, content, created_at")
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
    .select("role, content")
    .eq("chat_id", chatId)
    .order("created_at", { ascending: true });

  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...(history ?? []).map((m) => ({
      role: m.role as ChatMessage["role"],
      content: m.content as string,
    })),
  ];

  const apiKey = decrypt(keyRow.encrypted_key);
  const result = await chatCompletion(keyRow.endpoint, apiKey, keyRow.selected_model, messages);

  if (!result.ok) {
    return NextResponse.json({ userMessage, error: result.message }, { status: 502 });
  }

  const { data: assistantMessage, error: assistantInsertError } = await supabase
    .from("messages")
    .insert({ chat_id: chatId, role: "assistant", content: result.content })
    .select("id, role, content, created_at")
    .single();

  if (assistantInsertError || !assistantMessage) {
    return NextResponse.json({ error: "Could not save response" }, { status: 500 });
  }

  return NextResponse.json({ userMessage, assistantMessage });
}
