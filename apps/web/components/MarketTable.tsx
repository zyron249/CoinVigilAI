"use client";

import Link from "next/link";
import { useState } from "react";
import type { MarketPage } from "../lib/api";
import { getMarket } from "../lib/api";
import { changeClass, formatCompact, formatCompactUsd, formatPercent, formatUsd } from "../lib/format";
import { Sparkline } from "./Sparkline";
import { StatusBadge } from "./StatusBadge";

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

export function MarketTable({ initial }: { initial: MarketPage }) {
  const [pageData, setPageData] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(initial.error ?? null);

  async function load(next: { page?: number; limit?: number; sort?: string; order?: string }) {
    setBusy(true);
    const query = {
      page: next.page ?? pageData.page,
      limit: next.limit ?? pageData.limit,
      sort: next.sort ?? pageData.sort,
      order: next.order ?? pageData.order,
    };
    const result = await getMarket(query);
    if (result.error && result.assets.length === 0 && pageData.assets.length > 0) {
      setRefreshError("Could not refresh rankings. Showing the last loaded snapshot.");
      setBusy(false);
      return;
    }
    setRefreshError(result.error ?? null);
    setPageData(result);
    setBusy(false);
  }

  function toggleSort(sort: string) {
    if (pageData.sort === sort) {
      void load({ sort, order: pageData.order === "desc" ? "asc" : "desc", page: 1 });
      return;
    }
    void load({ sort, order: sort === "name" || sort === "rank" ? "asc" : "desc", page: 1 });
  }

  const pageCount = Math.max(1, Math.ceil((pageData.total || 0) / Math.max(pageData.limit, 1)));
  const empty = pageData.assets.length === 0;

  return (
    <div className="card table-card">
      <div className="section-heading">
        <div>
          <div className="eyebrow">MARKET SNAPSHOT</div>
          <h2>Cryptocurrency rankings</h2>
        </div>
        <StatusBadge source={pageData.source} />
      </div>
      {refreshError ? (
        <p className="table-banner" role="status">{refreshError}</p>
      ) : null}
      <div className={`table-wrap ${busy ? "is-busy" : ""}`} aria-busy={busy}>
        {empty ? (
          <div className="empty table-empty">
            {pageData.source === "unavailable" || refreshError
              ? "Rankings are unavailable right now. CoinVigil does not invent prices to fill the table."
              : "No assets on this page of the ranked universe."}
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
                <tr key={asset.id} className="market-row">
                  <td>{asset.market_cap_rank ?? "—"}</td>
                  <td>
                    <Link className="asset-link" href={`/asset/${asset.id}`}>
                      <div className="asset-cell">
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
              ))}
            </tbody>
          </table>
        )}
        {busy ? <div className="table-progress muted">Updating rankings…</div> : null}
      </div>
      <p className="table-swipe muted">Swipe sideways on small screens to see 1h/24h/7d, volume, supply, and 7d sparkline.</p>
      <div className="table-footer">
        <div className="muted">
          Showing {pageData.assets.length} of {pageData.total} ranked assets
          {busy ? " · updating…" : ""}
        </div>
        <div className="pager">
          <select
            value={pageData.limit}
            onChange={(event) => void load({ limit: Number(event.target.value), page: 1 })}
            aria-label="Rows per page"
            disabled={busy}
          >
            {[20, 50, 100].map((size) => <option key={size} value={size}>{size} / page</option>)}
          </select>
          <button type="button" className="ghost tool-button" disabled={pageData.page <= 1 || busy} onClick={() => void load({ page: pageData.page - 1 })}>
            Previous
          </button>
          <span className="muted">Page {pageData.page} / {pageCount}</span>
          <button type="button" className="ghost tool-button" disabled={pageData.page >= pageCount || busy} onClick={() => void load({ page: pageData.page + 1 })}>
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
