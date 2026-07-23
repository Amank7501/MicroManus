"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function NewChatButton({ className }: { className?: string }) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleClick() {
    setLoading(true);
    const res = await fetch("/api/chats", { method: "POST" });
    const data = await res.json();
    setLoading(false);

    if (res.ok) {
      router.push(`/chat/${data.id}`);
      router.refresh();
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className={
        className ??
        "flex h-10 items-center justify-center gap-2 rounded-full bg-foreground px-5 text-sm font-medium text-background transition-colors hover:bg-[#383838] disabled:opacity-60 dark:hover:bg-[#ccc]"
      }
    >
      {loading ? "Creating…" : "New chat"}
    </button>
  );
}
