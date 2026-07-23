import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ChatView from "../chat-view";

export default async function ChatPage({
  params,
}: {
  params: Promise<{ chatId: string }>;
}) {
  const { chatId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: credits } = await supabase
    .from("credits")
    .select("balance")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!credits) {
    redirect("/paywall");
  }

  const { data: chat } = await supabase
    .from("chats")
    .select("id")
    .eq("id", chatId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!chat) {
    notFound();
  }

  const { data: chats } = await supabase
    .from("chats")
    .select("id, title, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  const { data: messages } = await supabase
    .from("messages")
    .select("id, role, content, created_at")
    .eq("chat_id", chatId)
    .order("created_at", { ascending: true });

  return (
    <ChatView
      chats={chats ?? []}
      activeChatId={chatId}
      initialMessages={messages ?? []}
    />
  );
}
