"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function NewChatButton({ className }: { className?: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function handleClick() {
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/chats", { method: "POST" });
      const data = await res.json();

      if (!res.ok) {
        setLoading(false);
        setError(data.error ?? "Could not create a new chat");
        return;
      }

      router.push(`/chat/${data.id}`);
      router.refresh();
    } catch {
      setLoading(false);
      setError("Couldn't reach the server. Check your connection and try again.");
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
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
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
