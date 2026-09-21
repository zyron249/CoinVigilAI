"use client";

import { useEffect, useState } from "react";

export const PORTFOLIO_KEY = "coinvigil.portfolio.v1";
export const PORTFOLIO_EVENT = "coinvigil:portfolio";
export const PORTFOLIO_LIMIT = 40;

export type Holding = {
  id: string;
  coinId: string;
  symbol: string;
  name: string;
  qty: number;
  costUsd: number | null;
  addedAt: string;
};

export function parseHoldings(raw: string | null): Holding[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    const rows = Array.isArray(parsed) ? parsed : (parsed as { items?: unknown }).items;
    if (!Array.isArray(rows)) return [];
    const seen = new Set<string>();
    const items: Holding[] = [];
    for (const row of rows) {
      if (!row || typeof row !== "object") continue;
      const coinId = String((row as Holding).coinId || "").trim().toLowerCase();
      const qty = Number((row as Holding).qty);
      if (!coinId || !Number.isFinite(qty) || qty <= 0) continue;
      const id = String((row as Holding).id || `${coinId}-${qty}`).slice(0, 80);
      if (seen.has(id)) continue;
      seen.add(id);
      const costRaw = (row as Holding).costUsd;
      const costUsd = costRaw == null ? null : Number(costRaw);
      items.push({
        id,
        coinId,
        symbol: String((row as Holding).symbol || coinId).slice(0, 16),
        name: String((row as Holding).name || coinId).slice(0, 80),
        qty,
        costUsd: costUsd != null && Number.isFinite(costUsd) ? costUsd : null,
        addedAt: String((row as Holding).addedAt || ""),
      });
      if (items.length >= PORTFOLIO_LIMIT) break;
    }
    return items;
  } catch {
    return [];
  }
}

export function serializeHoldings(items: Holding[]): string {
  return JSON.stringify({ items: items.slice(0, PORTFOLIO_LIMIT) });
}

export function readHoldings(): Holding[] {
  if (typeof window === "undefined") return [];
  return parseHoldings(window.localStorage.getItem(PORTFOLIO_KEY));
}

export function writeHoldings(items: Holding[]): Holding[] {
  const next = items.slice(0, PORTFOLIO_LIMIT);
  window.localStorage.setItem(PORTFOLIO_KEY, serializeHoldings(next));
  window.dispatchEvent(new CustomEvent(PORTFOLIO_EVENT));
  return next;
}

export function lotValue(qty: number, price: number | null | undefined): number | null {
  if (!Number.isFinite(qty) || price == null || !Number.isFinite(price)) return null;
  return qty * price;
}

export function lotPnl(
  qty: number,
  price: number | null | undefined,
  costUsd: number | null | undefined,
): { value: number | null; cost: number | null; pnl: number | null; pnlPct: number | null } {
  const value = lotValue(qty, price);
  const cost = costUsd != null && Number.isFinite(costUsd) ? costUsd : null;
  if (value == null || cost == null) return { value, cost, pnl: null, pnlPct: null };
  const pnl = value - cost;
  return { value, cost, pnl, pnlPct: cost !== 0 ? (pnl / cost) * 100 : null };
}

export function aggregateHoldings(
  rows: Array<{ qty: number; coinId: string; costUsd: number | null }>,
  quotes: Map<string, { current_price?: number | null }>,
): {
  value: number | null;
  costUsd: number | null;
  pnl: number | null;
  valued: number;
  comparable: number;
} {
  let quotedValue = 0;
  let valued = 0;
  let comparableValue = 0;
  let comparableCost = 0;
  let comparable = 0;
  for (const row of rows) {
    const stats = lotPnl(row.qty, quotes.get(row.coinId)?.current_price, row.costUsd);
    if (stats.value != null) {
      quotedValue += stats.value;
      valued += 1;
    }
    if (stats.value != null && stats.cost != null) {
      comparableValue += stats.value;
      comparableCost += stats.cost;
      comparable += 1;
    }
  }
  return {
    value: valued ? quotedValue : null,
    costUsd: comparable ? comparableCost : null,
    pnl: comparable ? comparableValue - comparableCost : null,
    valued,
    comparable,
  };
}

export function usePortfolio() {
  const [items, setItems] = useState<Holding[]>(() => readHoldings());

  useEffect(() => {
    const sync = () => setItems(readHoldings());
    sync();
    window.addEventListener("storage", sync);
    window.addEventListener(PORTFOLIO_EVENT, sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener(PORTFOLIO_EVENT, sync);
    };
  }, []);

  function add(item: Omit<Holding, "id" | "addedAt"> & { id?: string }) {
    const next: Holding = {
      ...item,
      id: item.id || `${item.coinId}-${item.qty}-${Date.now()}`,
      addedAt: new Date().toISOString(),
    };
    setItems(writeHoldings([next, ...items]));
  }

  function remove(id: string) {
    setItems(writeHoldings(items.filter((row) => row.id !== id)));
  }

  return { items, add, remove };
}
