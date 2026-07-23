import "server-only";
import { webSearch } from "./tools/web-search";

export type ToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

export type AgentMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string; tool_calls?: ToolCall[] }
  | { role: "tool"; content: string; tool_call_id: string };

const TOOLS = [
  {
    type: "function",
    function: {
      name: "web_search",
      description:
        "Search the web for current information, news, statistics, or facts you are not confident about. Returns a list of results with title, url, and a content snippet.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "The search query" },
        },
        required: ["query"],
      },
    },
  },
];

// One iteration = one model call. A tool-call round and the forced final
// answer each consume one, so this allows a few searches before wrapping up.
const MAX_STEPS = 5;

async function callModel(
  endpoint: string,
  apiKey: string,
  model: string,
  messages: AgentMessage[],
  allowTools: boolean,
): Promise<
  | { ok: true; message: { content: string | null; tool_calls?: ToolCall[] } }
  | { ok: false; message: string }
> {
  const base = endpoint.replace(/\/+$/, "");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60000);

  try {
    const res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: 2048,
        ...(allowTools ? { tools: TOOLS, tool_choice: "auto" } : { tool_choice: "none" }),
      }),
      signal: controller.signal,
    });

    const data = await res.json().catch(() => null);

    if (!res.ok) {
      const message =
        data?.error?.message ?? data?.message ?? `Request failed with status ${res.status}`;
      return { ok: false, message: String(message).slice(0, 500) };
    }

    const message = data?.choices?.[0]?.message;
    if (!message) {
      return { ok: false, message: "Model returned an empty response" };
    }

    return { ok: true, message };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Request failed";
    return { ok: false, message: message.slice(0, 500) };
  } finally {
    clearTimeout(timeout);
  }
}

export async function runAgent(
  endpoint: string,
  apiKey: string,
  model: string,
  priorMessages: AgentMessage[],
): Promise<
  | { ok: true; newMessages: AgentMessage[] }
  | { ok: false; message: string; newMessages: AgentMessage[] }
> {
  const conversation: AgentMessage[] = [...priorMessages];
  const startLength = conversation.length;

  for (let i = 0; i < MAX_STEPS; i++) {
    const forceFinal = i === MAX_STEPS - 1;
    const result = await callModel(endpoint, apiKey, model, conversation, !forceFinal);

    if (!result.ok) {
      return { ok: false, message: result.message, newMessages: conversation.slice(startLength) };
    }

    const toolCalls = result.message.tool_calls ?? [];

    if (toolCalls.length === 0) {
      conversation.push({ role: "assistant", content: result.message.content ?? "" });
      return { ok: true, newMessages: conversation.slice(startLength) };
    }

    conversation.push({
      role: "assistant",
      content: result.message.content ?? "",
      tool_calls: toolCalls,
    });

    const toolResults = await Promise.all(
      toolCalls.map(async (call) => {
        let query = "";
        try {
          query = JSON.parse(call.function.arguments || "{}").query ?? "";
        } catch {
          // malformed arguments — search with an empty query below, which
          // will just come back empty rather than crashing the loop.
        }

        try {
          const results = await webSearch(query);
          return { call, raw: JSON.stringify(results) };
        } catch (err) {
          const message = err instanceof Error ? err.message : "Search failed";
          return { call, raw: JSON.stringify({ error: message }) };
        }
      }),
    );

    for (const { call, raw } of toolResults) {
      conversation.push({ role: "tool", tool_call_id: call.id, content: raw });
    }
  }

  return {
    ok: false,
    message: "The agent could not reach a final answer within the step limit.",
    newMessages: conversation.slice(startLength),
  };
}
