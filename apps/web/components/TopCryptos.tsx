import Link from "next/link";
import type { MarketAsset } from "../lib/api";
import { changeClass, formatCompactUsd, formatPercent, formatUsd } from "../lib/format";
import { Sparkline } from "./Sparkline";
import { WatchButton } from "./WatchButton";

export function TopCryptos({ assets }: { assets: MarketAsset[] }) {
  const rows = assets.slice(0, 5);
  return (
    <section className="card top-cryptos">
      <div className="section-heading">
        <div>
          <div className="eyebrow">TOP CRYPTOCURRENCIES</div>
          <h2>This CoinGecko snapshot</h2>
        </div>
        <Link className="ghost tool-button" href="/#markets">View all</Link>
      </div>
      {rows.length === 0 ? (
        <div className="empty empty-panel">
          <strong>No ranked assets</strong>
          <p>The snapshot is empty. CoinVigil does not invent a top-5 table.</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="markets-table top-cryptos-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Name</th>
                <th>Price</th>
                <th>24h %</th>
                <th>Market cap</th>
                <th>Last 7 days</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((asset) => (
                <tr className="market-row" key={asset.id}>
                  <td>{asset.market_cap_rank ?? "—"}</td>
                  <td>
                    <div className="asset-cell">
                      <WatchButton id={asset.id} symbol={asset.symbol} name={asset.name} compact />
                      {asset.image ? <img src={asset.image} alt="" width={20} height={20} /> : <div className="coin-placeholder" aria-hidden="true" />}
                      <Link className="asset-link" href={`/asset/${asset.id}`}>
                        <strong>{asset.name}</strong>
                        <span>{asset.symbol.toUpperCase()}</span>
                      </Link>
                      <nav className="asset-row-jumps" aria-label={`${asset.name} sections`}>
                        <Link href={`/asset/${asset.id}#overview`}>Overview</Link>
                        <Link href={`/asset/${asset.id}#contracts`}>Contracts</Link>
                        <Link href={`/asset/${asset.id}#chart-lab`}>Chart</Link>
                      </nav>
                    </div>
                  </td>
                  <td>{formatUsd(asset.current_price)}</td>
                  <td className={changeClass(asset.price_change_percentage_24h)}>{formatPercent(asset.price_change_percentage_24h)}</td>
                  <td>{formatCompactUsd(asset.market_cap)}</td>
                  <td className="spark-cell">
                    {asset.sparkline_7d && asset.sparkline_7d.length >= 2
                      ? <Sparkline values={asset.sparkline_7d} width={96} height={24} />
                      : <span className="muted">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
