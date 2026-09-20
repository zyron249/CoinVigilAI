"use client";

import { useState } from "react";
import type { AssetTickers } from "../lib/api";
import { getAssetTickers } from "../lib/api";
import { formatCompactUsd, formatPercent, formatTimestamp, formatUsd } from "../lib/format";
import { StatusBadge } from "./StatusBadge";

function trustLabel(score?: string | null) {
  if (score === "green") return "High";
  if (score === "yellow") return "Medium";
  if (score === "red") return "Low";
  return "—";
}

const VOLUME_PRESETS = [
  { label: "Any volume", value: 0 },
  { label: "≥ $100K", value: 100_000 },
  { label: "≥ $1M", value: 1_000_000 },
  { label: "≥ $10M", value: 10_000_000 },
];

export function ExchangeMarkets({
  coinId,
  symbol,
  initial,
}: {
  coinId: string;
  symbol: string;
  initial: AssetTickers;
}) {
  const [pageData, setPageData] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [venueDraft, setVenueDraft] = useState(initial.query || "");
  const [minVolume, setMinVolume] = useState(initial.min_volume || 0);

  async function load(page: number, extras?: { q?: string; minVolume?: number }) {
    setBusy(true);
    const next = await getAssetTickers(coinId, page, pageData.limit, {
      q: extras?.q ?? pageData.query ?? "",
      minVolume: extras?.minVolume ?? pageData.min_volume ?? 0,
    });
    if (next.source === "unavailable" && next.data.length === 0 && pageData.data.length > 0) {
      setError("Could not refresh listings. Showing the last CoinGecko snapshot.");
      setBusy(false);
      return;
    }
    setError(null);
    setPageData(next);
    setBusy(false);
  }

  const pageCount = Math.max(1, Math.ceil((pageData.total || 0) / Math.max(pageData.limit, 1)));
  const empty = pageData.data.length === 0;
  const venueCount = pageData.unique_exchange_count ?? 0;
  const venues = pageData.venues ?? [];
  const filtered = Boolean(pageData.query || (pageData.min_volume && pageData.min_volume > 0));

  return (
    <section className="card table-card exchange-card" id="markets-tab">
      <div className="section-heading">
        <div>
          <div className="eyebrow">EXCHANGE MARKETS</div>
          <h2>{symbol.toUpperCase()} pairs on CoinGecko</h2>
        </div>
        <StatusBadge source={pageData.source} stale={pageData.stale} />
      </div>
      <p className="exchange-note muted">{pageData.note}</p>
      <form
        className="exchange-filters"
        onSubmit={(event) => {
          event.preventDefault();
          void load(1, { q: venueDraft, minVolume });
        }}
      >
        <label className="sr-only" htmlFor="venue-filter">Filter by exchange or pair</label>
        <input
          id="venue-filter"
          type="search"
          value={venueDraft}
          onChange={(event) => setVenueDraft(event.target.value)}
          placeholder="Filter exchange or pair"
          disabled={busy}
        />
        <label className="sr-only" htmlFor="volume-filter">Minimum 24h volume</label>
        <select
          id="volume-filter"
          value={minVolume}
          disabled={busy}
          onChange={(event) => setMinVolume(Number(event.target.value))}
        >
          {VOLUME_PRESETS.map((preset) => (
            <option key={preset.value} value={preset.value}>{preset.label}</option>
          ))}
        </select>
        <button type="submit" className="ghost tool-button" disabled={busy}>Filter</button>
        {filtered ? (
          <button
            type="button"
            className="ghost tool-button"
            disabled={busy}
            onClick={() => {
              setVenueDraft("");
              setMinVolume(0);
              void load(1, { q: "", minVolume: 0 });
            }}
          >
            Reset
          </button>
        ) : null}
      </form>
      {error ? <p className="table-banner" role="status">{error}</p> : null}
      {venueCount > 0 ? (
        <div className="exchange-summary">
          <strong>{venueCount} venues</strong>
          <span className="muted">
            {pageData.total} matching pairs in this snapshot, sorted by 24h USD volume
          </span>
          {venues.length ? (
            <ul className="venue-chips">
              {venues.map((venue) => <li key={venue}>{venue}</li>)}
              {venueCount > venues.length ? <li className="muted">+{venueCount - venues.length}</li> : null}
            </ul>
          ) : null}
        </div>
      ) : null}
      <div className={`table-wrap ${busy ? "is-busy" : ""}`} aria-busy={busy}>
        {empty ? (
          <div className="empty empty-panel table-empty">
            <strong>{filtered ? "No pairs match this filter" : "No exchange listings in this snapshot"}</strong>
            <p>{pageData.note || "CoinVigil does not scrape exchange websites or invent pairs."}</p>
          </div>
        ) : (
          <table className="markets-table tickers-table">
            <caption className="sr-only">
              Exchange markets for {symbol}, sorted by USD volume. Source: {pageData.source}.
            </caption>
            <thead>
              <tr>
                <th scope="col">#</th>
                <th scope="col">Exchange</th>
                <th scope="col">Pair</th>
                <th scope="col">Price</th>
                <th scope="col">Volume (24h)</th>
                <th scope="col">Trust</th>
                <th scope="col">Spread</th>
                <th scope="col">Trade</th>
              </tr>
            </thead>
            <tbody>
              {pageData.data.map((ticker, index) => (
                <tr className="market-row" key={`${ticker.exchange}-${ticker.pair}-${index}`}>
                  <td>{(pageData.page - 1) * pageData.limit + index + 1}</td>
                  <td className="ticker-exchange">{ticker.exchange}</td>
                  <td>{ticker.pair}</td>
                  <td>{formatUsd(ticker.price_usd ?? ticker.last_price)}</td>
                  <td>{formatCompactUsd(ticker.volume_usd)}</td>
                  <td>
                    <span className={`trust-pill trust-${ticker.trust_score || "none"}`}>
                      {trustLabel(ticker.trust_score)}
                    </span>
                  </td>
                  <td>{ticker.bid_ask_spread_percentage != null ? formatPercent(ticker.bid_ask_spread_percentage) : "—"}</td>
                  <td>
                    {ticker.trade_url ? (
                      <a className="trade-link" href={ticker.trade_url} target="_blank" rel="noreferrer">
                        Open
                      </a>
                    ) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <p className="table-swipe muted">Swipe sideways to see volume, trust score, spread, and trade links.</p>
      <div className="table-footer">
        <div className="muted">
          Showing {pageData.data.length} of {pageData.total} CoinGecko tickers
          {pageData.last_live_at ? ` · ${formatTimestamp(pageData.last_live_at)}` : ""}
          {busy ? " · updating…" : ""}
        </div>
        <div className="pager">
          <button type="button" className="ghost tool-button" disabled={pageData.page <= 1 || busy} onClick={() => { void load(pageData.page - 1); }}>
            Previous
          </button>
          <span className="muted">Page {pageData.page} / {pageCount}</span>
          <button type="button" className="ghost tool-button" disabled={pageData.page >= pageCount || busy} onClick={() => { void load(pageData.page + 1); }}>
            Next
          </button>
        </div>
      </div>
    </section>
  );
}
