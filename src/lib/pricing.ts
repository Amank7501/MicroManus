// Per-1M-token rates (USD). Edit freely as providers change pricing — this
// is the single place that needs updating. Unknown/custom models fall back
// to $0 rather than throwing, so cost simply shows as $0.00 instead of
// breaking the page.
//
// Anthropic and OpenAI rates below were verified 2026-07-23. Cached ≈ 10%
// of the input rate for all of them (Anthropic/OpenAI's usual prompt-cache
// discount), unless a provider publishes something different.
//
// claude-sonnet-5 is on an introductory rate ($2/$10) that expires
// 2026-08-31 — after that it reverts to $3/$15 (the same as
// claude-sonnet-4-6). Update this entry once the intro period ends.
export type ModelPricing = {
  input: number;
  output: number;
  cached: number;
};

export const MODEL_PRICING: Record<string, ModelPricing> = {
  // --- OpenAI (verified 2026-07-23) ---
  "gpt-5.6-sol": { input: 5, output: 30, cached: 0.5 },
  "gpt-5.6-terra": { input: 2.5, output: 15, cached: 0.25 },
  "gpt-5.6-luna": { input: 1, output: 6, cached: 0.1 },
  "gpt-5.5": { input: 5, output: 30, cached: 0.5 },
  "gpt-5.1": { input: 1.25, output: 10, cached: 0.125 },
  // Not independently verified — kept as before so they don't fall back to $0.
  "gpt-5.1-mini": { input: 0.25, output: 1, cached: 0.125 },
  "gpt-4o": { input: 2.5, output: 10, cached: 1.25 },
  "gpt-4o-mini": { input: 0.15, output: 0.6, cached: 0.075 },

  // --- Anthropic / Claude (verified 2026-07-23) ---
  "claude-opus-4-8": { input: 5, output: 25, cached: 0.5 },
  // Introductory rate — expires 2026-08-31, then $3/$15 (see comment above).
  "claude-sonnet-5": { input: 2, output: 10, cached: 0.2 },
  "claude-sonnet-4-6": { input: 3, output: 15, cached: 0.3 },
  "claude-haiku-4-5-20251001": { input: 1, output: 5, cached: 0.1 },
  "claude-fable-5": { input: 10, output: 50, cached: 1.0 },

  // --- Kimi (Moonshot AI) — not independently verified ---
  "kimi-latest": { input: 0.6, output: 2.5, cached: 0.15 },
  "kimi-k2-0711-preview": { input: 0.6, output: 2.5, cached: 0.15 },
  "moonshot-v1-128k": { input: 2, output: 5, cached: 0.5 },

  // --- Groq — not independently verified ---
  // Groq doesn't publicly advertise a separate cached-token discount, so
  // cached is set equal to input (no discount) rather than guessing one.
  "llama-3.3-70b-versatile": { input: 0.59, output: 0.79, cached: 0.59 },
  "openai/gpt-oss-120b": { input: 0.15, output: 0.75, cached: 0.15 },
};

const DEFAULT_PRICING: ModelPricing = { input: 0, output: 0, cached: 0 };

export function getPricing(model: string): ModelPricing {
  return MODEL_PRICING[model] ?? DEFAULT_PRICING;
}

// `input` includes cached tokens (per the OpenAI usage shape), so the
// "fresh" input billed at the full rate excludes whatever was cached.
export function computeCost(
  model: string,
  input: number,
  output: number,
  cached: number,
): number {
  const pricing = getPricing(model);
  const freshInput = Math.max(input - cached, 0);

  return (
    (freshInput / 1_000_000) * pricing.input +
    (cached / 1_000_000) * pricing.cached +
    (output / 1_000_000) * pricing.output
  );
}
