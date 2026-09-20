import Link from "next/link";
import { CouncilRoster } from "../components/CouncilRoster";
import { DemoRibbon } from "../components/DemoRibbon";
import { GlobalStrip } from "../components/GlobalStrip";
import { MarketBriefCard } from "../components/MarketBriefCard";
import { MarketTable } from "../components/MarketTable";
import { Movers } from "../components/Movers";
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
  const marketSource = sourceLabel(market.source);

  return (
    <main id="content">
      <DemoRibbon source={market.source} />

      <section className="markets-hero">
        <div>
          <div className="eyebrow hero-tag">CRYPTOCURRENCY RANKINGS</div>
          <h1>Markets, with an <span>AI brief</span>.</h1>
          <p>
            Ranked prices, 24h movers, and global stats from CoinGecko. The brief on this page is labeled
            heuristic or AI-generated — never mixed in with the table. CoinVigil is a research terminal,
            not CoinMarketCap, and not financial advice.
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

      <GlobalStrip overview={overview} />
      <MarketBriefCard initial={brief} refresh={council.configured > 0} />

      <section className="slice-grid" id="movers">
        <Movers gainers={movers.gainers} losers={movers.losers} source={movers.source} />
        <div id="radar">
          <Radar signals={radar} />
        </div>
      </section>
      <p className="movers-footnote muted">
        24h gainers are up; 24h losers are down. Ranked from the CoinVigil universe ({sourceLabel(movers.source).text}).
        Prices are never invented.
      </p>

      <section id="markets" className="markets-board">
        <MarketTable initial={market} />
      </section>

      <CouncilRoster
        providers={council.providers}
        configured={council.configured}
        supported={council.supported}
      />

      <section className="feature-strip">
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
