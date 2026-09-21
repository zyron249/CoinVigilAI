"use client";

import { useSyncExternalStore } from "react";

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

const EMPTY_ALERTS: PriceAlert[] = [];
let alertsRaw: string | null | undefined;
let alertsCache: PriceAlert[] = EMPTY_ALERTS;

export function readAlerts(): PriceAlert[] {
  if (typeof window === "undefined") return EMPTY_ALERTS;
  const raw = window.localStorage.getItem(ALERTS_KEY);
  if (raw === alertsRaw) return alertsCache;
  alertsRaw = raw;
  alertsCache = parseAlerts(raw);
  return alertsCache;
}

export function writeAlerts(items: PriceAlert[]): PriceAlert[] {
  const next = items.slice(0, ALERTS_LIMIT);
  const raw = serializeAlerts(next);
  window.localStorage.setItem(ALERTS_KEY, raw);
  alertsRaw = raw;
  alertsCache = parseAlerts(raw);
  window.dispatchEvent(new CustomEvent(ALERTS_EVENT));
  return alertsCache;
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
  status: "fired" | "watching" | "off-watchlist" | "volume-prefilter" | "muted" | "cooldown" | "demo";
};

export function alertStatusLabel(status: AlertEval["status"] | string): string {
  if (status === "fired") return "Triggered";
  if (status === "cooldown") return "Cooldown";
  if (status === "muted") return "Muted";
  if (status === "off-watchlist") return "Skipped";
  if (status === "volume-prefilter") return "Held";
  if (status === "demo") return "Demo — not firing";
  return "Watching";
}

export function inCooldown(alert: PriceAlert, now = Date.now()): boolean {
  if (!alert.lastNotifiedAt) return false;
  const then = new Date(alert.lastNotifiedAt).getTime();
  if (Number.isNaN(then)) return false;
  return now - then < alert.cooldownMinutes * 60_000;
}

export const FIREABLE_QUOTE_SOURCES = new Set(["coingecko", "cache"]);

export function isFireableQuoteSource(source?: string | null): boolean {
  if (source == null) return true;
  return FIREABLE_QUOTE_SOURCES.has(source);
}

export function evaluateAlert(
  alert: PriceAlert,
  quote: { price?: number | null; change24h?: number | null; volume?: number | null },
  opts: { watched: boolean; lastVolume?: number | null; now?: number; source?: string },
): AlertEval {
  if (!opts.watched) return { matching: false, fired: false, status: "off-watchlist" };
  if (alert.muted) return { matching: false, fired: false, status: "muted" };
  if (!volumePrefilterPass(alert.volumeMultiplier, quote.volume, opts.lastVolume)) {
    return { matching: false, fired: false, status: "volume-prefilter" };
  }
  const matching = alertFired(alert, quote.price, quote.change24h);
  if (!matching) return { matching: false, fired: false, status: "watching" };
  if (opts.source === "demo") return { matching: true, fired: false, status: "demo" };
  if (opts.source != null && !isFireableQuoteSource(opts.source)) {
    return { matching: true, fired: false, status: "watching" };
  }
  if (inCooldown(alert, opts.now)) return { matching: true, fired: false, status: "cooldown" };
  return { matching: true, fired: true, status: "fired" };
}

export function claimFire(alertId: string, now = Date.now()): string | null {
  const items = readAlerts();
  const current = items.find((row) => row.id === alertId);
  if (!current || current.muted) return null;
  if (inCooldown(current, now)) return null;
  const at = new Date(now).toISOString();
  writeAlerts(items.map((row) => (row.id === alertId ? { ...row, lastNotifiedAt: at } : row)));
  return at;
}

export function cooldownRemainingMs(alert: PriceAlert, now = Date.now()): number {
  if (!alert?.lastNotifiedAt) return 0;
  const then = new Date(alert.lastNotifiedAt).getTime();
  if (Number.isNaN(then)) return 0;
  return Math.max(0, then + alert.cooldownMinutes * 60_000 - now);
}

export function cooldownRemainingLabel(alert: PriceAlert, now = Date.now()): string | null {
  const ms = cooldownRemainingMs(alert, now);
  if (ms <= 0) return null;
  const sec = Math.ceil(ms / 1000);
  if (sec < 60) return `${sec}s left`;
  return `${Math.ceil(sec / 60)}m left`;
}

export function rowStatusLabel(status: AlertEval["status"] | string, alert?: PriceAlert, now = Date.now()): string {
  const base = alertStatusLabel(status);
  if (status === "cooldown" && alert) {
    const left = cooldownRemainingLabel(alert, now);
    return left ? `${base} · ${left}` : base;
  }
  return base;
}

function subscribeAlerts(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(ALERTS_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(ALERTS_EVENT, onChange);
  };
}

export function useAlerts() {
  const items = useSyncExternalStore(subscribeAlerts, readAlerts, () => EMPTY_ALERTS);

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
    return writeAlerts([next, ...readAlerts()]);
  }

  function patch(id: string, partial: Partial<PriceAlert>) {
    return writeAlerts(readAlerts().map((row) => (row.id === id ? { ...row, ...partial } : row)));
  }

  function remove(id: string) {
    return writeAlerts(readAlerts().filter((row) => row.id !== id));
  }

  return { items, add, patch, remove };
}
