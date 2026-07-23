import "server-only";

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export async function chatCompletion(
  endpoint: string,
  apiKey: string,
  model: string,
  messages: ChatMessage[],
): Promise<{ ok: true; content: string } | { ok: false; message: string }> {
  const base = endpoint.replace(/\/+$/, "");
  const url = `${base}/chat/completions`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60000);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model, messages, max_tokens: 1024 }),
      signal: controller.signal,
    });

    const data = await res.json().catch(() => null);

    if (!res.ok) {
      const message =
        data?.error?.message ?? data?.message ?? `Request failed with status ${res.status}`;
      return { ok: false, message: String(message).slice(0, 500) };
    }

    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== "string" || content.length === 0) {
      return { ok: false, message: "Model returned an empty response" };
    }

    return { ok: true, content };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Request failed";
    return { ok: false, message: message.slice(0, 500) };
  } finally {
    clearTimeout(timeout);
  }
}
