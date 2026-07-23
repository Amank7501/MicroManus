import "server-only";
import { authHeaders, type ConnectionAuth } from "./connection-auth";

export async function testConnection(
  endpoint: string,
  auth: ConnectionAuth,
  model: string,
): Promise<{ ok: boolean; message?: string }> {
  const base = endpoint.replace(/\/+$/, "");
  const url = `${base}/chat/completions`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders(auth),
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: "ping" }],
        max_tokens: 1,
      }),
      signal: controller.signal,
    });

    if (res.ok) {
      return { ok: true };
    }

    const body = await res.json().catch(() => null);
    const message =
      body?.error?.message ?? body?.message ?? `Request failed with status ${res.status}`;
    return { ok: false, message: String(message).slice(0, 300) };
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return {
        ok: false,
        message:
          "Timed out after 15s with no response. This request runs from our server, not " +
          "your browser — make sure the base URL is reachable from the internet (not just " +
          "your local network). A 'localhost' or private LAN address will hang like this " +
          "unless it's exposed via a tunnel (e.g. ngrok, Tailscale Funnel) or port-forwarded " +
          "with a public hostname.",
      };
    }
    const message = err instanceof Error ? err.message : "Connection failed";
    return { ok: false, message: message.slice(0, 300) };
  } finally {
    clearTimeout(timeout);
  }
}
