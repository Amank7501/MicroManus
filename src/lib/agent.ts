import "server-only";
import { webSearch } from "./tools/web-search";

export type ToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

export type Usage = { input: number; output: number; cached: number };

// Exactly the shape sent to (and echoed back into) the provider's API —
// no extra fields. Providers reject unknown properties on replayed
// messages (e.g. "'messages.2': property 'usage' is unsupported"), so
// anything not part of the wire format (like token usage) must be
// tracked separately — see AgentStep below.
export type AgentMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string; tool_calls?: ToolCall[] }
  | { role: "tool"; content: string; tool_call_id: string };

export type AgentStep = {
  message: AgentMessage;
  usage?: Usage;
};

export type ToolDefinition = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

export type ToolExecutor = (args: Record<string, unknown>) => Promise<string>;

const WEB_SEARCH_TOOL: ToolDefinition = {
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
};

// One iteration = one model call. A tool-call round and the forced final
// answer each consume one, so this allows a few searches before wrapping up.
const MAX_STEPS = 5;

function parseUsage(data: Record<string, unknown> | null): Usage | undefined {
  const usage = data?.usage as Record<string, unknown> | undefined;
  if (!usage) return undefined;

  const details = usage.prompt_tokens_details as Record<string, unknown> | undefined;
  const cached = details?.cached_tokens ?? usage.cached_tokens ?? 0;

  return {
    input: Number(usage.prompt_tokens ?? 0),
    output: Number(usage.completion_tokens ?? 0),
    cached: Number(cached),
  };
}

async function callModel(
  endpoint: string,
  apiKey: string,
  model: string,
  messages: AgentMessage[],
  tools: ToolDefinition[],
  allowTools: boolean,
): Promise<
  | { ok: true; message: { content: string | null; tool_calls?: ToolCall[] }; usage?: Usage }
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
        ...(allowTools ? { tools, tool_choice: "auto" } : { tool_choice: "none" }),
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

    return { ok: true, message, usage: parseUsage(data) };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Request failed";
    return { ok: false, message: message.slice(0, 500) };
  } finally {
    clearTimeout(timeout);
  }
}

async function executeTool(
  name: string,
  args: Record<string, unknown>,
  extraExecutors: Record<string, ToolExecutor>,
): Promise<string> {
  if (name === "web_search") {
    const query = typeof args.query === "string" ? args.query : "";
    try {
      const results = await webSearch(query);
      return JSON.stringify(results);
    } catch (err) {
      return JSON.stringify({ error: err instanceof Error ? err.message : "Search failed" });
    }
  }

  const executor = extraExecutors[name];
  if (!executor) {
    return JSON.stringify({ error: `Unknown tool: ${name}` });
  }

  try {
    return await executor(args);
  } catch (err) {
    return JSON.stringify({ error: err instanceof Error ? err.message : "Tool failed" });
  }
}

export async function runAgent(
  endpoint: string,
  apiKey: string,
  model: string,
  priorMessages: AgentMessage[],
  extraTools: ToolDefinition[] = [],
  extraExecutors: Record<string, ToolExecutor> = {},
): Promise<
  | { ok: true; newMessages: AgentStep[] }
  | { ok: false; message: string; newMessages: AgentStep[] }
> {
  const tools = [WEB_SEARCH_TOOL, ...extraTools];
  // `conversation` is the clean, wire-format history replayed to the
  // provider. `steps` mirrors every entry appended beyond priorMessages,
  // pairing it with usage where applicable — this is what callers persist.
  const conversation: AgentMessage[] = [...priorMessages];
  const steps: AgentStep[] = [];

  for (let i = 0; i < MAX_STEPS; i++) {
    const forceFinal = i === MAX_STEPS - 1;
    const result = await callModel(endpoint, apiKey, model, conversation, tools, !forceFinal);

    if (!result.ok) {
      return { ok: false, message: result.message, newMessages: steps };
    }

    const toolCalls = result.message.tool_calls ?? [];

    if (toolCalls.length === 0) {
      const assistantMessage: AgentMessage = {
        role: "assistant",
        content: result.message.content ?? "",
      };
      conversation.push(assistantMessage);
      steps.push({ message: assistantMessage, usage: result.usage });
      return { ok: true, newMessages: steps };
    }

    const assistantMessage: AgentMessage = {
      role: "assistant",
      content: result.message.content ?? "",
      tool_calls: toolCalls,
    };
    conversation.push(assistantMessage);
    steps.push({ message: assistantMessage, usage: result.usage });

    const toolResults = await Promise.all(
      toolCalls.map(async (call) => {
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(call.function.arguments || "{}");
        } catch {
          // malformed arguments — the executor gets an empty object and
          // will produce an error result rather than crashing the loop.
        }

        const raw = await executeTool(call.function.name, args, extraExecutors);
        return { call, raw };
      }),
    );

    for (const { call, raw } of toolResults) {
      const toolMessage: AgentMessage = { role: "tool", tool_call_id: call.id, content: raw };
      conversation.push(toolMessage);
      steps.push({ message: toolMessage });
    }
  }

  return {
    ok: false,
    message: "The agent could not reach a final answer within the step limit.",
    newMessages: steps,
  };
}
