import Link from "next/link";
import { CouncilRoster } from "../components/CouncilRoster";
import { GlobalStrip } from "../components/GlobalStrip";
import { MarketBriefCard } from "../components/MarketBriefCard";
import { MarketTable } from "../components/MarketTable";
import { Movers } from "../components/Movers";
import { Radar } from "../components/Radar";
import { getCouncilStatus, getGlobalOverview, getMarket, getMovers, getRadar } from "../lib/api";
import { sourceLabel } from "../lib/format";

export default async function Home() {
  const [market, overview, movers, radar, council] = await Promise.all([
    getMarket({ limit: 50, page: 1, sort: "market_cap", order: "desc" }),
    getGlobalOverview(),
    getMovers(5),
    getRadar(),
    getCouncilStatus(),
  ]);

  return (
    <main>
      <nav>
        <Link className="brand" href="/"><span className="brand-mark">V</span> CoinVigil <b>AI</b></Link>
        <div className="nav-links">
          <a href="#markets">Markets</a>
          <a href="#ai-brief">AI Brief</a>
          <a href="#movers">Movers</a>
          <a href="#radar">AI Radar</a>
          <a href="#ai-council">AI Council</a>
          <Link href="/news">News</Link>
          <Link href="/token-studio">Token Studio</Link>
        </div>
        <Link className="nav-cta" href="/token-studio">Create Token</Link>
      </nav>

      <section className="markets-hero">
        <div>
          <div className="eyebrow hero-tag">CRYPTOCURRENCY RANKINGS</div>
          <h1>Markets, with an <span>AI brief</span>.</h1>
          <p>
            Ranked prices, global stats and 24h movers from CoinGecko. Optional council/Grok brief when keys are set.
            CoinVigil is an AI-supported research terminal — not CoinMarketCap, and not financial advice.
          </p>
        </div>
        <aside className="disclaimer-banner">
          <strong>Data tool, not investment advice.</strong>
          <span>Live, cache, or demo sources are labeled. Demo prices are synthetic stand-ins used only when CoinGecko is unreachable. No TVL or RPC claims.</span>
        </aside>
      </section>

      <GlobalStrip overview={overview} />
      <MarketBriefCard />

      <section className="slice-grid" id="movers">
        <Movers gainers={movers.gainers} losers={movers.losers} source={movers.source} />
        <div id="radar">
          <Radar signals={radar} />
        </div>
      </section>
      <p className="movers-footnote muted">
        24h movers are ranked from the CoinVigil universe ({sourceLabel(movers.source).text}). Prices are never invented.
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
        <Link className="card feature-card" href={market.assets[0] ? `/asset/${market.assets[0].id}` : "/"}>
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

      <footer>
        <div>CoinVigil AI · Intelligence and research tools, not financial advice. Market data via CoinGecko.</div>
        <div>v0.4.0</div>
      </footer>
    </main>
  );
}
