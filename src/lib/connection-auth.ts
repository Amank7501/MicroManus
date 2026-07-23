import "server-only";

// Most providers (OpenAI, Anthropic, Kimi, Groq) use a bearer API key.
// Self-hosted Ollama typically sits behind a reverse proxy with HTTP Basic
// Auth instead — or nothing at all for a local, unprotected instance.
export type ConnectionAuth =
  | { type: "bearer"; token: string }
  | { type: "basic"; username: string; password: string }
  | { type: "none" };

export function authHeaders(auth: ConnectionAuth): Record<string, string> {
  if (auth.type === "bearer") {
    return { Authorization: `Bearer ${auth.token}` };
  }
  if (auth.type === "basic") {
    const encoded = Buffer.from(`${auth.username}:${auth.password}`).toString("base64");
    return { Authorization: `Basic ${encoded}` };
  }
  return {};
}
