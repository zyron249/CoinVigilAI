"use client";

import { useState } from "react";
import type { AskAnswer } from "../lib/api";
import { postAsk } from "../lib/api";
import { formatPercent, formatUsd } from "../lib/format";
import { useWatchlist } from "../lib/watchlist";
import { StatusBadge } from "./StatusBadge";

export function AskPanel({
  coinId,
  initial,
  compact = false,
  heading = "Ask CoinVigil",
}: {
  coinId?: string;
  initial?: AskAnswer | null;
  compact?: boolean;
  heading?: string;
}) {
  const { items: watched } = useWatchlist();
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AskAnswer | null>(initial ?? null);

  async function submit(question: string) {
    const next = question.trim();
    if (!next) return;
    setBusy(true);
    try {
      setResult(await postAsk(next, coinId));
    } finally {
      setBusy(false);
    }
  }

  const failed = Boolean(result?.error || result?.engine === "unavailable");

  return (
    <section className={`card ask-card ${compact ? "ask-compact" : ""}`} id={coinId ? undefined : "ask-coinvigil"}>
      <div className="section-heading">
        <div>
          <div className="eyebrow">{heading}</div>
          <h2>{compact ? "Tool-grounded Q&A" : "You are talking to an AI"}</h2>
        </div>
        {result ? <StatusBadge source={result.data_source} /> : null}
      </div>
      <p className="ask-kicker muted">
        You are interacting with AI. Natural-language market questions. Prices, caps, and volume come from read-only
        CoinGecko/news tools — never invented. No buy/sell advice. Not financial advice.
      </p>
      <form
        className="ask-form"
        onSubmit={(event) => {
          event.preventDefault();
          void submit(draft);
        }}
      >
        <label className="sr-only" htmlFor={coinId ? `ask-${coinId}` : "ask-q"}>Ask a market question</label>
        <textarea
          id={coinId ? `ask-${coinId}` : "ask-q"}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          maxLength={500}
          rows={compact ? 2 : 3}
          placeholder={coinId ? `Ask about ${coinId} — tools supply the numbers` : "e.g. What is bitcoin's price and 24h change?"}
        />
        <button type="submit" disabled={busy || !draft.trim()}>{busy ? "Checking tools…" : "Ask"}</button>
      </form>
      {!coinId && watched.length ? (
        <div className="ask-chips" aria-label="Ask about watchlist coins">
          {watched.slice(0, 5).map((item) => (
            <button
              key={item.id}
              type="button"
              className="ghost tool-button"
              onClick={() => void submit(`What moved for ${item.name}?`)}
            >
              Ask {item.symbol.toUpperCase()}
            </button>
          ))}
        </div>
      ) : null}
      {result ? (
        <div className="ask-result" aria-live="polite">
          {result.refused_advice ? (
            <p className="ask-refused">No buy/sell advice or price prediction — tools can still quote the snapshot.</p>
          ) : null}
          <p className="ask-engine muted">
            {failed
              ? "Ask unavailable — no invented fill-in"
              : result.generated
                ? "AI-generated from tools"
                : "Heuristic tool answer — no live model vote"}
            {result.engine ? ` · ${result.engine}` : ""}
            {result.tools_used.length ? ` · tools: ${result.tools_used.join(", ")}` : ""}
          </p>
          <p>{result.answer}</p>
          {result.quotes.length ? (
            <ul className="ask-quotes">
              {result.quotes.slice(0, 4).map((row) => (
                <li key={row.id || row.symbol}>
                  <strong>{row.name || row.id}</strong>
                  <span>{formatUsd(row.price_usd ?? null)}</span>
                  <span>{formatPercent(row.change_24h ?? null)} 24h</span>
                </li>
              ))}
            </ul>
          ) : null}
          {result.citations.length ? (
            <ul className="ask-cites">
              {result.citations.map((cite, index) => (
                <li key={`${cite.kind}-${cite.label}-${index}`}>
                  {cite.url ? (
                    <a href={cite.url} target="_blank" rel="noopener noreferrer">{cite.label}</a>
                  ) : <span>{cite.label}</span>}
                  {cite.detail ? <em> · {cite.detail}</em> : null}
                </li>
              ))}
            </ul>
          ) : null}
          <p className="brief-disclaimer">{result.disclaimer}</p>
        </div>
      ) : null}
    </section>
  );
}
