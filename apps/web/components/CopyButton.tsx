"use client";

import { useState } from "react";

export function CopyButton({ value, label }: { value?: string; label: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    const text = (value || (typeof window !== "undefined" ? window.location.href : "")).trim();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  return (
    <button
      type="button"
      className={`ghost tool-button copy-button${copied ? " is-copied" : ""}`}
      onClick={() => { void copy(); }}
      aria-live="polite"
      aria-atomic="true"
      title={copied ? "Copied to clipboard" : label}
    >
      {copied ? "Copied" : label}
    </button>
  );
}
