import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import NewChatButton from "./new-chat-button";

export default async function ChatIndexPage() {
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

  const { data: chats } = await supabase
    .from("chats")
    .select("id")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1);

  if (chats && chats.length > 0) {
    redirect(`/chat/${chats[0].id}`);
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex flex-col items-center gap-4 text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-black dark:text-zinc-50">
          Start your first chat
        </h1>
        <NewChatButton />
        <Link
          href="/dashboard"
          className="text-sm font-medium text-zinc-600 underline underline-offset-4 dark:text-zinc-400"
        >
          Back to dashboard
        </Link>
      </main>
    </div>
  );
}
