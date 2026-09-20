import Link from "next/link";
import type { MarketAsset } from "../lib/api";
import { changeClass, formatPercent, formatUsd } from "../lib/format";
import { StatusBadge } from "./StatusBadge";

function MoverList({
  title,
  assets,
  empty,
  source,
  stale,
}: {
  title: string;
  assets: MarketAsset[];
  empty: string;
  source: string;
  stale?: boolean;
}) {
  return (
    <div className="card mover-card">
      <div className="section-heading">
        <div>
          <div className="eyebrow">{title}</div>
          <h2>24h</h2>
        </div>
        <div className="table-tools">
          {assets.length >= 2 ? (
            <Link className="ghost tool-button" href={`/compare?ids=${assets.slice(0, 3).map((asset) => asset.id).join(",")}`}>
              Compare
            </Link>
          ) : null}
          <StatusBadge source={source} stale={stale} />
        </div>
      </div>
      <div className="mover-list">
        {assets.length === 0 ? (
          <div className="empty empty-panel">
            <strong>No {title.toLowerCase()} yet</strong>
            <p>{empty}</p>
          </div>
        ) : assets.map((asset) => {
          const change = asset.price_change_percentage_24h;
          return (
            <Link className="mover-row" key={`${title}-${asset.id}`} href={`/asset/${asset.id}`}>
              <div className="asset-cell">
                {asset.image ? <img src={asset.image} alt="" width={24} height={24} /> : <div className="coin-placeholder" aria-hidden="true" />}
                <div>
                  <strong>{asset.symbol.toUpperCase()}</strong>
                  <span>{asset.name}</span>
                </div>
              </div>
              <div className="mover-values">
                <span>{formatUsd(asset.current_price)}</span>
                <span className={changeClass(change)}>{formatPercent(change)}</span>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export function Movers({
  gainers,
  losers,
  source,
  stale,
}: {
  gainers: MarketAsset[];
  losers: MarketAsset[];
  source: string;
  stale?: boolean;
}) {
  return (
    <>
      <MoverList
        title="Top gainers"
        assets={gainers}
        empty="No 24h gainers in the current snapshot. CoinVigil does not invent movers."
        source={source}
        stale={stale}
      />
      <MoverList
        title="Top losers"
        assets={losers}
        empty="No 24h losers in the current snapshot. Flat coins stay off this list."
        source={source}
        stale={stale}
      />
    </>
  );
}
