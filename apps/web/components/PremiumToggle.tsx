"use client";

import { usePremium } from "../lib/premium";

export function PremiumToggle({ compact = false }: { compact?: boolean }) {
  const { premium, cap, toggle } = usePremium();
  return (
    <label className={`premium-toggle ${compact ? "compact" : ""}`}>
      <input type="checkbox" checked={premium} onChange={toggle} />
      <span>
        {premium ? `Local premium on · ${cap} watch slots` : `Free · ${cap} watch slots`}
        {compact ? null : " — not billing, not a payment backend."}
      </span>
    </label>
  );
}
