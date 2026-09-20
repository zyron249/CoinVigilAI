export function formatUsd(value: number | null | undefined, digits = 2): string {
  if (value == null || Number.isNaN(value)) return "—";
  const abs = Math.abs(value);
  const maximumFractionDigits = abs >= 1 ? digits : abs >= 0.01 ? 4 : 6;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits,
  }).format(value);
}

export function formatCompactUsd(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  return `$${new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(value)}`;
}

export function formatCompact(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatPercent(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  const prefix = value > 0 ? "+" : "";
  return `${prefix}${value.toFixed(2)}%`;
}

export function changeClass(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value) || value === 0) return "muted";
  return value > 0 ? "positive" : "negative";
}

export function sourceLabel(source: string | undefined): { text: string; demo: boolean } {
  if (source === "coingecko") return { text: "● Live · CoinGecko", demo: false };
  if (source === "cache") return { text: "● Cache · CoinGecko", demo: false };
  if (source === "demo") return { text: "○ Demo snapshot", demo: true };
  return { text: `○ ${source || "unknown"}`, demo: true };
}
