import Link from "next/link";
import { CouncilRoster } from "../components/CouncilRoster";
import { LiveBoard } from "../components/LiveBoard";
import { MarketBriefCard } from "../components/MarketBriefCard";
import { Radar } from "../components/Radar";
import { getCouncilStatus, getGlobalOverview, getMarket, getMarketBrief, getMovers, getRadar } from "../lib/api";
import { parseMarketQuery } from "../lib/pagination";

function firstParam(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0];
  return value;
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const marketQuery = parseMarketQuery({
    q: firstParam(query.q) || "",
    page: firstParam(query.page),
    limit: firstParam(query.limit),
    sort: firstParam(query.sort),
    order: firstParam(query.order),
  });
  const [market, overview, movers, radar, council] = await Promise.all([
    getMarket(marketQuery),
    getGlobalOverview(),
    getMovers(5),
    getRadar(),
    getCouncilStatus(),
  ]);
  const brief = council.configured === 0 ? await getMarketBrief() : null;
  const leadAsset = market.assets[0];

  return (
    <main id="content" className="home-dashboard">
      <LiveBoard
        initialMarket={market}
        initialOverview={overview}
        initialMovers={movers}
        hero={(
          <section className="hero hero-dashboard">
            <div className="hero-copy">
              <div className="eyebrow hero-tag">AI-POWERED CRYPTO INTELLIGENCE</div>
              <h1>Smarter crypto decisions <span>with AI</span>.</h1>
              <p>
                Live market data, multi-model AI analysis, risk scoring and global crypto intelligence —
                brought together in one decision workspace.
              </p>
              <div className="hero-actions">
                <a className="button-link" href="#markets">Explore Markets</a>
                <Link className="button-link ghost" href="/ask">See AI Analysis</Link>
              </div>
              <div className="hero-proof">
                <span>Real-time market data</span>
                <span>Multi-model AI council</span>
                <span>Risk-aware analysis</span>
              </div>
            </div>
            <div className="orb-wrap" aria-hidden="true">
              <div className="orb">
                <div className="orb-ring orb-ring-one" />
                <div className="orb-ring orb-ring-two" />
                <div className="orb-core">AI</div>
                <span className="orb-label orb-label-one">Market data</span>
                <span className="orb-label orb-label-two">AI insights</span>
                <span className="orb-label orb-label-three">Risk signals</span>
              </div>
            </div>
          </section>
        )}
        brief={<MarketBriefCard initial={brief} refresh={council.configured > 0} />}
        radar={<Radar signals={radar} />}
      />

      <CouncilRoster
        providers={council.providers}
        configured={council.configured}
        supported={council.supported}
      />

      <section className="feature-strip">
        <Link className="card feature-card" href={leadAsset ? `/asset/${leadAsset.id}#markets-tab` : "#markets"}>
          <div className="eyebrow">EXCHANGE MARKETS</div>
          <h3>See where it trades</h3>
          <p>Open an asset to inspect trading venues, pairs, volume and trust signals without leaving CoinVigilAI.</p>
        </Link>
        <Link className="card feature-card" href="/compare?ids=bitcoin,ethereum">
          <div className="eyebrow">COMPARE</div>
          <h3>Compare assets fast</h3>
          <p>Review price, momentum, market cap, volume and recent performance side by side.</p>
        </Link>
        <Link className="card feature-card" href={leadAsset ? `/asset/${leadAsset.id}#chart-lab` : "#markets"}>
          <div className="eyebrow">PRO CHART LAB</div>
          <h3>Draw and analyze</h3>
          <p>Use candlesticks, trend tools, levels, Fibonacci overlays, indicators and exports.</p>
        </Link>
        <Link className="card feature-card" href="/token-studio">
          <div className="eyebrow">TOKEN STUDIO</div>
          <h3>Create on-chain</h3>
          <p>Configure a token and deploy it from your own wallet on supported EVM networks.</p>
        </Link>
      </section>
    </main>
  );
}
