"use client";

import Link from "next/link";
import { memo } from "react";
import type { MarketAsset, MarketPage } from "../lib/api";
import { changeClass, formatCompactUsd, formatPercent, formatTimestamp, formatUsd } from "../lib/format";
import { MARKET_LIMITS, pageWindow, rowRange, searchAnnouncement } from "../lib/pagination";
import { Sparkline } from "./Sparkline";
import { StatusBadge } from "./StatusBadge";
import { WatchButton } from "./WatchButton";

const COLUMNS: { key: string; label: string; sort?: string }[] = [
  { key: "watch", label: "" },
  { key: "rank", label: "#", sort: "rank" },
  { key: "name", label: "Name", sort: "name" },
  { key: "price", label: "Price", sort: "price" },
  { key: "change_1h", label: "1h", sort: "change_1h" },
  { key: "change_24h", label: "24h", sort: "change_24h" },
  { key: "change_7d", label: "7d", sort: "change_7d" },
  { key: "market_cap", label: "Market cap", sort: "market_cap" },
  { key: "volume", label: "Volume (24h)", sort: "volume" },
  { key: "spark", label: "Last 7 days" },
];

const MarketRow = memo(function MarketRow({ asset }: { asset: MarketAsset }) {
  const spark = asset.sparkline_7d;
  return (
    <tr className="market-row">
      <td className="watch-cell">
        <WatchButton id={asset.id} symbol={asset.symbol} name={asset.name} compact />
      </td>
      <td className="rank-cell">{asset.market_cap_rank ?? "—"}</td>
      <td>
        <div className="asset-cell">
          {asset.image
            ? <img src={asset.image} alt="" width={20} height={20} />
            : <div className="coin-placeholder" aria-hidden="true" />}
          <Link className="asset-link" href={`/asset/${asset.id}`}>
            <strong>{asset.name}</strong>
            <span>{asset.symbol.toUpperCase()}</span>
          </Link>
        </div>
      </td>
      <td>{formatUsd(asset.current_price)}</td>
      <td className={changeClass(asset.price_change_percentage_1h)}>{formatPercent(asset.price_change_percentage_1h)}</td>
      <td className={changeClass(asset.price_change_percentage_24h)}>{formatPercent(asset.price_change_percentage_24h)}</td>
      <td className={changeClass(asset.price_change_percentage_7d)}>{formatPercent(asset.price_change_percentage_7d)}</td>
      <td>{formatCompactUsd(asset.market_cap)}</td>
      <td>{formatCompactUsd(asset.total_volume)}</td>
      <td className="spark-cell">
        {spark && spark.length >= 2 ? <Sparkline values={spark} width={96} height={24} /> : <span className="muted">—</span>}
      </td>
    </tr>
  );
});

export function MarketTable({
  pageData,
  busy = false,
  refreshError,
  checkedAt,
  draft,
  onDraft,
  onQuery,
}: {
  pageData: MarketPage;
  busy?: boolean;
  refreshError?: string | null;
  checkedAt?: string | null;
  draft: string;
  onDraft: (value: string) => void;
  onQuery: (next: { page?: number; limit?: number; sort?: string; order?: string; q?: string }) => void;
}) {
  function toggleSort(sort: string) {
    if (pageData.sort === sort) {
      onQuery({ sort, order: pageData.order === "desc" ? "asc" : "desc", page: 1 });
      return;
    }
    onQuery({ sort, order: sort === "name" || sort === "rank" ? "asc" : "desc", page: 1 });
  }

  const pageCount = Math.max(1, Math.ceil((pageData.total || 0) / Math.max(pageData.limit, 1)));
  const empty = pageData.assets.length === 0;
  const lastLive = formatTimestamp(pageData.last_live_at);
  const asOf = formatTimestamp(pageData.as_of);
  const checked = formatTimestamp(checkedAt);
  const range = rowRange(pageData.page, pageData.limit, pageData.total);
  const pages = pageWindow(pageData.page, pageCount);
  const announcement = searchAnnouncement({
    query: pageData.query,
    total: pageData.total,
    page: pageData.page,
    limit: pageData.limit,
    universe: pageData.universe_size,
    coverageTarget: pageData.coverage_target,
  });

  return (
    <div className="card table-card">
      <div className="section-heading">
        <div>
          <div className="eyebrow">MARKET SNAPSHOT</div>
          <h2>Cryptocurrency rankings</h2>
        </div>
        <div className="table-tools">
          <form
            className="market-search"
            onSubmit={(event) => {
              event.preventDefault();
              onQuery({ q: draft, page: 1 });
              document.getElementById("markets")?.scrollIntoView({ behavior: "smooth", block: "start" });
            }}
          >
            <label className="sr-only" htmlFor="market-search">Search CoinGecko-tracked assets</label>
            <input
              id="market-search"
              name="q"
              type="search"
              value={draft}
              onChange={(event) => onDraft(event.target.value)}
              placeholder="Search name, symbol, or id"
              autoComplete="off"
              aria-busy={busy}
              aria-describedby="market-results-status"
            />
            <button type="submit" className="ghost tool-button">Search</button>
            {pageData.query || draft ? (
              <button
                type="button"
                className="ghost tool-button"
                onClick={() => {
                  onDraft("");
                  onQuery({ q: "", page: 1 });
                }}
              >
                Clear
              </button>
            ) : null}
          </form>
          <StatusBadge source={pageData.source} stale={pageData.stale} />
        </div>
      </div>
      <p id="market-results-status" className="sr-only" aria-live="polite" aria-atomic="true">
        {announcement}
      </p>
      {pageData.query ? (
        <p className="table-banner">
          Filtered to “{pageData.query}” in this CoinGecko snapshot ({pageData.total} matches).
        </p>
      ) : null}
      {refreshError ? (
        <p className="table-banner" role="status">{refreshError}</p>
      ) : null}
      <div className={`table-wrap ${busy ? "is-busy" : ""}`} aria-busy={busy}>
        {empty ? (
          <div className="empty empty-panel table-empty">
            <strong>{pageData.query ? `No matches for “${pageData.query}”` : "No rankings to show"}</strong>
            <p>
              {pageData.source === "unavailable" || refreshError
                ? "Rankings are unavailable right now. CoinVigil does not invent prices to fill the table."
                : pageData.query
                  ? "Search looks at name, symbol, and CoinGecko id in this snapshot, then tries an exact-id lookup. It is not every coin on earth."
                  : "No assets on this page of the ranked universe. Try another page or sort."}
            </p>
          </div>
        ) : (
          <table className="markets-table">
            <caption className="sr-only">
              Cryptocurrency rankings sorted by {pageData.sort} {pageData.order}. Source: {pageData.source}.
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
              {pageData.assets.map((asset) => (
                <MarketRow key={asset.id} asset={asset} />
              ))}
            </tbody>
          </table>
        )}
        {busy ? <div className="table-progress muted">Updating rankings…</div> : null}
      </div>
      <p className="table-swipe muted">Swipe sideways on small screens to see 1h/24h/7d, volume, and 7d sparkline.</p>
      <div className="table-footer">
        <div className="muted">
          {range.start
            ? `Rows ${range.start}–${range.end} of ${pageData.total} matching · page ${pageData.page} of ${pageCount}`
            : `No rows on this page · page ${pageData.page} of ${pageCount}`}
          {pageData.universe_size ? ` · ${pageData.universe_size} of ${pageData.coverage_target || 1000} CoinGecko-tracked in snapshot` : ""}
          {pageData.stale && lastLive ? ` · last live ${lastLive}` : asOf ? ` · last updated ${asOf}` : ""}
          {checked && checked !== asOf ? ` · checked ${checked}` : ""}
          {busy ? " · updating…" : ""}
        </div>
        <div className="pager">
          <select
            value={pageData.limit}
            onChange={(event) => onQuery({ limit: Number(event.target.value), page: 1 })}
            aria-label="Rows per page"
            disabled={busy}
          >
            {MARKET_LIMITS.map((size) => <option key={size} value={size}>{size} / page</option>)}
          </select>
          <button type="button" className="ghost tool-button" disabled={pageData.page <= 1 || busy} onClick={() => onQuery({ page: pageData.page - 1 })} aria-label={`Previous rankings page, currently ${pageData.page} of ${pageCount}`}>
            Previous
          </button>
          <div className="pager-pages" role="navigation" aria-label="Rankings pages">
            {pages.map((item, index) => (
              item === "ellipsis" ? (
                <span className="muted pager-ellipsis" key={`ellipsis-${index}`}>…</span>
              ) : (
                <button
                  key={item}
                  type="button"
                  className={`ghost tool-button pager-page${item === pageData.page ? " is-on" : ""}`}
                  aria-current={item === pageData.page ? "page" : undefined}
                  aria-label={`Page ${item} of ${pageCount}`}
                  disabled={busy}
                  onClick={() => onQuery({ page: item })}
                >
                  {item}
                </button>
              )
            ))}
          </div>
          <button type="button" className="ghost tool-button" disabled={pageData.page >= pageCount || busy} onClick={() => onQuery({ page: pageData.page + 1 })} aria-label={`Next rankings page, currently ${pageData.page} of ${pageCount}`}>
            Next
          </button>
        </div>
      </div>
      {pageData.coverage_note ? <p className="coverage-note muted">{pageData.coverage_note}</p> : null}
    </div>
  );
}
