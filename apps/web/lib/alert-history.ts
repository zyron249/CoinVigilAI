"use client";

import { useSyncExternalStore } from "react";
import type { AlertNote, PriceAlert } from "./alerts";

export const HISTORY_KEY = "coinvigil.alert-history.v1";
export const HISTORY_EVENT = "coinvigil:alert-history";
export const HISTORY_LIMIT = 50;

export type AlertHistoryItem = {
  id: string;
  alertId: string;
  coinId: string;
  symbol: string;
  name: string;
  kind: string;
  threshold: number;
  at: string;
  price: number | null;
  note: AlertNote | null;
  delivered: boolean;
};

export function parseHistory(raw: string | null): AlertHistoryItem[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    const rows = Array.isArray(parsed) ? parsed : (parsed as { items?: unknown }).items;
    if (!Array.isArray(rows)) return [];
    const items: AlertHistoryItem[] = [];
    for (const row of rows) {
      if (!row || typeof row !== "object") continue;
      const coinId = String((row as AlertHistoryItem).coinId || "").trim().toLowerCase();
      const at = String((row as AlertHistoryItem).at || "");
      if (!coinId || !at) continue;
      const priceRaw = (row as AlertHistoryItem).price;
      const price = priceRaw == null ? null : Number(priceRaw);
      items.push({
        id: String((row as AlertHistoryItem).id || `${coinId}-${at}`).slice(0, 80),
        alertId: String((row as AlertHistoryItem).alertId || "").slice(0, 80),
        coinId,
        symbol: String((row as AlertHistoryItem).symbol || coinId).slice(0, 16),
        name: String((row as AlertHistoryItem).name || coinId).slice(0, 80),
        kind: String((row as AlertHistoryItem).kind || "").slice(0, 20),
        threshold: Number((row as AlertHistoryItem).threshold) || 0,
        at,
        price: price != null && Number.isFinite(price) ? price : null,
        note: (row as AlertHistoryItem).note && typeof (row as AlertHistoryItem).note === "object"
          ? (row as AlertHistoryItem).note
          : null,
        delivered: Boolean((row as AlertHistoryItem).delivered),
      });
      if (items.length >= HISTORY_LIMIT) break;
    }
    return items;
  } catch {
    return [];
  }
}

export function writeHistory(items: AlertHistoryItem[]): AlertHistoryItem[] {
  const next = items.slice(0, HISTORY_LIMIT);
  const raw = JSON.stringify({ items: next });
  window.localStorage.setItem(HISTORY_KEY, raw);
  historyRaw = raw;
  historyCache = parseHistory(raw);
  window.dispatchEvent(new CustomEvent(HISTORY_EVENT));
  return historyCache;
}

const EMPTY_HISTORY: AlertHistoryItem[] = [];
let historyRaw: string | null | undefined;
let historyCache: AlertHistoryItem[] = EMPTY_HISTORY;

export function readHistory(): AlertHistoryItem[] {
  if (typeof window === "undefined") return EMPTY_HISTORY;
  const raw = window.localStorage.getItem(HISTORY_KEY);
  if (raw === historyRaw) return historyCache;
  historyRaw = raw;
  historyCache = parseHistory(raw);
  return historyCache;
}

export function recordFire(
  alert: PriceAlert,
  price: number | null | undefined,
  note: AlertNote | null,
  delivered = false,
): AlertHistoryItem[] {
  const now = Date.now();
  const existing = readHistory().find((row) => row.alertId === alert.id);
  if (existing) {
    const then = new Date(existing.at).getTime();
    if (!Number.isNaN(then) && now - then < alert.cooldownMinutes * 60_000) {
      return patchLatestFire(alert.id, { note, delivered, price: price ?? existing.price });
    }
  }
  const item: AlertHistoryItem = {
    id: `${alert.id}-${now}`,
    alertId: alert.id,
    coinId: alert.coinId,
    symbol: alert.symbol,
    name: alert.name,
    kind: alert.kind,
    threshold: alert.threshold,
    at: new Date(now).toISOString(),
    price: price ?? null,
    note,
    delivered,
  };
  return writeHistory([item, ...readHistory()].slice(0, HISTORY_LIMIT));
}

export function patchLatestFire(
  alertId: string,
  partial: Partial<Pick<AlertHistoryItem, "note" | "delivered" | "price">>,
): AlertHistoryItem[] {
  const items = readHistory();
  const index = items.findIndex((row) => row.alertId === alertId);
  if (index < 0) return items;
  const next = items.slice();
  next[index] = { ...next[index], ...partial };
  return writeHistory(next);
}

function subscribeHistory(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(HISTORY_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(HISTORY_EVENT, onChange);
  };
}

export function useAlertHistory() {
  const items = useSyncExternalStore(subscribeHistory, readHistory, () => EMPTY_HISTORY);

  function clear() {
    writeHistory([]);
  }

  return { items, clear, record: recordFire };
}
