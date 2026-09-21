"use client";

import { useState } from "react";
import { getConvert, type ConvertQuote } from "../lib/api";
import { formatUsd } from "../lib/format";
import { StatusBadge } from "./StatusBadge";

export function ConverterBoard({ initial }: { initial: ConvertQuote }) {
  const [amount, setAmount] = useState(String(initial.amount || 1));
  const [fromId, setFromId] = useState(initial.from_id || "bitcoin");
  const [toId, setToId] = useState(initial.to_id || "usd");
  const [quote, setQuote] = useState(initial);
  const [busy, setBusy] = useState(false);

  async function run() {
    const nextAmount = Math.max(0, Number(amount) || 0);
    if (!nextAmount || !fromId.trim() || !toId.trim()) return;
    setBusy(true);
    const next = await getConvert(nextAmount, fromId.trim().toLowerCase(), toId.trim().toLowerCase());
    setQuote(next);
    setBusy(false);
  }

  return (
    <section className="card convert-card">
      <div className="section-heading">
        <div>
          <div className="eyebrow">CONVERTER</div>
          <h2>Crypto ↔ crypto and USD</h2>
        </div>
        <StatusBadge source={quote.source} stale={quote.stale} />
      </div>
      <form
        className="convert-form"
        onSubmit={(event) => {
          event.preventDefault();
          void run();
        }}
      >
        <label>
          Amount
          <input type="number" min="0" step="any" value={amount} onChange={(event) => setAmount(event.target.value)} />
        </label>
        <label>
          From
          <input value={fromId} onChange={(event) => setFromId(event.target.value)} placeholder="bitcoin or usd" />
        </label>
        <label>
          To
          <input value={toId} onChange={(event) => setToId(event.target.value)} placeholder="usd or ethereum" />
        </label>
        <button type="submit" disabled={busy}>{busy ? "Converting…" : "Convert"}</button>
      </form>
      {quote.value != null ? (
        <p className="convert-out">
          <strong>{quote.amount} {quote.from_symbol}</strong>
          {" = "}
          <strong>{quote.to_id === "usd" ? formatUsd(quote.value) : `${quote.value.toLocaleString(undefined, { maximumFractionDigits: 8 })} ${quote.to_symbol}`}</strong>
        </p>
      ) : (
        <p className="muted">{quote.missing.length ? `Missing: ${quote.missing.join(", ")}.` : "Enter CoinGecko ids or usd."}</p>
      )}
      <p className="muted">{quote.note}</p>
      <p className="brief-disclaimer">{quote.disclaimer}</p>
    </section>
  );
}
