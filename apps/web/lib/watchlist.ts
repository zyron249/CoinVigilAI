"use client";

// Keep parseWatchlist + cap helpers aligned with apps/web/lib/watchlist-contract.test.mjs

import { useMemo, useSyncExternalStore } from "react";
import { canAddWatch, PREMIUM_EVENT, PREMIUM_WATCH_LIMIT, readPremium, watchlistCap } from "./premium";

export const WATCHLIST_KEY = "coinvigil.watchlist.v1";
export const WATCHLIST_EVENT = "coinvigil:watchlist";
export const WATCHLIST_LIMIT = PREMIUM_WATCH_LIMIT;

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

const EMPTY_WATCHLIST: WatchItem[] = [];
let watchlistRaw: string | null | undefined;
let watchlistCache: WatchItem[] = EMPTY_WATCHLIST;

export function readWatchlist(): WatchItem[] {
  if (typeof window === "undefined") return EMPTY_WATCHLIST;
  const raw = window.localStorage.getItem(WATCHLIST_KEY);
  if (raw === watchlistRaw) return watchlistCache;
  watchlistRaw = raw;
  watchlistCache = parseWatchlist(raw);
  return watchlistCache;
}

function writeWatchlist(items: WatchItem[]): WatchItem[] {
  const next = items.slice(0, WATCHLIST_LIMIT);
  window.localStorage.setItem(WATCHLIST_KEY, serializeWatchlist(next));
  window.dispatchEvent(new CustomEvent(WATCHLIST_EVENT));
  return next;
}

export function toggleWatchItem(item: Omit<WatchItem, "addedAt">): { items: WatchItem[]; blocked: boolean } {
  const current = readWatchlist();
  const id = item.id.trim().toLowerCase();
  const exists = current.some((row) => row.id === id);
  if (exists) {
    return { items: writeWatchlist(current.filter((row) => row.id !== id)), blocked: false };
  }
  const premium = readPremium();
  if (!canAddWatch(current.length, premium)) {
    return { items: current, blocked: true };
  }
  return {
    items: writeWatchlist([{ id, symbol: item.symbol, name: item.name, addedAt: new Date().toISOString() }, ...current]),
    blocked: false,
  };
}

function subscribeWatchlist(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(WATCHLIST_EVENT, onChange);
  window.addEventListener(PREMIUM_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(WATCHLIST_EVENT, onChange);
    window.removeEventListener(PREMIUM_EVENT, onChange);
  };
}

export function useWatchlist() {
  const items = useSyncExternalStore(subscribeWatchlist, readWatchlist, () => EMPTY_WATCHLIST);
  const premium = useSyncExternalStore(subscribeWatchlist, readPremium, () => false);

  function toggle(item: Omit<WatchItem, "addedAt">) {
    return toggleWatchItem(item);
  }

  const cap = watchlistCap(premium);
  const ids = useMemo(() => new Set(items.map((item) => item.id)), [items]);
  return {
    items,
    ids,
    toggle,
    premium,
    cap,
    atCap: items.length >= cap,
  };
}
