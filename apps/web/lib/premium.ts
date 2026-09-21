"use client";

import { useSyncExternalStore } from "react";

export const PREMIUM_KEY = "coinvigil.premium.v1";
export const PREMIUM_EVENT = "coinvigil:premium";
export const FREE_WATCH_LIMIT = 3;
export const PREMIUM_WATCH_LIMIT = 25;

export function parsePremium(raw: string | null): boolean {
  if (!raw) return false;
  const value = raw.trim().toLowerCase();
  return value === "1" || value === "true" || value === "premium";
}

export function readPremium(): boolean {
  if (typeof window === "undefined") return false;
  return parsePremium(window.localStorage.getItem(PREMIUM_KEY));
}

export function writePremium(on: boolean): boolean {
  window.localStorage.setItem(PREMIUM_KEY, on ? "1" : "0");
  window.dispatchEvent(new CustomEvent(PREMIUM_EVENT));
  return on;
}

export function watchlistCap(premium: boolean): number {
  return premium ? PREMIUM_WATCH_LIMIT : FREE_WATCH_LIMIT;
}

export function canAddWatch(count: number, premium: boolean): boolean {
  return count < watchlistCap(premium);
}

function subscribePremium(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(PREMIUM_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(PREMIUM_EVENT, onChange);
  };
}

export function usePremium() {
  const premium = useSyncExternalStore(subscribePremium, readPremium, () => false);

  function toggle() {
    writePremium(!premium);
  }

  return {
    premium,
    cap: watchlistCap(premium),
    toggle,
  };
}
