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

export type SourceTone = "live" | "cache" | "demo" | "down";

export function formatDate(value?: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

export function formatTimestamp(value?: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  }).format(date);
}

export function sourceLabel(
  source: string | undefined,
  opts?: { stale?: boolean },
): { text: string; tone: SourceTone; demo: boolean } {
  if (opts?.stale && (source === "coingecko" || source === "cache")) {
    return { text: "Stale · last live CoinGecko", tone: "cache", demo: false };
  }
  if (source === "coingecko") return { text: "Live · CoinGecko", tone: "live", demo: false };
  if (source === "cache") return { text: "Cached · CoinGecko", tone: "cache", demo: false };
  if (source === "demo") return { text: "Demo snapshot", tone: "demo", demo: true };
  if (!source || source === "unavailable" || source === "unknown") {
    return { text: "Data unavailable", tone: "down", demo: false };
  }
  return { text: source, tone: "down", demo: false };
}
