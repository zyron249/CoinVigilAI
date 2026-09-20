"use client";

import Link from "next/link";
import { memo } from "react";
import type { MarketAsset, MarketPage } from "../lib/api";
import { changeClass, formatCompact, formatCompactUsd, formatPercent, formatTimestamp, formatUsd } from "../lib/format";
import { Sparkline } from "./Sparkline";
import { StatusBadge } from "./StatusBadge";
import { WatchButton } from "./WatchButton";

const COLUMNS: { key: string; label: string; sort?: string }[] = [
  { key: "rank", label: "#", sort: "rank" },
  { key: "name", label: "Name", sort: "name" },
  { key: "price", label: "Price", sort: "price" },
  { key: "change_1h", label: "1h", sort: "change_1h" },
  { key: "change_24h", label: "24h", sort: "change_24h" },
  { key: "change_7d", label: "7d", sort: "change_7d" },
  { key: "market_cap", label: "Market cap", sort: "market_cap" },
  { key: "volume", label: "Volume (24h)", sort: "volume" },
  { key: "supply", label: "Circulating supply" },
  { key: "spark", label: "Last 7 days" },
];

const MarketRow = memo(function MarketRow({ asset }: { asset: MarketAsset }) {
  return (
    <tr className="market-row">
      <td>{asset.market_cap_rank ?? "—"}</td>
      <td>
        <Link className="asset-link" href={`/asset/${asset.id}`}>
          <div className="asset-cell">
            <WatchButton id={asset.id} symbol={asset.symbol} name={asset.name} compact />
            {asset.image
              ? <img src={asset.image} alt="" width={28} height={28} />
              : <div className="coin-placeholder" aria-hidden="true" />}
            <div>
              <strong>{asset.name}</strong>
              <span>{asset.symbol.toUpperCase()}</span>
            </div>
          </div>
        </Link>
      </td>
      <td>{formatUsd(asset.current_price)}</td>
      <td className={changeClass(asset.price_change_percentage_1h)}>{formatPercent(asset.price_change_percentage_1h)}</td>
      <td className={changeClass(asset.price_change_percentage_24h)}>{formatPercent(asset.price_change_percentage_24h)}</td>
      <td className={changeClass(asset.price_change_percentage_7d)}>{formatPercent(asset.price_change_percentage_7d)}</td>
      <td>{formatCompactUsd(asset.market_cap)}</td>
      <td>{formatCompactUsd(asset.total_volume)}</td>
      <td>{formatCompact(asset.circulating_supply)} {asset.symbol.toUpperCase()}</td>
      <td><Sparkline values={asset.sparkline_7d} /></td>
    </tr>
  );
});

export function MarketTable({
  pageData,
  busy = false,
  refreshError,
  checkedAt,
  onQuery,
}: {
  pageData: MarketPage;
  busy?: boolean;
  refreshError?: string | null;
  checkedAt?: string | null;
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
              const value = new FormData(event.currentTarget).get("q");
              onQuery({ q: String(value || ""), page: 1 });
            }}
          >
            <label className="sr-only" htmlFor="market-search">Search CoinGecko-tracked assets</label>
            <input
              id="market-search"
              name="q"
              type="search"
              defaultValue={pageData.query || ""}
              placeholder="Search name, symbol, or id"
              autoComplete="off"
              disabled={busy}
            />
            <button type="submit" className="ghost tool-button" disabled={busy}>Search</button>
          </form>
          <StatusBadge source={pageData.source} stale={pageData.stale} />
        </div>
      </div>
      {refreshError ? (
        <p className="table-banner" role="status">{refreshError}</p>
      ) : null}
      <div className={`table-wrap ${busy ? "is-busy" : ""}`} aria-busy={busy}>
        {empty ? (
          <div className="empty empty-panel table-empty">
            <strong>No rankings to show</strong>
            <p>
              {pageData.source === "unavailable" || refreshError
                ? "Rankings are unavailable right now. CoinVigil does not invent prices to fill the table."
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
      <p className="table-swipe muted">Swipe sideways on small screens to see 1h/24h/7d, volume, supply, and 7d sparkline.</p>
      <div className="table-footer">
        <div className="muted">
          Showing {pageData.assets.length} of {pageData.total} matching assets
          {pageData.universe_size ? ` · snapshot ${pageData.universe_size}` : ""}
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
            {[20, 50, 100].map((size) => <option key={size} value={size}>{size} / page</option>)}
          </select>
          <button type="button" className="ghost tool-button" disabled={pageData.page <= 1 || busy} onClick={() => onQuery({ page: pageData.page - 1 })}>
            Previous
          </button>
          <span className="muted">Page {pageData.page} / {pageCount}</span>
          <button type="button" className="ghost tool-button" disabled={pageData.page >= pageCount || busy} onClick={() => onQuery({ page: pageData.page + 1 })}>
            Next
          </button>
        </div>
      </div>
      {pageData.coverage_note ? <p className="coverage-note muted">{pageData.coverage_note}</p> : null}
    </div>
  );
}
