import "server-only";
import { webSearch } from "./tools/web-search";
import { authHeaders, type ConnectionAuth } from "./connection-auth";

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
  // Set when this turn had to fall back to a plain (tool-free) answer
  // because tool calling kept failing — lets the caller show a friendly
  // notice instead of silently pretending nothing went wrong.
  toolsUnavailable?: boolean;
};

// Emitted live as the run progresses. "token" is a content delta for the
// in-progress final answer (never emitted for tool-call turns — see the
// streaming-mode note on callModel). "message" is a fully-formed, ready-to-
// persist turn (an assistant tool-call turn, a tool result, or the final
// answer) — callers should persist each one as it arrives rather than
// batching until the run ends. "error" ends the run without a "message".
export type AgentEvent =
  | { type: "token"; content: string }
  | { type: "message"; step: AgentStep }
  | { type: "error"; message: string };

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

// Injected only into the one-off fallback call after tool calling has
// genuinely failed (retry exhausted) — never persisted into the real
// conversation. Without this, models tend to hallucinate a plausible-looking
// search or a PDF report that was never actually created.
const TOOLS_UNAVAILABLE_NOTICE: AgentMessage = {
  role: "system",
  content:
    "Tool calling just failed and is unavailable for this reply — you have NOT " +
    "searched the web and you have NOT created a PDF report, no matter what you " +
    "were about to do. Do not narrate, imply, or claim otherwise. Tell the user " +
    "plainly that you couldn't use your tools for this message, then answer as " +
    "best you can from what you already know, noting the information may be " +
    "incomplete or not current.",
};

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

// Parses an SSE byte stream from the provider into individual JSON chunk
// objects, one per `data: {...}` line, stopping at the `[DONE]` sentinel.
// Handles chunk boundaries that split mid-line by buffering the remainder.
async function* readSseChunks(body: ReadableStream<Uint8Array>): AsyncGenerator<Record<string, unknown>> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
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
          if (payload === "[DONE]") return;
          try {
            yield JSON.parse(payload);
          } catch {
            // malformed chunk — skip it rather than aborting the whole stream
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

type CallResult =
  | { ok: true; message: { content: string | null; tool_calls?: ToolCall[] }; usage?: Usage }
  | { ok: false; message: string };

// Streams one model turn. Yields a "token" event for each content delta as
// it arrives (final-answer turns only — a turn that calls a tool produces no
// content to stream, so nothing is yielded until the tool_calls are fully
// assembled) and returns the completed turn once the provider's stream ends.
async function* callModel(
  endpoint: string,
  auth: ConnectionAuth,
  model: string,
  messages: AgentMessage[],
  tools: ToolDefinition[],
  allowTools: boolean,
): AsyncGenerator<{ type: "token"; content: string }, CallResult, void> {
  const base = endpoint.replace(/\/+$/, "");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60000);

  try {
    const res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders(auth),
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: 2048,
        stream: true,
        stream_options: { include_usage: true },
        // `tool_choice` is only valid when `tools` is also present — some
        // providers (OpenAI included) reject "tool_choice: none" on its
        // own with "'tool_choice' is only allowed when 'tools' are
        // specified". Omitting both when tools are disabled for this call
        // is simplest and has the same effect: the model has nothing to call.
        ...(allowTools ? { tools, tool_choice: "auto" } : {}),
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const data = await res.json().catch(() => null);
      const message =
        data?.error?.message ?? data?.message ?? `Request failed with status ${res.status}`;
      return { ok: false, message: String(message).slice(0, 500) };
    }

    if (!res.body) {
      return { ok: false, message: "Model returned an empty response" };
    }

    // A turn is either all content deltas or all tool_calls deltas in every
    // provider's real-world behavior (never both) — decided by whichever
    // arrives first, so we know whether to stream tokens live or accumulate
    // tool-call arguments silently until they're complete enough to parse.
    let mode: "unknown" | "content" | "tool_calls" = "unknown";
    let contentBuffer = "";
    const toolCallsAcc: { id?: string; name?: string; args: string }[] = [];
    let usage: Usage | undefined;

    for await (const chunk of readSseChunks(res.body)) {
      const choice = (chunk.choices as Array<Record<string, unknown>> | undefined)?.[0];
      const delta = choice?.delta as Record<string, unknown> | undefined;
      const deltaToolCalls = delta?.tool_calls as
        | Array<{ index?: number; id?: string; function?: { name?: string; arguments?: string } }>
        | undefined;

      if (deltaToolCalls) {
        if (mode === "unknown") mode = "tool_calls";
        for (const entry of deltaToolCalls) {
          const idx = entry.index ?? 0;
          toolCallsAcc[idx] ??= { args: "" };
          if (entry.id) toolCallsAcc[idx].id = entry.id;
          if (entry.function?.name) toolCallsAcc[idx].name = entry.function.name;
          if (entry.function?.arguments) toolCallsAcc[idx].args += entry.function.arguments;
        }
      } else if (typeof delta?.content === "string" && delta.content.length > 0) {
        if (mode === "unknown") mode = "content";
        if (mode === "content") {
          contentBuffer += delta.content;
          yield { type: "token", content: delta.content };
        }
      }

      if (chunk.usage) {
        usage = parseUsage(chunk);
      }
    }

    if (mode === "tool_calls" && toolCallsAcc.length > 0) {
      const toolCalls: ToolCall[] = toolCallsAcc
        .filter((c) => c.id && c.name)
        .map((c) => ({
          id: c.id!,
          type: "function",
          function: { name: c.name!, arguments: c.args },
        }));
      return { ok: true, message: { content: contentBuffer || null, tool_calls: toolCalls }, usage };
    }

    return { ok: true, message: { content: contentBuffer }, usage };
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

export async function* runAgent(
  endpoint: string,
  auth: ConnectionAuth,
  model: string,
  priorMessages: AgentMessage[],
  extraTools: ToolDefinition[] = [],
  extraExecutors: Record<string, ToolExecutor> = {},
): AsyncGenerator<AgentEvent, void> {
  const tools = [WEB_SEARCH_TOOL, ...extraTools];
  // The clean, wire-format history replayed to the provider.
  const conversation: AgentMessage[] = [...priorMessages];

  for (let i = 0; i < MAX_STEPS; i++) {
    const forceFinal = i === MAX_STEPS - 1;
    let result = yield* callModel(endpoint, auth, model, conversation, tools, !forceFinal);
    let toolsUnavailable = false;

    if (!result.ok && !forceFinal) {
      // Some providers (Groq especially, with smaller/weaker models)
      // intermittently reject a turn with a tool-call validation error
      // when the model produces malformed tool-call output. Retry once —
      // it's often transient — before giving up on tools for this turn.
      result = yield* callModel(endpoint, auth, model, conversation, tools, true);

      if (!result.ok) {
        // Still failing. Don't surface a raw provider error to the user —
        // finish the run with a plain, tool-free answer instead. The notice
        // is only sent for this call, not added to `conversation` — it's a
        // one-off instruction, not a real turn in the thread.
        result = yield* callModel(
          endpoint,
          auth,
          model,
          [...conversation, TOOLS_UNAVAILABLE_NOTICE],
          tools,
          false,
        );
        toolsUnavailable = true;
      }
    }

    if (!result.ok) {
      yield { type: "error", message: result.message };
      return;
    }

    const toolCalls = toolsUnavailable ? [] : (result.message.tool_calls ?? []);

    if (toolCalls.length === 0) {
      const assistantMessage: AgentMessage = {
        role: "assistant",
        content: result.message.content ?? "",
      };
      conversation.push(assistantMessage);
      yield { type: "message", step: { message: assistantMessage, usage: result.usage, toolsUnavailable } };
      return;
    }

    const assistantMessage: AgentMessage = {
      role: "assistant",
      content: result.message.content ?? "",
      tool_calls: toolCalls,
    };
    conversation.push(assistantMessage);
    yield { type: "message", step: { message: assistantMessage, usage: result.usage } };

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
      yield { type: "message", step: { message: toolMessage } };
    }
  }

  yield {
    type: "error",
    message: "The agent could not reach a final answer within the step limit.",
  };
}
