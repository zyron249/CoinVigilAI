"use client";

// Keep parseWatchlist behavior aligned with apps/web/lib/watchlist-contract.test.mjs

import { useEffect, useState } from "react";

export const WATCHLIST_KEY = "coinvigil.watchlist.v1";
export const WATCHLIST_EVENT = "coinvigil:watchlist";
export const WATCHLIST_LIMIT = 40;

export type WatchItem = {
  id: string;
  symbol: string;
  name: string;
  addedAt: string;
};

export function parseWatchlist(raw: string | null): WatchItem[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    const rows = Array.isArray(parsed) ? parsed : (parsed as { items?: unknown }).items;
    if (!Array.isArray(rows)) return [];
    const seen = new Set<string>();
    const items: WatchItem[] = [];
    for (const row of rows) {
      if (!row || typeof row !== "object") continue;
      const id = String((row as WatchItem).id || "").trim().toLowerCase();
      if (!id || seen.has(id)) continue;
      seen.add(id);
      items.push({
        id,
        symbol: String((row as WatchItem).symbol || id).slice(0, 16),
        name: String((row as WatchItem).name || id).slice(0, 80),
        addedAt: String((row as WatchItem).addedAt || ""),
      });
      if (items.length >= WATCHLIST_LIMIT) break;
    }
    return items;
  } catch {
    return [];
  }
}

export function serializeWatchlist(items: WatchItem[]): string {
  return JSON.stringify({ items: items.slice(0, WATCHLIST_LIMIT) });
}

export function readWatchlist(): WatchItem[] {
  if (typeof window === "undefined") return [];
  return parseWatchlist(window.localStorage.getItem(WATCHLIST_KEY));
}

function writeWatchlist(items: WatchItem[]): WatchItem[] {
  const next = items.slice(0, WATCHLIST_LIMIT);
  window.localStorage.setItem(WATCHLIST_KEY, serializeWatchlist(next));
  window.dispatchEvent(new CustomEvent(WATCHLIST_EVENT));
  return next;
}

export function toggleWatchItem(item: Omit<WatchItem, "addedAt">): WatchItem[] {
  const current = readWatchlist();
  const id = item.id.trim().toLowerCase();
  const exists = current.some((row) => row.id === id);
  const next = exists
    ? current.filter((row) => row.id !== id)
    : [{ id, symbol: item.symbol, name: item.name, addedAt: new Date().toISOString() }, ...current];
  return writeWatchlist(next);
}

export function useWatchlist() {
  const [items, setItems] = useState<WatchItem[]>([]);

  useEffect(() => {
    const sync = () => setItems(readWatchlist());
    sync();
    window.addEventListener("storage", sync);
    window.addEventListener(WATCHLIST_EVENT, sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener(WATCHLIST_EVENT, sync);
    };
  }, []);

  function toggle(item: Omit<WatchItem, "addedAt">) {
    setItems(toggleWatchItem(item));
  }

  return {
    items,
    ids: new Set(items.map((item) => item.id)),
    toggle,
  };
}
