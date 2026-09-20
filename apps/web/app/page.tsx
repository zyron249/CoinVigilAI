import Link from "next/link";
import { CouncilRoster } from "../components/CouncilRoster";
import { LiveBoard } from "../components/LiveBoard";
import { MarketBriefCard } from "../components/MarketBriefCard";
import { Radar } from "../components/Radar";
import { getCouncilStatus, getGlobalOverview, getMarket, getMarketBrief, getMovers, getRadar } from "../lib/api";
import { sourceLabel } from "../lib/format";

export default async function Home() {
  const [market, overview, movers, radar, council] = await Promise.all([
    getMarket({ limit: 50, page: 1, sort: "market_cap", order: "desc" }),
    getGlobalOverview(),
    getMovers(5),
    getRadar(),
    getCouncilStatus(),
  ]);
  const brief = council.configured === 0 ? await getMarketBrief() : null;
  const leadAsset = market.assets[0];
  const marketSource = sourceLabel(market.source, { stale: market.stale });

  return (
    <main id="content">
      <LiveBoard
        initialMarket={market}
        initialOverview={overview}
        initialMovers={movers}
        hero={(
          <section className="markets-hero">
            <div>
              <div className="eyebrow hero-tag">CRYPTOCURRENCY RANKINGS</div>
              <h1>Markets, with an <span>AI brief</span>.</h1>
              <p>
                Ranked CoinGecko-tracked assets (paginated `/coins/markets` snapshot by market cap), 24h movers, and global stats.
                Search finds names in this snapshot — CoinVigil does not claim every coin on earth.
                The brief is labeled heuristic or AI-generated. Not CoinMarketCap, and not financial advice.
              </p>
            </div>
            <aside className="disclaimer-banner">
              <strong>Data tool, not investment advice.</strong>
              <span>
                Source is {marketSource.text}. Live and cached rows come from CoinGecko.
                Demo prices are synthetic stand-ins used only when CoinGecko is unreachable.
              </span>
            </aside>
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
        <Link className="card feature-card" href={leadAsset ? `/asset/${leadAsset.id}` : "#markets"}>
          <div className="eyebrow">EXCHANGE MARKETS</div>
          <h3>See where it trades</h3>
          <p>Open an asset to list CoinGecko venues, pairs, volume, and trust scores. CoinVigil does not scrape every exchange website.</p>
        </Link>
        <Link className="card feature-card" href={leadAsset ? `/asset/${leadAsset.id}` : "#markets"}>
          <div className="eyebrow">PRO CHART LAB</div>
          <h3>Draw, measure and analyze</h3>
          <p>Interactive candlesticks, trend lines, horizontal levels, Fibonacci, brush tools, indicators and PNG export.</p>
        </Link>
        <Link className="card feature-card" href="/token-studio">
          <div className="eyebrow">TOKEN STUDIO</div>
          <h3>Create on-chain</h3>
          <p>Configure a standard token and sign the deployment from your own wallet on supported EVM chains.</p>
        </Link>
      </section>
    </main>
  );
}
