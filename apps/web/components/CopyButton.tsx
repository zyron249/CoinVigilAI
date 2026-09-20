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
    <button type="button" className="ghost tool-button copy-button" onClick={() => { void copy(); }}>
      {copied ? "Copied" : label}
    </button>
  );
}
