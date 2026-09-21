"use client";

import { useEffect, useState } from "react";

export const ALERTS_KEY = "coinvigil.alerts.v1";
export const ALERTS_EVENT = "coinvigil:alerts";
export const VOLUME_SEEN_KEY = "coinvigil.volume-seen.v1";
export const ALERTS_LIMIT = 20;
export const DEFAULT_COOLDOWN_MINUTES = 15;

export type AlertKind = "above" | "below" | "change_24h";
export type AlertSensitivity = "micro" | "normal" | "major";
export type AlertAnalysis = "technical" | "sentiment" | "all";

export type AlertNote = {
  text: string;
  engine: string;
  generated: boolean;
  at: string;
};

export type PriceAlert = {
  id: string;
  coinId: string;
  symbol: string;
  name: string;
  kind: AlertKind;
  threshold: number;
  sensitivity: AlertSensitivity;
  analysis: AlertAnalysis;
  volumeMultiplier: number | null;
  muted: boolean;
  cooldownMinutes: number;
  lastNotifiedAt: string | null;
  note: AlertNote | null;
  createdAt: string;
};

export const SENSITIVITY = {
  micro: { changePct: 1, volumeMult: 1.5, label: "Micro" },
  normal: { changePct: 5, volumeMult: 2, label: "Normal" },
  major: { changePct: 15, volumeMult: 3, label: "Major" },
} as const;

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
      const sensitivityRaw = String((row as PriceAlert).sensitivity || "normal");
      const sensitivity = (["micro", "normal", "major"].includes(sensitivityRaw) ? sensitivityRaw : "normal") as AlertSensitivity;
      const analysisRaw = String((row as PriceAlert).analysis || "technical");
      const analysis = (["technical", "sentiment", "all"].includes(analysisRaw) ? analysisRaw : "technical") as AlertAnalysis;
      const volumeRaw = (row as PriceAlert).volumeMultiplier;
      const volumeMultiplier = volumeRaw == null ? null : Number(volumeRaw);
      const cooldownRaw = Number((row as PriceAlert).cooldownMinutes);
      const noteRaw = (row as PriceAlert).note;
      items.push({
        id,
        coinId,
        symbol: String((row as PriceAlert).symbol || coinId).slice(0, 16),
        name: String((row as PriceAlert).name || coinId).slice(0, 80),
        kind,
        threshold,
        sensitivity,
        analysis,
        volumeMultiplier: volumeMultiplier != null && Number.isFinite(volumeMultiplier) && volumeMultiplier > 0 ? volumeMultiplier : null,
        muted: Boolean((row as PriceAlert).muted),
        cooldownMinutes: Number.isFinite(cooldownRaw) && cooldownRaw > 0 ? Math.min(1440, Math.max(1, cooldownRaw)) : DEFAULT_COOLDOWN_MINUTES,
        lastNotifiedAt: String((row as PriceAlert).lastNotifiedAt || "") || null,
        note: noteRaw && typeof noteRaw === "object" && noteRaw.text
          ? {
              text: String(noteRaw.text).slice(0, 800),
              engine: String(noteRaw.engine || "heuristic-tools").slice(0, 40),
              generated: Boolean(noteRaw.generated),
              at: String(noteRaw.at || ""),
            }
          : null,
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

export function readAlerts(): PriceAlert[] {
  if (typeof window === "undefined") return [];
  return parseAlerts(window.localStorage.getItem(ALERTS_KEY));
}

export function writeAlerts(items: PriceAlert[]): PriceAlert[] {
  const next = items.slice(0, ALERTS_LIMIT);
  window.localStorage.setItem(ALERTS_KEY, serializeAlerts(next));
  window.dispatchEvent(new CustomEvent(ALERTS_EVENT));
  return next;
}

export function parseVolumeSeen(raw: string | null): Record<string, number> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: Record<string, number> = {};
    if (!parsed || typeof parsed !== "object") return out;
    for (const [key, value] of Object.entries(parsed)) {
      const vol = Number(value);
      if (key && Number.isFinite(vol) && vol > 0) out[key.toLowerCase()] = vol;
    }
    return out;
  } catch {
    return {};
  }
}

export function readVolumeSeen(): Record<string, number> {
  if (typeof window === "undefined") return {};
  return parseVolumeSeen(window.localStorage.getItem(VOLUME_SEEN_KEY));
}

export function rememberVolume(coinId: string, volume: number | null | undefined): Record<string, number> {
  const id = coinId.trim().toLowerCase();
  const current = readVolumeSeen();
  if (!id || volume == null || !Number.isFinite(volume) || volume <= 0) return current;
  const next = { ...current, [id]: volume };
  window.localStorage.setItem(VOLUME_SEEN_KEY, JSON.stringify(next));
  return next;
}

export function alertFired(alert: PriceAlert, price: number | null | undefined, change24h: number | null | undefined): boolean {
  if (alert.kind === "above") return price != null && price >= alert.threshold;
  if (alert.kind === "below") return price != null && price <= alert.threshold;
  if (alert.kind === "change_24h") return change24h != null && Math.abs(change24h) >= alert.threshold;
  return false;
}

export function volumePrefilterPass(
  multiplier: number | null | undefined,
  volume: number | null | undefined,
  lastVolume: number | null | undefined,
): boolean {
  if (multiplier == null || multiplier <= 0) return true;
  if (lastVolume == null || lastVolume <= 0) return true;
  if (volume == null || !Number.isFinite(volume)) return true;
  return volume >= lastVolume * multiplier;
}

export type AlertEval = {
  matching: boolean;
  fired: boolean;
  status: "fired" | "watching" | "off-watchlist" | "volume-prefilter" | "muted" | "cooldown";
};

export function alertStatusLabel(status: AlertEval["status"] | string): string {
  if (status === "fired") return "Triggered";
  if (status === "cooldown") return "Cooldown";
  if (status === "muted") return "Muted";
  if (status === "off-watchlist") return "Skipped";
  if (status === "volume-prefilter") return "Held";
  return "Watching";
}

export function inCooldown(alert: PriceAlert, now = Date.now()): boolean {
  if (!alert.lastNotifiedAt) return false;
  const then = new Date(alert.lastNotifiedAt).getTime();
  if (Number.isNaN(then)) return false;
  return now - then < alert.cooldownMinutes * 60_000;
}

export function evaluateAlert(
  alert: PriceAlert,
  quote: { price?: number | null; change24h?: number | null; volume?: number | null },
  opts: { watched: boolean; lastVolume?: number | null; now?: number },
): AlertEval {
  if (!opts.watched) return { matching: false, fired: false, status: "off-watchlist" };
  if (alert.muted) return { matching: false, fired: false, status: "muted" };
  if (!volumePrefilterPass(alert.volumeMultiplier, quote.volume, opts.lastVolume)) {
    return { matching: false, fired: false, status: "volume-prefilter" };
  }
  const matching = alertFired(alert, quote.price, quote.change24h);
  if (!matching) return { matching: false, fired: false, status: "watching" };
  if (inCooldown(alert, opts.now)) return { matching: true, fired: false, status: "cooldown" };
  return { matching: true, fired: true, status: "fired" };
}

export function useAlerts() {
  const [items, setItems] = useState<PriceAlert[]>([]);

  useEffect(() => {
    const sync = () => setItems(readAlerts());
    sync();
    window.addEventListener("storage", sync);
    window.addEventListener(ALERTS_EVENT, sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener(ALERTS_EVENT, sync);
    };
  }, []);

  function add(item: Omit<PriceAlert, "id" | "createdAt" | "note" | "lastNotifiedAt"> & { id?: string; note?: AlertNote | null; lastNotifiedAt?: string | null }) {
    const next: PriceAlert = {
      ...item,
      muted: Boolean(item.muted),
      cooldownMinutes: item.cooldownMinutes || DEFAULT_COOLDOWN_MINUTES,
      lastNotifiedAt: item.lastNotifiedAt ?? null,
      note: item.note ?? null,
      id: item.id || `${item.coinId}-${item.kind}-${item.threshold}-${Date.now()}`,
      createdAt: new Date().toISOString(),
    };
    const saved = writeAlerts([next, ...items]);
    setItems(saved);
    return saved;
  }

  function patch(id: string, partial: Partial<PriceAlert>) {
    const saved = writeAlerts(items.map((row) => (row.id === id ? { ...row, ...partial } : row)));
    setItems(saved);
    return saved;
  }

  function remove(id: string) {
    const saved = writeAlerts(items.filter((row) => row.id !== id));
    setItems(saved);
    return saved;
  }

  return { items, add, patch, remove };
}
