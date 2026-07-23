export function formatCost(cost: number): string {
  if (cost === 0) return "$0.00";
  return cost < 0.01 ? `$${cost.toFixed(4)}` : `$${cost.toFixed(2)}`;
}

export function formatTokens(n: number): string {
  return n.toLocaleString("en-US");
}
