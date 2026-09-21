export const ALERTS_KEY = "coinvigil.alerts.v1";
export const ALERTS_EVENT = "coinvigil:alerts";
export const ALERTS_LIMIT = 20;

export type AlertKind = "above" | "below" | "change_24h";

export type PriceAlert = {
  id: string;
  coinId: string;
  symbol: string;
  name: string;
  kind: AlertKind;
  threshold: number;
  createdAt: string;
};

export function parseAlerts(raw: string | null): PriceAlert[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    const rows = Array.isArray(parsed) ? parsed : (parsed as { items?: unknown }).items;
    if (!Array.isArray(rows)) return [];
    const seen = new Set<string>();
    const items: PriceAlert[] = [];
    for (const row of rows) {
      if (!row || typeof row !== "object") continue;
      const coinId = String((row as PriceAlert).coinId || "").trim().toLowerCase();
      const kind = String((row as PriceAlert).kind || "").trim() as AlertKind;
      const threshold = Number((row as PriceAlert).threshold);
      if (!coinId || !["above", "below", "change_24h"].includes(kind) || !Number.isFinite(threshold)) continue;
      const id = String((row as PriceAlert).id || `${coinId}-${kind}-${threshold}`).slice(0, 80);
      if (seen.has(id)) continue;
      seen.add(id);
      items.push({
        id,
        coinId,
        symbol: String((row as PriceAlert).symbol || coinId).slice(0, 16),
        name: String((row as PriceAlert).name || coinId).slice(0, 80),
        kind,
        threshold,
        createdAt: String((row as PriceAlert).createdAt || ""),
      });
      if (items.length >= ALERTS_LIMIT) break;
    }
    return items;
  } catch {
    return [];
  }
}

export function serializeAlerts(items: PriceAlert[]): string {
  return JSON.stringify({ items: items.slice(0, ALERTS_LIMIT) });
}

export function alertFired(alert: PriceAlert, price: number | null | undefined, change24h: number | null | undefined): boolean {
  if (alert.kind === "above") return price != null && price >= alert.threshold;
  if (alert.kind === "below") return price != null && price <= alert.threshold;
  if (alert.kind === "change_24h") return change24h != null && Math.abs(change24h) >= alert.threshold;
  return false;
}
