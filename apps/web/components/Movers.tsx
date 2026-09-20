import Link from "next/link";
import type { MarketAsset } from "../lib/api";
import { changeClass, formatPercent, formatUsd, sourceLabel } from "../lib/format";

function MoverList({ title, assets, empty, source }: { title: string; assets: MarketAsset[]; empty: string; source: string }) {
  const label = sourceLabel(source);
  return (
    <div className="card mover-card">
      <div className="section-heading">
        <div>
          <div className="eyebrow">{title}</div>
          <h2>24h</h2>
        </div>
        <span className={label.demo ? "live-dot demo" : "live-dot"}>{label.text}</span>
      </div>
      <div className="mover-list">
        {assets.length === 0 ? <div className="empty">{empty}</div> : assets.map((asset) => {
          const change = asset.price_change_percentage_24h;
          return (
            <Link className="mover-row" key={`${title}-${asset.id}`} href={`/asset/${asset.id}`}>
              <div className="asset-cell">
                {asset.image ? <img src={asset.image} alt="" width={24} height={24} /> : <div className="coin-placeholder" />}
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
}: {
  gainers: MarketAsset[];
  losers: MarketAsset[];
  source: string;
}) {
  return (
    <>
      <MoverList title="Top gainers" assets={gainers} empty="No 24h gainers in the current snapshot." source={source} />
      <MoverList title="Top losers" assets={losers} empty="No 24h losers in the current snapshot." source={source} />
    </>
  );
}
