"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import NewChatButton from "./new-chat-button";
import ToolStep from "./tool-step";
import Markdown from "./markdown";

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

type ToolStepData = {
  kind: "search" | "pdf" | "unknown";
  label: string;
  status: "ok" | "error";
};

type FeedItem =
  | { type: "message"; created_at: string; message: Message }
  | { type: "report"; created_at: string; report: ReportSummary }
  | { type: "step"; created_at: string; key: string; step: ToolStepData };

function hasToolCalls(m: Message): boolean {
  return Boolean(m.tool_calls && m.tool_calls.length > 0);
}

function stepFromToolCall(call: ToolCallInfo, toolMessage: Message | undefined): ToolStepData {
  let args: Record<string, unknown> = {};
  try {
    args = JSON.parse(call.function.arguments || "{}");
  } catch {
    // malformed arguments — fall through with an empty object
  }

  let result: unknown = null;
  if (toolMessage) {
    try {
      result = JSON.parse(toolMessage.content);
    } catch {
      result = null;
    }
  }

  if (call.function.name === "web_search") {
    const query = typeof args.query === "string" ? args.query : "";
    if (!toolMessage) {
      return { kind: "search", label: `Searching the web for “${query}”…`, status: "ok" };
    }
    if (Array.isArray(result)) {
      const count = result.length;
      return {
        kind: "search",
        label: `Searched the web for “${query}” — found ${count} result${count === 1 ? "" : "s"}`,
        status: "ok",
      };
    }
    return { kind: "search", label: `Search failed for “${query}”`, status: "error" };
  }

  if (call.function.name === "create_pdf_report") {
    const title = typeof args.title === "string" && args.title ? args.title : "report";
    if (!toolMessage) {
      return { kind: "pdf", label: `Generating a PDF report — “${title}”…`, status: "ok" };
    }
    const failed = Boolean(
      result && typeof result === "object" && "error" in (result as Record<string, unknown>),
    );
    return failed
      ? { kind: "pdf", label: `Could not generate the PDF — “${title}”`, status: "error" }
      : { kind: "pdf", label: `Generated a PDF report — “${title}”`, status: "ok" };
  }

  return { kind: "unknown", label: call.function.name, status: "ok" };
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
  const [streamingContent, setStreamingContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, reports, streamingContent]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const content = input.trim();
    if (!content || sending || balance <= 0) return;

    setError(null);
    setWarning(null);
    setSending(true);
    setStreamingContent(null);
    setInput("");

    const tempId = `temp-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      { id: tempId, role: "user", content, created_at: new Date().toISOString() },
    ]);

    let receivedAnyEvent = false;

    try {
      const res = await fetch(`/api/chats/${activeChatId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });

      const isStream = res.headers.get("content-type")?.includes("text/event-stream");

      if (!isStream) {
        // Early-exit error path (auth/validation/credits/missing key/etc.)
        // — a plain JSON error response, same shape as before streaming.
        const data = await res.json().catch(() => ({}));
        setSending(false);
        setMessages((prev) => prev.filter((m) => m.id !== tempId));
        setInput(content);
        setError(data.error ?? "Something went wrong");
        return;
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let boundary: number;
        while ((boundary = buffer.indexOf("\n\n")) !== -1) {
          const rawEvent = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);

          for (const line of rawEvent.split("\n")) {
            const trimmed = line.trim();
            if (!trimmed.startsWith("data:")) continue;
            const payload = trimmed.slice(5).trim();
            if (!payload) continue;

            let event: Record<string, unknown>;
            try {
              event = JSON.parse(payload);
            } catch {
              continue;
            }
            receivedAnyEvent = true;

            if (event.type === "user_message") {
              const msg = event.message as Message;
              setMessages((prev) => prev.map((m) => (m.id === tempId ? msg : m)));
            } else if (event.type === "token") {
              setStreamingContent((prev) => (prev ?? "") + (event.content as string));
            } else if (event.type === "message") {
              const msg = event.message as Message;
              setMessages((prev) => [...prev, msg]);
              if (msg.role === "assistant" && !hasToolCalls(msg)) {
                setStreamingContent(null);
              }
            } else if (event.type === "report") {
              setReports((prev) => [...prev, event.report as ReportSummary]);
            } else if (event.type === "error") {
              setError(event.error as string);
            } else if (event.type === "done") {
              setSending(false);
              setStreamingContent(null);
              if (typeof event.balance === "number") setBalance(event.balance);
              if (event.warning) setWarning(event.warning as string);
            }
          }
        }
      }

      setSending(false);
      setStreamingContent(null);
    } catch {
      // Network failure, or the connection dropped mid-stream. Don't leave
      // the UI stuck forever — if nothing came back at all, treat it like
      // the send never happened; if we're mid-run, just surface the error
      // and leave what's already arrived in place.
      setSending(false);
      setStreamingContent(null);
      if (!receivedAnyEvent) {
        setMessages((prev) => prev.filter((m) => m.id !== tempId));
        setInput(content);
      }
      setError("Couldn't reach the server. Check your connection and try again.");
    }
  }

  const toolMessagesById = new Map<string, Message>();
  for (const m of messages) {
    if (m.role === "tool" && m.tool_call_id) {
      toolMessagesById.set(m.tool_call_id, m);
    }
  }

  const feed: FeedItem[] = [];
  for (const m of messages) {
    if (m.role === "system" || m.role === "tool") continue;

    if (m.role === "assistant" && hasToolCalls(m)) {
      for (const call of m.tool_calls!) {
        feed.push({
          type: "step",
          created_at: m.created_at,
          key: call.id,
          step: stepFromToolCall(call, toolMessagesById.get(call.id)),
        });
      }
      continue;
    }

    feed.push({ type: "message", created_at: m.created_at, message: m });
  }
  for (const report of reports) {
    feed.push({ type: "report", created_at: report.created_at, report });
  }
  feed.sort((a, b) => a.created_at.localeCompare(b.created_at));

  const isThinking =
    sending && streamingContent === null && messages[messages.length - 1]?.role === "user";

  return (
    <div className="flex h-dvh flex-1 bg-zinc-50 font-sans dark:bg-black">
      <aside className="flex w-72 shrink-0 flex-col gap-4 border-r border-black/[.08] p-4 dark:border-white/[.145]">
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
          <p className="px-3 pb-1 text-xs font-medium text-zinc-400 dark:text-zinc-500">Chats</p>
          {chats.map((chat) => (
            <Link
              key={chat.id}
              href={`/chat/${chat.id}`}
              className={`truncate rounded-xl px-3 py-2 text-sm transition-colors ${
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
        <div className="flex-1 overflow-y-auto px-6 py-8">
          <div className="mx-auto flex max-w-3xl flex-col gap-4">
            {feed.length === 0 && streamingContent === null && (
              <p className="text-center text-sm text-zinc-500 dark:text-zinc-500">
                Ask a research question — I can search the web for current information and
                put together a downloadable PDF report if you ask for one.
              </p>
            )}
            {feed.map((item) => {
              if (item.type === "report") {
                return (
                  <a
                    key={`report-${item.report.id}`}
                    href={`/api/reports/${item.report.id}`}
                    className="mr-auto flex items-center gap-2.5 rounded-xl border border-black/[.08] bg-white px-4 py-3 text-sm transition-colors hover:bg-black/[.03] dark:border-white/[.145] dark:bg-zinc-900 dark:hover:bg-white/[.06]"
                  >
                    <span aria-hidden>📄</span>
                    <span className="font-medium text-black dark:text-zinc-50">
                      {item.report.title}
                    </span>
                    <span className="text-zinc-500 underline underline-offset-4 dark:text-zinc-400">
                      Download PDF
                    </span>
                  </a>
                );
              }

              if (item.type === "step") {
                return <ToolStep key={item.key} {...item.step} />;
              }

              const m = item.message;

              if (m.role === "user") {
                return (
                  <div
                    key={m.id}
                    className="ml-auto max-w-[75%] whitespace-pre-wrap rounded-2xl bg-foreground px-4 py-2.5 text-sm text-background"
                  >
                    {m.content}
                  </div>
                );
              }

              return (
                <div key={m.id} className="mr-auto w-full">
                  <div className="mb-1.5 flex items-center gap-2">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-foreground text-[10px] font-medium text-background">
                      M
                    </span>
                    <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                      MicroManus
                    </span>
                  </div>
                  <div className="pl-7 text-black dark:text-zinc-50">
                    <Markdown content={m.content} />
                  </div>
                </div>
              );
            })}
            {streamingContent !== null && (
              <div className="mr-auto w-full">
                <div className="mb-1.5 flex items-center gap-2">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-foreground text-[10px] font-medium text-background">
                    M
                  </span>
                  <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                    MicroManus
                  </span>
                </div>
                <div className="pl-7 text-black dark:text-zinc-50">
                  <Markdown content={streamingContent} />
                </div>
              </div>
            )}
            {isThinking && (
              <div className="mr-auto flex items-center gap-2 pl-7 text-sm text-zinc-500 dark:text-zinc-400">
                Thinking…
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        </div>

        {error && (
          <div className="mx-auto w-full max-w-3xl px-6">
            <p className="mb-2 text-sm text-red-600 dark:text-red-400">{error}</p>
          </div>
        )}

        {warning && (
          <div className="mx-auto w-full max-w-3xl px-6">
            <p className="mb-2 text-sm text-amber-600 dark:text-amber-400">⚠️ {warning}</p>
          </div>
        )}

        {balance <= 0 && (
          <div className="mx-auto w-full max-w-3xl px-6">
            <p className="mb-2 text-sm text-zinc-600 dark:text-zinc-400">
              You&apos;re out of credits — more ways to add credits are coming soon.
            </p>
          </div>
        )}

        <form onSubmit={handleSend} className="mx-auto flex w-full max-w-3xl gap-2 px-6 pb-6">
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
