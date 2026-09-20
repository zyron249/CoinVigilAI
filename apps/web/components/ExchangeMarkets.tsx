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

  async function go(page: number) {
    setBusy(true);
    const next = await getAssetTickers(coinId, page, pageData.limit);
    setPageData(next);
    setBusy(false);
  }

  const pageCount = Math.max(1, Math.ceil((pageData.total || 0) / Math.max(pageData.limit, 1)));
  const empty = pageData.data.length === 0;

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
      <div className={`table-wrap ${busy ? "is-busy" : ""}`} aria-busy={busy}>
        {empty ? (
          <div className="empty empty-panel table-empty">
            <strong>No exchange listings in this snapshot</strong>
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
          <button type="button" className="ghost tool-button" disabled={pageData.page <= 1 || busy} onClick={() => { void go(pageData.page - 1); }}>
            Previous
          </button>
          <span className="muted">Page {pageData.page} / {pageCount}</span>
          <button type="button" className="ghost tool-button" disabled={pageData.page >= pageCount || busy} onClick={() => { void go(pageData.page + 1); }}>
            Next
          </button>
        </div>
      </div>
    </section>
  );
}
