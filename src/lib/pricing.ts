// Approximate public per-1M-token rates (USD), as of this build. Edit
// freely as providers change pricing — this is the single place that
// needs updating. Unknown/custom models fall back to $0 rather than
// throwing, so cost simply shows as $0.00 instead of breaking the page.
export type ModelPricing = {
  input: number;
  output: number;
  cached: number;
};

export const MODEL_PRICING: Record<string, ModelPricing> = {
  "gpt-5.1": { input: 5, output: 15, cached: 2.5 },
  "gpt-5.1-mini": { input: 0.25, output: 1, cached: 0.125 },
  "gpt-4o": { input: 2.5, output: 10, cached: 1.25 },
  "gpt-4o-mini": { input: 0.15, output: 0.6, cached: 0.075 },
  "claude-opus-4-8": { input: 15, output: 75, cached: 1.5 },
  "claude-sonnet-5": { input: 3, output: 15, cached: 0.3 },
  "claude-haiku-4-5-20251001": { input: 1, output: 5, cached: 0.1 },
  "kimi-latest": { input: 0.6, output: 2.5, cached: 0.15 },
  "kimi-k2-0711-preview": { input: 0.6, output: 2.5, cached: 0.15 },
  "moonshot-v1-128k": { input: 2, output: 5, cached: 0.5 },
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
