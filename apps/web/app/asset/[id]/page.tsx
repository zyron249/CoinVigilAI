import { CouncilRoster } from "../../../components/CouncilRoster";
import { DemoRibbon } from "../../../components/DemoRibbon";
import { ProChartLab } from "../../../components/ProChartLab";
import { Sparkline } from "../../../components/Sparkline";
import { StatusBadge } from "../../../components/StatusBadge";
import { getAssetAnalysis, getCandles, getCouncilStatus } from "../../../lib/api";
import { changeClass, formatCompact, formatCompactUsd, formatPercent, formatTimestamp, formatUsd } from "../../../lib/format";
import { notFound } from "next/navigation";

export default async function AssetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [analysis, candleResponse, councilStatus] = await Promise.all([
    getAssetAnalysis(id),
    getCandles(id, 90),
    getCouncilStatus(),
  ]);

  if (!analysis) notFound();

  const asset = analysis.asset;
  const change = asset.price_change_percentage_24h;

  const stats = [
    { label: "Rank", value: asset.market_cap_rank != null ? `#${asset.market_cap_rank}` : "—" },
    { label: "Market cap", value: formatCompactUsd(asset.market_cap) },
    { label: "Fully diluted", value: formatCompactUsd(asset.fully_diluted_valuation) },
    { label: "24h volume", value: formatCompactUsd(asset.total_volume) },
    { label: "Circulating", value: `${formatCompact(asset.circulating_supply)} ${asset.symbol.toUpperCase()}` },
    { label: "24h high", value: formatUsd(asset.high_24h) },
    { label: "24h low", value: formatUsd(asset.low_24h) },
    { label: "1h", value: formatPercent(asset.price_change_percentage_1h), className: changeClass(asset.price_change_percentage_1h) },
    { label: "7d", value: formatPercent(asset.price_change_percentage_7d), className: changeClass(asset.price_change_percentage_7d) },
    { label: "Risk", value: `${analysis.risk.score}/100 · ${analysis.risk.level}` },
  ];

  return (
    <main id="content">
      <DemoRibbon source={analysis.data_source} lastLiveAt={asset.last_updated} />

      <section className="asset-hero">
        <div className="asset-title-row">
          {asset.image ? <img src={asset.image} alt="" width={52} height={52} /> : null}
          <div>
            <div className="eyebrow">ASSET INTELLIGENCE</div>
            <h1>{asset.name} <span>{asset.symbol.toUpperCase()}</span></h1>
            <StatusBadge source={analysis.data_source} />
            {formatTimestamp(asset.last_updated) ? (
              <p className="live-updated muted">Last updated: {formatTimestamp(asset.last_updated)}</p>
            ) : null}
          </div>
        </div>
        <div className="asset-price-block">
          <strong>{formatUsd(asset.current_price)}</strong>
          <span className={changeClass(change)}>{formatPercent(change)} 24h</span>
          <Sparkline values={asset.sparkline_7d} width={160} height={40} />
        </div>
      </section>

      <section className="asset-metrics asset-metrics-wide">
        {stats.map((stat) => (
          <div className="card mini-metric" key={stat.label}>
            <span>{stat.label}</span>
            <strong className={stat.className}>{stat.value}</strong>
          </div>
        ))}
      </section>

      <ProChartLab
        coinId={asset.id}
        symbol={asset.symbol}
        candles={candleResponse.data}
        source={candleResponse.source}
      />

      <section className="analysis-grid">
        <div className="card analysis-card">
          <div className="eyebrow">AI ANALYSIS</div>
          <h2>{analysis.bias.toUpperCase()} · {analysis.confidence}% confidence</h2>
          <p>{analysis.summary}</p>
          {analysis.council ? (
            <ul className="council-meta">
              <li>Weighted agreement: {(analysis.council.agreement * 100).toFixed(0)}%</li>
              <li>Responded: {analysis.council.providers_responded.join(", ") || "none"}</li>
              {analysis.council.dissent.length > 0 ? <li>Dissent: {analysis.council.dissent.join(", ")}</li> : null}
            </ul>
          ) : (
            <p className="analysis-meta">
              Engine: {analysis.engine}. Optional council models such as xAI Grok stay idle until their keys are set.
            </p>
          )}
          {analysis.council ? <div className="analysis-meta">Engine: {analysis.engine}</div> : null}
          <p className="brief-disclaimer">{analysis.disclaimer || "AI output is informational research, not financial advice."}</p>
        </div>
        <div className="card analysis-card">
          <div className="eyebrow">RISK DRIVERS</div>
          <h2>{analysis.risk.level} risk</h2>
          <ul>
            {analysis.risk.drivers.map((driver) => <li key={driver}>{driver}</li>)}
          </ul>
        </div>
      </section>

      <CouncilRoster
        providers={councilStatus.providers}
        configured={councilStatus.configured}
        supported={councilStatus.supported}
        results={analysis.council?.results ?? []}
      />
    </main>
  );
}
