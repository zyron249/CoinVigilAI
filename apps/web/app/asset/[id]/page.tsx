import Link from "next/link";
import { notFound } from "next/navigation";

import { ProChartLab } from "../../../components/ProChartLab";
import { getAssetAnalysis, getCandles } from "../../../lib/api";

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 6,
});

const compact = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 2,
});

export default async function AssetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [analysis, candleResponse] = await Promise.all([
    getAssetAnalysis(id),
    getCandles(id, 90),
  ]);

  if (!analysis) notFound();

  const asset = analysis.asset;
  const change = asset.price_change_percentage_24h ?? 0;

  return (
    <main>
      <nav>
        <Link className="brand" href="/"><span className="brand-mark">V</span> CoinVigil <b>AI</b></Link>
        <div className="nav-links">
          <Link href="/">Markets</Link>
          <Link href="/token-studio">Token Studio</Link>
        </div>
        <Link className="nav-cta" href="/token-studio">Create Token</Link>
      </nav>

      <section className="asset-hero">
        <div className="asset-title-row">
          {asset.image ? <img src={asset.image} alt="" width={52} height={52} /> : null}
          <div>
            <div className="eyebrow">ASSET INTELLIGENCE</div>
            <h1>{asset.name} <span>{asset.symbol.toUpperCase()}</span></h1>
          </div>
        </div>
        <div className="asset-price-block">
          <strong>{usd.format(asset.current_price ?? 0)}</strong>
          <span className={change >= 0 ? "positive" : "negative"}>{change >= 0 ? "+" : ""}{change.toFixed(2)}% 24h</span>
        </div>
      </section>

      <section className="asset-metrics">
        <div className="card mini-metric"><span>Market cap</span><strong>${compact.format(asset.market_cap ?? 0)}</strong></div>
        <div className="card mini-metric"><span>24h volume</span><strong>${compact.format(asset.total_volume ?? 0)}</strong></div>
        <div className="card mini-metric"><span>AI bias</span><strong className="capitalize">{analysis.bias}</strong></div>
        <div className="card mini-metric"><span>AI confidence</span><strong>{analysis.confidence}%</strong></div>
        <div className="card mini-metric"><span>Risk</span><strong>{analysis.risk.score}/100 · {analysis.risk.level}</strong></div>
      </section>

      <ProChartLab
        coinId={asset.id}
        symbol={asset.symbol}
        candles={candleResponse.data}
        source={candleResponse.source}
      />

      <section className="analysis-grid">
        <div className="card analysis-card">
          <div className="eyebrow">AI COUNCIL VIEW</div>
          <h2>{analysis.bias.toUpperCase()} · {analysis.confidence}% confidence</h2>
          <p>{analysis.summary}</p>
          <div className="analysis-meta">Engine: {analysis.engine}</div>
        </div>
        <div className="card analysis-card">
          <div className="eyebrow">RISK DRIVERS</div>
          <h2>{analysis.risk.level} risk</h2>
          <ul>
            {analysis.risk.drivers.map((driver) => <li key={driver}>{driver}</li>)}
          </ul>
        </div>
      </section>

      <footer>
        <div>CoinVigil AI · Interactive research workspace, not financial advice.</div>
        <div>v0.3.0</div>
      </footer>
    </main>
  );
}
