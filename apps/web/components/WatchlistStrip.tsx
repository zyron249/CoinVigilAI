"use client";

import Link from "next/link";
import type { MarketAsset } from "../lib/api";
import { changeClass, formatPercent, formatUsd } from "../lib/format";
import { useWatchlist } from "../lib/watchlist";
import { WatchButton } from "./WatchButton";

function companionId(id: string) {
  return id.toLowerCase() === "bitcoin" ? "ethereum" : "bitcoin";
}

export function WatchlistStrip({ assets }: { assets: MarketAsset[] }) {
  const { items } = useWatchlist();
  const byId = new Map(assets.map((asset) => [asset.id, asset]));
  const compareHref = items.length >= 2
    ? `/compare?ids=${items.slice(0, 3).map((item) => item.id).join(",")}`
    : items.length === 1
      ? `/compare?ids=${items[0].id},${companionId(items[0].id)}`
      : "/compare";

  return (
    <section id="watchlist" className="card watchlist-card">
      <div className="section-heading">
        <div>
          <div className="eyebrow">WATCHLIST</div>
          <h2>Saved in this browser</h2>
        </div>
        <div className="table-tools">
          <Link className="ghost tool-button" href={compareHref}>
            {items.length >= 2 ? "Compare watched" : "Open Compare"}
          </Link>
          <span className="muted">{items.length} saved</span>
        </div>
      </div>
      {items.length === 0 ? (
        <div className="empty empty-panel">
          <strong>No local favorites yet</strong>
          <p>
            Star a coin in the rankings or on an asset page, then Compare watched. The list stays in this browser only —
            CoinVigil has no accounts and does not sync watchlists.
          </p>
        </div>
      ) : (
        <div className="watchlist-list">
          {items.map((item) => {
            const live = byId.get(item.id);
            return (
              <div className="watchlist-row" key={item.id}>
                <WatchButton id={item.id} symbol={item.symbol} name={item.name} compact />
                <Link className="asset-link" href={`/asset/${item.id}`}>
                  <strong>{live?.name || item.name}</strong>
                  <span>{(live?.symbol || item.symbol).toUpperCase()}</span>
                </Link>
                <div className="watchlist-values">
                  <span>{live ? formatUsd(live.current_price) : "Not in this snapshot"}</span>
                  <span className={changeClass(live?.price_change_percentage_24h)}>
                    {live ? formatPercent(live.price_change_percentage_24h) : "Open asset"}
                  </span>
                  <Link className="trade-link" href={`/asset/${item.id}#contracts`}>Contracts</Link>
                  <Link className="trade-link" href={`/compare?ids=${item.id},${companionId(item.id)}`}>
                    Compare
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <p className="watchlist-footnote muted">
        {items.length === 1
          ? "Star one more coin to compare two watched assets. Local only — not financial advice."
          : "Local only — no account, no server copy. Compare uses the shareable ?ids= URL. Not financial advice."}
      </p>
    </section>
  );
}
