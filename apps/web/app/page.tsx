import Link from "next/link";
import { CouncilRoster } from "../components/CouncilRoster";
import { LiveBoard } from "../components/LiveBoard";
import { LiveChartPanel } from "../components/LiveChartPanel";
import { MarketBriefCard } from "../components/MarketBriefCard";
import { NewsRail } from "../components/NewsRail";
import { Radar } from "../components/Radar";
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
  const [market, overview, movers, radar, council, news, brief] = await Promise.all([
    getMarket(marketQuery),
    getGlobalOverview(),
    getMovers(5),
    getRadar(),
    getCouncilStatus(),
    getNews(),
    getMarketBrief(),
  ]);
  const leadAsset = market.assets[0] || null;
  const tapeBtc = market.assets.find((asset) => asset.id === "bitcoin") || leadAsset;
  const sample = leadAsset?.id || "bitcoin";

  return (
    <main id="content">
      <LiveBoard
        initialMarket={market}
        initialOverview={overview}
        initialMovers={movers}
        hero={(
          <section className="sr-only">
            <div className="eyebrow hero-tag">CRYPTOCURRENCY RANKINGS</div>
            <h1>Surveillance for the coins you star.</h1>
            <p>
              Watchlist → rules → smart alerts → Ask. Ranked CoinGecko-tracked assets (paginated `/coins/markets`, {market.universe_size} of {market.coverage_target || 1000} in this snapshot).
              Not CoinMarketCap. Informational research only — not financial advice.
            </p>
          </section>
        )}
        brief={(
          <MarketBriefCard
            initial={brief}
            refresh={false}
            tapeSource={market.source}
            tapeStale={market.stale}
            tapeFallback={market.fallback_reason}
            bitcoin={tapeBtc}
          />
        )}
        radar={<Radar signals={radar} />}
        rail={(
          <>
            <LiveChartPanel
              assets={market.assets}
              tapeSource={market.source}
              tapeStale={market.stale}
              tapeFallback={market.fallback_reason}
            />
            <NewsRail items={news.items} message={news.message} />
          </>
        )}
      />

      <nav className="sr-only" aria-label="Sample asset sections">
        <Link href={`/asset/${sample}#overview`}>Overview</Link>
        <Link href={`/asset/${sample}#contracts`}>Contracts</Link>
        <Link href={`/asset/${sample}#chart-lab`}>Chart</Link>
      </nav>

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
          <div className="eyebrow">CHART</div>
          <h3>Candles from this snapshot</h3>
          <p>OHLC from CoinGecko for the selected range — labeled Demo when candles cannot be fetched. Not a TradingView widget. Missing MA on short series stays hidden.</p>
        </Link>
        <Link className="card feature-card" href="/#desk">
          <div className="eyebrow">WATCHLIST ALERTS</div>
          <h3>Why not just CoinMarketCap?</h3>
          <p>CMC ranks the universe. CoinVigil watches yours: star 1–3 coins, save a price or 24h rule, read fire history, then Ask with tool-backed numbers. Telegram and Discord are not implemented.</p>
        </Link>
      </section>
    </main>
  );
}
