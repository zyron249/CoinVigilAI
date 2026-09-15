import { MarketTable } from "../components/MarketTable";
import { MetricCard } from "../components/MetricCard";
import { Radar } from "../components/Radar";
import { getMarket, getRadar } from "../lib/api";

export default async function Home() {
  const [assets, radar] = await Promise.all([getMarket(), getRadar()]);
  const marketCap = assets.reduce((sum, asset) => sum + (asset.market_cap ?? 0), 0);
  const volume = assets.reduce((sum, asset) => sum + (asset.total_volume ?? 0), 0);
  const gainers = assets.filter((asset) => (asset.price_change_percentage_24h ?? 0) > 0).length;

  const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 });

  return (
    <main>
      <nav>
        <div className="brand"><span className="brand-mark">V</span> CoinVigil <b>AI</b></div>
        <div className="nav-links">
          <span>Markets</span><span>AI Radar</span><span>News</span><span>Watchlist</span>
        </div>
        <button>Launch Terminal</button>
      </nav>

      <section className="hero">
        <div className="hero-copy">
          <div className="eyebrow hero-tag">ALWAYS-ON CRYPTO INTELLIGENCE</div>
          <h1>The market never sleeps.<br /><span>Neither does CoinVigil.</span></h1>
          <p>Live prices, AI-assisted analysis, risk scoring and global market signals in one terminal.</p>
          <div className="hero-actions"><button>Explore Markets</button><button className="ghost">Open AI Radar</button></div>
        </div>
        <div className="orb-wrap"><div className="orb"><div className="orb-core">AI</div></div></div>
      </section>

      <section className="metrics-grid">
        <MetricCard label="TRACKED NOW" value={`${assets.length || 0} assets`} note="MVP market universe" />
        <MetricCard label="MARKET CAP" value={`$${compact.format(marketCap)}`} note="Across visible assets" />
        <MetricCard label="24H VOLUME" value={`$${compact.format(volume)}`} note="Live provider snapshot" />
        <MetricCard label="POSITIVE 24H" value={`${gainers}/${assets.length || 0}`} note="Current breadth" />
      </section>

      <section className="dashboard-grid">
        <MarketTable assets={assets} />
        <Radar signals={radar} />
      </section>

      <footer>
        <div>CoinVigil AI · Intelligence, not financial advice.</div>
        <div>v0.1.0 MVP</div>
      </footer>
    </main>
  );
}
