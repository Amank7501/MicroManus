export type Provider = "openai" | "anthropic" | "moonshot";

export type ProviderInfo = {
  id: Provider;
  label: string;
  defaultEndpoint: string;
  models: string[];
};

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
  },
  {
    id: "anthropic",
    label: "Claude (Anthropic)",
    defaultEndpoint: "https://api.anthropic.com/v1",
    models: ["claude-opus-4-8", "claude-sonnet-5", "claude-haiku-4-5-20251001"],
  },
  {
    id: "moonshot",
    label: "Kimi (Moonshot AI)",
    defaultEndpoint: "https://api.moonshot.ai/v1",
    models: ["kimi-latest", "kimi-k2-0711-preview", "moonshot-v1-128k"],
  },
];

export function getProvider(id: string): ProviderInfo | undefined {
  return PROVIDERS.find((p) => p.id === id);
}
