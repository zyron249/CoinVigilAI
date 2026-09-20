import Link from "next/link";
import { CouncilRoster } from "../components/CouncilRoster";
import { MarketTable } from "../components/MarketTable";
import { MetricCard } from "../components/MetricCard";
import { Radar } from "../components/Radar";
import { getCouncilStatus, getMarket, getRadar } from "../lib/api";

export default async function Home() {
  const [{ assets, source }, radar, council] = await Promise.all([getMarket(), getRadar(), getCouncilStatus()]);
  const marketCap = assets.reduce((sum, asset) => sum + (asset.market_cap ?? 0), 0);
  const volume = assets.reduce((sum, asset) => sum + (asset.total_volume ?? 0), 0);
  const gainers = assets.filter((asset) => (asset.price_change_percentage_24h ?? 0) > 0).length;

  const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 });

  return (
    <main>
      <nav>
        <Link className="brand" href="/"><span className="brand-mark">V</span> CoinVigil <b>AI</b></Link>
        <div className="nav-links">
          <a href="#markets">Markets</a><a href="#radar">AI Radar</a><a href="#ai-council">AI Council</a><Link href="/news">News</Link><Link href="/token-studio">Token Studio</Link>
        </div>
        <Link className="nav-cta" href="/token-studio">Create Token</Link>
      </nav>

      <section className="hero">
        <div className="hero-copy">
          <div className="eyebrow hero-tag">ALWAYS-ON CRYPTO INTELLIGENCE</div>
          <h1>The market never sleeps.<br /><span>Neither does CoinVigil.</span></h1>
          <p>Live prices, multi-model AI analysis including optional xAI Grok, professional chart research, risk scoring and a non-custodial token launchpad in one terminal.</p>
          <div className="hero-actions">
            <a className="button-link" href="#markets">Explore Markets</a>
            <a className="button-link ghost" href="#ai-council">AI Council</a>
            <Link className="button-link ghost" href="/token-studio">Open Token Studio</Link>
          </div>
        </div>
        <div className="orb-wrap"><div className="orb"><div className="orb-core">AI</div></div></div>
      </section>

      <section className="metrics-grid">
        <MetricCard label="TRACKED NOW" value={`${assets.length || 0} assets`} note="Click any asset for Pro Chart Lab" />
        <MetricCard label="MARKET CAP" value={`$${compact.format(marketCap)}`} note="Across visible assets" />
        <MetricCard label="24H VOLUME" value={`$${compact.format(volume)}`} note="Live provider snapshot" />
        <MetricCard label="POSITIVE 24H" value={`${gainers}/${assets.length || 0}`} note="Current breadth" />
      </section>

      <section id="markets" className="dashboard-grid">
        <MarketTable assets={assets} source={source} />
        <div id="radar">
          <Radar signals={radar} />
        </div>
      </section>

      <CouncilRoster
        providers={council.providers}
        configured={council.configured}
        supported={council.supported}
      />

      <section className="feature-strip">
        <Link className="card feature-card" href={assets[0] ? `/asset/${assets[0].id}` : "/"}>
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
        <div>CoinVigil AI · Intelligence and research tools, not financial advice.</div>
        <div>v0.3.1</div>
      </footer>
    </main>
  );
}
