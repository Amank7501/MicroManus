export type Provider = "openai" | "anthropic" | "moonshot" | "groq" | "ollama";

export type AuthType = "api_key" | "basic";

export type ProviderInfo = {
  id: Provider;
  label: string;
  defaultEndpoint: string;
  models: string[];
  authType: AuthType;
};

export function getAuthType(provider: string): AuthType {
  return getProvider(provider)?.authType ?? "api_key";
}

// Defaults for each provider's OpenAI-compatible chat-completions endpoint,
// and a short list of current popular models. Users can override the
// endpoint (e.g. to point at a proxy) and can type a custom model id if
// the one they want isn't listed.
export const PROVIDERS: ProviderInfo[] = [
  {
    id: "openai",
    label: "OpenAI",
    defaultEndpoint: "https://api.openai.com/v1",
    models: ["gpt-5.1", "gpt-5.1-mini", "gpt-4o", "gpt-4o-mini"],
    authType: "api_key",
  },
  {
    id: "anthropic",
    label: "Claude (Anthropic)",
    defaultEndpoint: "https://api.anthropic.com/v1",
    models: ["claude-opus-4-8", "claude-sonnet-5", "claude-haiku-4-5-20251001"],
    authType: "api_key",
  },
  {
    id: "moonshot",
    label: "Kimi (Moonshot AI)",
    defaultEndpoint: "https://api.moonshot.ai/v1",
    models: ["kimi-latest", "kimi-k2-0711-preview", "moonshot-v1-128k"],
    authType: "api_key",
  },
  {
    id: "groq",
    label: "Groq",
    defaultEndpoint: "https://api.groq.com/openai/v1",
    models: ["llama-3.3-70b-versatile", "openai/gpt-oss-120b"],
    authType: "api_key",
  },
  {
    id: "ollama",
    label: "Ollama (local only — needs a public URL)",
    defaultEndpoint: "http://localhost:11434/v1",
    // No preset list — the user types whatever model they've pulled locally.
    models: [],
    authType: "basic",
  },
];

export function getProvider(id: string): ProviderInfo | undefined {
  return PROVIDERS.find((p) => p.id === id);
}
