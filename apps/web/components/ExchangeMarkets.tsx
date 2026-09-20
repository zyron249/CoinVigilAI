"use client";

import { useEffect, useState } from "react";
import type { AssetTickers } from "../lib/api";
import { getAssetTickers } from "../lib/api";
import { formatCompactUsd, formatPercent, formatTimestamp, formatUsd } from "../lib/format";
import { StatusBadge } from "./StatusBadge";

function trustLabel(score?: string | null) {
  if (score === "green") return "High";
  if (score === "yellow") return "Medium";
  if (score === "red") return "Low";
  return "Not scored";
}

function spreadLabel(value?: number | null) {
  if (value == null) return "No spread";
  return formatPercent(value);
}

const VOLUME_PRESETS = [
  { label: "Any volume", value: 0 },
  { label: "≥ $100K", value: 100_000 },
  { label: "≥ $1M", value: 1_000_000 },
  { label: "≥ $10M", value: 10_000_000 },
];

const COLUMNS: { key: string; label: string; sort?: string }[] = [
  { key: "rank", label: "#" },
  { key: "exchange", label: "Exchange", sort: "exchange" },
  { key: "pair", label: "Pair", sort: "pair" },
  { key: "price", label: "Price", sort: "price" },
  { key: "volume", label: "Volume (24h)", sort: "volume" },
  { key: "trust", label: "Trust", sort: "trust" },
  { key: "spread", label: "Spread", sort: "spread" },
  { key: "trade", label: "Trade" },
];

const DEFAULT_ORDER: Record<string, "asc" | "desc"> = {
  volume: "desc",
  price: "desc",
  trust: "desc",
  spread: "asc",
  exchange: "asc",
  pair: "asc",
};

function writeShareableParams(next: {
  q?: string;
  minVolume?: number;
  sort?: string;
  order?: string;
  page?: number;
}) {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  const q = (next.q || "").trim();
  if (q) url.searchParams.set("q", q);
  else url.searchParams.delete("q");
  if (next.minVolume && next.minVolume > 0) url.searchParams.set("min_volume", String(next.minVolume));
  else url.searchParams.delete("min_volume");
  if (next.sort && next.sort !== "volume") url.searchParams.set("sort", next.sort);
  else url.searchParams.delete("sort");
  const order = next.order || "desc";
  const defaultOrder = DEFAULT_ORDER[next.sort || "volume"] || "desc";
  if (order !== defaultOrder) url.searchParams.set("order", order);
  else url.searchParams.delete("order");
  if (next.page && next.page > 1) url.searchParams.set("page", String(next.page));
  else url.searchParams.delete("page");
  url.hash = "markets-tab";
  window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
}

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

  useEffect(() => {
    setVenueDraft(pageData.query || "");
    setMinVolume(pageData.min_volume || 0);
  }, [pageData.query, pageData.min_volume]);

  async function load(page: number, extras?: { q?: string; minVolume?: number; sort?: string; order?: string }) {
    const q = extras?.q ?? pageData.query ?? "";
    const volume = extras?.minVolume ?? pageData.min_volume ?? 0;
    const sort = extras?.sort ?? pageData.sort ?? "volume";
    const order = extras?.order ?? pageData.order ?? "desc";
    setBusy(true);
    const next = await getAssetTickers(coinId, page, pageData.limit, {
      q,
      minVolume: volume,
      sort,
      order,
    });
    if (next.source === "unavailable" && next.data.length === 0 && pageData.data.length > 0) {
      setError("Could not refresh listings. Showing the last CoinGecko snapshot.");
      setBusy(false);
      return;
    }
    setError(null);
    setPageData(next);
    writeShareableParams({ q, minVolume: volume, sort: next.sort, order: next.order, page: next.page });
    setBusy(false);
  }

  function toggleSort(sort: string) {
    if (pageData.sort === sort) {
      void load(1, { sort, order: pageData.order === "desc" ? "asc" : "desc" });
      return;
    }
    void load(1, { sort, order: DEFAULT_ORDER[sort] || "desc" });
  }

  const pageCount = Math.max(1, Math.ceil((pageData.total || 0) / Math.max(pageData.limit, 1)));
  const empty = pageData.data.length === 0;
  const venueCount = pageData.unique_exchange_count ?? 0;
  const venues = pageData.venues ?? [];
  const filtered = Boolean(pageData.query || (pageData.min_volume && pageData.min_volume > 0));
  const sortLabel = pageData.sort || "volume";
  const orderLabel = pageData.order === "asc" ? "ascending" : "descending";

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
          onChange={(event) => {
            const value = Number(event.target.value);
            setMinVolume(value);
            void load(1, { q: venueDraft, minVolume: value });
          }}
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
        <span className="muted share-hint">Filters write into the URL so you can share this view.</span>
      </form>
      {error ? <p className="table-banner" role="status">{error}</p> : null}
      {venueCount > 0 ? (
        <div className="exchange-summary">
          <strong>{venueCount} venues</strong>
          <span className="muted">
            {pageData.total} matching pairs, sorted by {sortLabel} ({orderLabel})
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
              Exchange markets for {symbol}, sorted by {sortLabel} {orderLabel}.
              Column headers are buttons — Enter or Space sorts. Source: {pageData.source}.
            </caption>
            <thead>
              <tr>
                {COLUMNS.map((column) => {
                  const sorted = pageData.sort === column.sort;
                  const ariaSort = !column.sort
                    ? undefined
                    : sorted
                      ? (pageData.order === "asc" ? "ascending" : "descending")
                      : "none";
                  return (
                    <th key={column.key} scope="col" aria-sort={ariaSort}>
                      {column.sort ? (
                        <button
                          type="button"
                          className={`sort-button ${sorted ? "active" : ""}`}
                          onClick={() => toggleSort(column.sort!)}
                          disabled={busy}
                          title={`Sort by ${column.label}. Enter or Space.`}
                        >
                          {column.label}
                          {sorted ? (pageData.order === "asc" ? " ↑" : " ↓") : ""}
                        </button>
                      ) : column.label}
                    </th>
                  );
                })}
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
                    <span
                      className={`trust-pill trust-${ticker.trust_score || "none"}`}
                      title={ticker.trust_score ? `CoinGecko trust: ${ticker.trust_score}` : "CoinGecko did not score this venue"}
                    >
                      {trustLabel(ticker.trust_score)}
                    </span>
                  </td>
                  <td title={ticker.bid_ask_spread_percentage == null ? "CoinGecko did not report a bid-ask spread" : undefined}>
                    {spreadLabel(ticker.bid_ask_spread_percentage)}
                  </td>
                  <td>
                    {ticker.trade_url ? (
                      <a className="trade-link" href={ticker.trade_url} target="_blank" rel="noreferrer">
                        Open
                      </a>
                    ) : "No link"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <p className="table-swipe muted">Swipe sideways for volume, trust, and trade links. Spread shows on wider screens.</p>
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
