"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import NewChatButton from "./new-chat-button";

type Message = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  created_at: string;
};

type ChatSummary = {
  id: string;
  title: string;
  created_at: string;
};

type Props = {
  chats: ChatSummary[];
  activeChatId: string;
  initialMessages: Message[];
};

export default function ChatView({ chats, activeChatId, initialMessages }: Props) {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const content = input.trim();
    if (!content || sending) return;

    setError(null);
    setSending(true);
    setInput("");

    const tempId = `temp-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      { id: tempId, role: "user", content, created_at: new Date().toISOString() },
    ]);

    const res = await fetch(`/api/chats/${activeChatId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
    const data = await res.json();
    setSending(false);

    if (!res.ok) {
      setError(data.error ?? "Something went wrong");
      if (data.userMessage) {
        setMessages((prev) => prev.map((m) => (m.id === tempId ? data.userMessage : m)));
      }
      return;
    }

    setMessages((prev) => [
      ...prev.map((m) => (m.id === tempId ? data.userMessage : m)),
      data.assistantMessage,
    ]);
  }

  return (
    <div className="flex h-dvh flex-1 bg-zinc-50 font-sans dark:bg-black">
      <aside className="flex w-64 shrink-0 flex-col gap-3 border-r border-black/[.08] p-4 dark:border-white/[.145]">
        <Link
          href="/dashboard"
          className="text-sm font-medium text-zinc-600 underline underline-offset-4 dark:text-zinc-400"
        >
          ← Dashboard
        </Link>
        <NewChatButton />
        <div className="flex flex-1 flex-col gap-1 overflow-y-auto">
          {chats.map((chat) => (
            <Link
              key={chat.id}
              href={`/chat/${chat.id}`}
              className={`truncate rounded-lg px-3 py-2 text-sm transition-colors ${
                chat.id === activeChatId
                  ? "bg-black/[.06] font-medium text-black dark:bg-white/[.1] dark:text-zinc-50"
                  : "text-zinc-600 hover:bg-black/[.04] dark:text-zinc-400 dark:hover:bg-white/[.06]"
              }`}
            >
              {chat.title}
            </Link>
          ))}
        </div>
      </aside>

      <div className="flex flex-1 flex-col">
        <div className="flex-1 overflow-y-auto px-6 py-6">
          <div className="mx-auto flex max-w-2xl flex-col gap-4">
            {messages.length === 0 && (
              <p className="text-center text-sm text-zinc-500 dark:text-zinc-500">
                Say something to start the conversation.
              </p>
            )}
            {messages
              .filter((m) => m.role !== "system")
              .map((m) => (
                <div
                  key={m.id}
                  className={`max-w-[80%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm ${
                    m.role === "user"
                      ? "ml-auto bg-foreground text-background"
                      : "mr-auto bg-black/[.05] text-black dark:bg-white/[.08] dark:text-zinc-50"
                  }`}
                >
                  {m.content}
                </div>
              ))}
            {sending && (
              <div className="mr-auto max-w-[80%] rounded-2xl bg-black/[.05] px-4 py-2.5 text-sm text-zinc-500 dark:bg-white/[.08] dark:text-zinc-400">
                Thinking…
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        </div>

        {error && (
          <div className="mx-auto w-full max-w-2xl px-6">
            <p className="mb-2 text-sm text-red-600 dark:text-red-400">{error}</p>
          </div>
        )}

        <form
          onSubmit={handleSend}
          className="mx-auto flex w-full max-w-2xl gap-2 px-6 pb-6"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Message MicroManus…"
            disabled={sending}
            className="h-11 flex-1 rounded-full border border-black/[.08] bg-transparent px-4 text-sm outline-none focus:border-black/30 disabled:opacity-60 dark:border-white/[.145] dark:focus:border-white/30"
          />
          <button
            type="submit"
            disabled={sending || input.trim().length === 0}
            className="flex h-11 shrink-0 items-center justify-center rounded-full bg-foreground px-5 text-sm font-medium text-background transition-colors hover:bg-[#383838] disabled:opacity-60 dark:hover:bg-[#ccc]"
          >
            Send
          </button>
        </form>
      </div>
    </div>
  );
}
