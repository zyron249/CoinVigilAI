import Link from "next/link";
import { CouncilRoster } from "../components/CouncilRoster";
import { LiveBoard } from "../components/LiveBoard";
import { LiveChartPanel } from "../components/LiveChartPanel";
import { MarketBriefCard } from "../components/MarketBriefCard";
import { NewsRail } from "../components/NewsRail";
import { NewsletterCard } from "../components/NewsletterCard";
import { Radar } from "../components/Radar";
import { TokenRadarStrip } from "../components/TokenRadarStrip";
import { TopCryptos } from "../components/TopCryptos";
import { getCouncilStatus, getGlobalOverview, getMarket, getMarketBrief, getMovers, getNews, getRadar } from "../lib/api";
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
  const [market, overview, movers, radar, council, news] = await Promise.all([
    getMarket(marketQuery),
    getGlobalOverview(),
    getMovers(5),
    getRadar(),
    getCouncilStatus(),
    getNews(),
  ]);
  const brief = council.configured === 0 ? await getMarketBrief() : null;
  const leadAsset = market.assets[0];

  return (
    <main id="content">
      <LiveBoard
        initialMarket={market}
        initialOverview={overview}
        initialMovers={movers}
        hero={(
          <section className="dash-hero is-compact">
            <div>
              <div className="eyebrow hero-tag">CRYPTOCURRENCY RANKINGS</div>
              <h1>Smarter Crypto Decisions <span>with AI</span>.</h1>
              <p>
                Live CoinGecko snapshot, multi-model analysis when keys are set, and watchlist alerts.
                Ranked CoinGecko-tracked assets (paginated `/coins/markets`, {market.universe_size} of {market.coverage_target || 1000} in this snapshot).
                Not CoinMarketCap. Informational research only — not financial advice.
              </p>
            </div>
          </section>
        )}
        brief={<MarketBriefCard initial={brief} refresh={council.configured > 0} />}
        radar={<Radar signals={radar} />}
        topCryptos={<TopCryptos assets={market.assets} />}
        radarStrip={<TokenRadarStrip signals={radar} gainers={movers.gainers} />}
        rail={(
          <>
            <LiveChartPanel assets={market.assets} />
            <NewsRail items={news.items} message={news.message} />
            <NewsletterCard />
          </>
        )}
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
          <p>Open an asset to list CoinGecko venues, pairs, volume, and trust scores. Filter, sort, and share the URL. CoinVigil does not scrape every exchange website.</p>
        </Link>
        <Link className="card feature-card" href="/compare?ids=bitcoin,ethereum">
          <div className="eyebrow">COMPARE</div>
          <h3>Two or three assets</h3>
          <p>Side-by-side price, change, cap, volume, and 7d spark from this CoinGecko snapshot. Missing coins stay empty — never invented.</p>
        </Link>
        <Link className="card feature-card" href={leadAsset ? `/asset/${leadAsset.id}#chart-lab` : "#markets"}>
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
