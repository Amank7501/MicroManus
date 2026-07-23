"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import NewChatButton from "./new-chat-button";

type ToolCallInfo = { id: string; function: { name: string; arguments: string } };

type Message = {
  id: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  tool_calls?: ToolCallInfo[] | null;
  tool_call_id?: string | null;
  created_at: string;
};

type ReportSummary = {
  id: string;
  title: string;
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
  initialReports: ReportSummary[];
  initialBalance: number;
};

type FeedItem =
  | { type: "message"; created_at: string; message: Message }
  | { type: "report"; created_at: string; report: ReportSummary };

function searchQueryFrom(message: Message): string {
  try {
    const args = message.tool_calls?.[0]?.function.arguments ?? "{}";
    return JSON.parse(args).query ?? "";
  } catch {
    return "";
  }
}

function searchResultCountFrom(message: Message): number | null {
  try {
    const parsed = JSON.parse(message.content);
    return Array.isArray(parsed) ? parsed.length : null;
  } catch {
    return null;
  }
}

export default function ChatView({
  chats,
  activeChatId,
  initialMessages,
  initialReports,
  initialBalance,
}: Props) {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [reports, setReports] = useState<ReportSummary[]>(initialReports);
  const [balance, setBalance] = useState(initialBalance);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, reports]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const content = input.trim();
    if (!content || sending || balance <= 0) return;

    setError(null);
    setWarning(null);
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

    setMessages((prev) => [
      ...prev.map((m) => (m.id === tempId ? data.userMessage ?? m : m)),
      ...(data.steps ?? []),
    ]);

    if (data.reports && data.reports.length > 0) {
      setReports((prev) => [...prev, ...data.reports]);
    }

    if (typeof data.balance === "number") setBalance(data.balance);
    if (!res.ok) setError(data.error ?? "Something went wrong");
    if (data.warning) setWarning(data.warning);
  }

  const feed: FeedItem[] = [
    ...messages
      .filter((m) => m.role !== "system")
      .map((message): FeedItem => ({ type: "message", created_at: message.created_at, message })),
    ...reports.map((report): FeedItem => ({ type: "report", created_at: report.created_at, report })),
  ].sort((a, b) => a.created_at.localeCompare(b.created_at));

  return (
    <div className="flex h-dvh flex-1 bg-zinc-50 font-sans dark:bg-black">
      <aside className="flex w-64 shrink-0 flex-col gap-3 border-r border-black/[.08] p-4 dark:border-white/[.145]">
        <div className="flex items-center justify-between">
          <Link
            href="/dashboard"
            className="text-sm font-medium text-zinc-600 underline underline-offset-4 dark:text-zinc-400"
          >
            ← Dashboard
          </Link>
          <span className="rounded-full border border-black/[.08] px-2.5 py-0.5 text-xs font-medium dark:border-white/[.145]">
            {balance} credit{balance === 1 ? "" : "s"}
          </span>
        </div>
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
          <div className="mx-auto flex max-w-2xl flex-col gap-3">
            {feed.length === 0 && (
              <p className="text-center text-sm text-zinc-500 dark:text-zinc-500">
                Say something to start the conversation.
              </p>
            )}
            {feed.map((item) => {
              if (item.type === "report") {
                return (
                  <a
                    key={`report-${item.report.id}`}
                    href={`/api/reports/${item.report.id}`}
                    className="mr-auto flex items-center gap-2 rounded-xl border border-black/[.08] bg-white px-4 py-3 text-sm transition-colors hover:bg-black/[.03] dark:border-white/[.145] dark:bg-zinc-900 dark:hover:bg-white/[.06]"
                  >
                    <span>📄</span>
                    <span className="font-medium text-black dark:text-zinc-50">
                      {item.report.title}
                    </span>
                    <span className="text-zinc-500 underline underline-offset-4 dark:text-zinc-400">
                      Download PDF
                    </span>
                  </a>
                );
              }

              const m = item.message;

              if (m.role === "assistant" && m.tool_calls && m.tool_calls.length > 0) {
                const query = searchQueryFrom(m);
                return (
                  <div key={m.id} className="mr-auto text-xs italic text-zinc-500 dark:text-zinc-400">
                    🔍 Searching the web for “{query}”…
                  </div>
                );
              }

              if (m.role === "tool") {
                const count = searchResultCountFrom(m);
                return (
                  <div key={m.id} className="mr-auto text-xs italic text-zinc-500 dark:text-zinc-400">
                    {count !== null ? `✅ Found ${count} result${count === 1 ? "" : "s"}` : "⚠️ Search failed"}
                  </div>
                );
              }

              return (
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
              );
            })}
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

        {warning && (
          <div className="mx-auto w-full max-w-2xl px-6">
            <p className="mb-2 text-sm text-amber-600 dark:text-amber-400">⚠️ {warning}</p>
          </div>
        )}

        {balance <= 0 && (
          <div className="mx-auto w-full max-w-2xl px-6">
            <p className="mb-2 text-sm text-zinc-600 dark:text-zinc-400">
              You&apos;re out of credits — more ways to add credits are coming soon.
            </p>
          </div>
        )}

        <form onSubmit={handleSend} className="mx-auto flex w-full max-w-2xl gap-2 px-6 pb-6">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Message MicroManus…"
            disabled={sending || balance <= 0}
            className="h-11 flex-1 rounded-full border border-black/[.08] bg-transparent px-4 text-sm outline-none focus:border-black/30 disabled:opacity-60 dark:border-white/[.145] dark:focus:border-white/30"
          />
          <button
            type="submit"
            disabled={sending || balance <= 0 || input.trim().length === 0}
            className="flex h-11 shrink-0 items-center justify-center rounded-full bg-foreground px-5 text-sm font-medium text-background transition-colors hover:bg-[#383838] disabled:opacity-60 dark:hover:bg-[#ccc]"
          >
            Send
          </button>
        </form>
      </div>
    </div>
  );
}
