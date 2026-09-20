import { AssetWorkspace } from "../../../components/AssetWorkspace";
import { CouncilRoster } from "../../../components/CouncilRoster";
import { DemoRibbon } from "../../../components/DemoRibbon";
import { ProjectLinks } from "../../../components/ProjectLinks";
import { Sparkline } from "../../../components/Sparkline";
import { RangeBar, SupplyBar } from "../../../components/StatBars";
import { StatusBadge } from "../../../components/StatusBadge";
import { WatchButton } from "../../../components/WatchButton";
import { getAssetAnalysis, getAssetProfile, getAssetTickers, getCandles, getCouncilStatus } from "../../../lib/api";
import { changeClass, formatCompact, formatCompactUsd, formatDate, formatPercent, formatTimestamp, formatUsd } from "../../../lib/format";
import Link from "next/link";
import { notFound } from "next/navigation";

function firstParam(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0];
  return value;
}

export default async function AssetPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const q = firstParam(query.q) || "";
  const sort = firstParam(query.sort) || "volume";
  const order = firstParam(query.order) || "";
  const page = Number(firstParam(query.page) || "1") || 1;
  const minVolume = Number(firstParam(query.min_volume) || "0") || 0;
  const companion = id.toLowerCase() === "ethereum" ? "bitcoin" : "ethereum";
  const [analysis, candleResponse, councilStatus, tickers, profile] = await Promise.all([
    getAssetAnalysis(id),
    getCandles(id, 90),
    getCouncilStatus(),
    getAssetTickers(id, page, 25, { q, minVolume, sort, order: order || undefined }),
    getAssetProfile(id),
  ]);

  if (!analysis) notFound();

  const asset = analysis.asset;
  const change = asset.price_change_percentage_24h;

  const volToCap = asset.market_cap && asset.total_volume
    ? `${((asset.total_volume / asset.market_cap) * 100).toFixed(2)}%`
    : "—";

  const stats = [
    { label: "Rank", value: asset.market_cap_rank != null ? `#${asset.market_cap_rank}` : "—" },
    { label: "Market cap", value: formatCompactUsd(asset.market_cap) },
    { label: "Fully diluted", value: formatCompactUsd(asset.fully_diluted_valuation) },
    { label: "24h volume", value: formatCompactUsd(asset.total_volume) },
    { label: "Vol / Mkt cap", value: volToCap },
    { label: "Circulating", value: `${formatCompact(asset.circulating_supply)} ${asset.symbol.toUpperCase()}` },
    { label: "Total supply", value: `${formatCompact(asset.total_supply)} ${asset.symbol.toUpperCase()}` },
    { label: "Max supply", value: asset.max_supply ? `${formatCompact(asset.max_supply)} ${asset.symbol.toUpperCase()}` : "—" },
    { label: "1h", value: formatPercent(asset.price_change_percentage_1h), className: changeClass(asset.price_change_percentage_1h) },
    { label: "24h", value: formatPercent(asset.price_change_percentage_24h), className: changeClass(asset.price_change_percentage_24h) },
    { label: "7d", value: formatPercent(asset.price_change_percentage_7d), className: changeClass(asset.price_change_percentage_7d) },
    { label: "ATH", value: asset.ath_date ? `${formatUsd(asset.ath)} · ${formatDate(asset.ath_date)}` : formatUsd(asset.ath) },
    { label: "ATH change", value: formatPercent(asset.ath_change_percentage), className: changeClass(asset.ath_change_percentage) },
    { label: "ATL", value: asset.atl_date ? `${formatUsd(asset.atl)} · ${formatDate(asset.atl_date)}` : formatUsd(asset.atl) },
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
            <div className="asset-meta-row">
              <StatusBadge source={analysis.data_source} />
              <WatchButton id={asset.id} symbol={asset.symbol} name={asset.name} />
              <Link className="ghost tool-button compare-link" href={`/compare?ids=${asset.id},${companion}`}>
                Compare
              </Link>
            </div>
            {formatTimestamp(asset.last_updated) ? (
              <p className="live-updated muted">Last updated: {formatTimestamp(asset.last_updated)}</p>
            ) : null}
            <nav className="asset-jump" aria-label="On this page">
              <a href="#overview">Overview</a>
              <a href="#community">Links</a>
              {profile.contracts.length ? <a href="#contracts">Contracts</a> : null}
              <a href="#chart-lab">Chart</a>
              <Link href={`/compare?ids=${asset.id},${companion}`}>Compare</Link>
              <Link href="/news">News</Link>
              <Link href="/status">Status</Link>
            </nav>
          </div>
        </div>
        <div className="asset-price-block">
          <strong>{formatUsd(asset.current_price)}</strong>
          <span className={changeClass(change)}>{formatPercent(change)} 24h</span>
          <Sparkline values={asset.sparkline_7d} />
        </div>
      </section>

      <section className="asset-metrics asset-metrics-wide">
        {stats.map((stat) => (
          <div className="card mini-metric" key={stat.label}>
            <span>{stat.label}</span>
            <strong className={stat.className}>{stat.value}</strong>
          </div>
        ))}
        <div className="card mini-metric range-metric">
          <span>24h range</span>
          <strong>{formatUsd(asset.low_24h)} – {formatUsd(asset.high_24h)}</strong>
          <RangeBar low={asset.low_24h} high={asset.high_24h} current={asset.current_price} />
        </div>
        <div className="card mini-metric range-metric">
          <span>Circulating vs max</span>
          <strong>
            {asset.max_supply
              ? `${(((asset.circulating_supply || 0) / asset.max_supply) * 100).toFixed(1)}% issued`
              : "No max supply"}
          </strong>
          <SupplyBar circulating={asset.circulating_supply} max={asset.max_supply} />
        </div>
      </section>

      <ProjectLinks profile={profile} />

      <AssetWorkspace
        coinId={asset.id}
        symbol={asset.symbol}
        tickers={tickers}
        candles={candleResponse.data}
        candleSource={candleResponse.source}
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
