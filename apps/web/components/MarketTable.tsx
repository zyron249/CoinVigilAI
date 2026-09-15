import Link from "next/link";
import type { MarketAsset } from "../lib/api";

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});

const compact = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 2,
});

export function MarketTable({ assets }: { assets: MarketAsset[] }) {
  return (
    <div className="card table-card">
      <div className="section-heading">
        <div>
          <div className="eyebrow">LIVE MARKET</div>
          <h2>Top assets</h2>
        </div>
        <span className="live-dot">● Live</span>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Asset</th>
              <th>Price</th>
              <th>24h</th>
              <th>Market cap</th>
              <th>Volume</th>
            </tr>
          </thead>
          <tbody>
            {assets.map((asset) => {
              const change = asset.price_change_percentage_24h ?? 0;
              return (
                <tr key={asset.id} className="market-row">
                  <td>{asset.market_cap_rank ?? "—"}</td>
                  <td>
                    <Link className="asset-link" href={`/asset/${asset.id}`}>
                      <div className="asset-cell">
                        {asset.image ? <img src={asset.image} alt="" width={28} height={28} /> : <div className="coin-placeholder" />}
                        <div>
                          <strong>{asset.name}</strong>
                          <span>{asset.symbol.toUpperCase()} · Open chart</span>
                        </div>
                      </div>
                    </Link>
                  </td>
                  <td>{usd.format(asset.current_price ?? 0)}</td>
                  <td className={change >= 0 ? "positive" : "negative"}>{change >= 0 ? "+" : ""}{change.toFixed(2)}%</td>
                  <td>${compact.format(asset.market_cap ?? 0)}</td>
                  <td>${compact.format(asset.total_volume ?? 0)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
