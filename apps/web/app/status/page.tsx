import { getStackStatus } from "../../lib/api";
import { StatusBadge } from "../../components/StatusBadge";

export default async function StatusPage() {
  const status = await getStackStatus();
  const redis = status.market?.redis || "unavailable";
  const marketLabel = redis === "ok" ? "Live path + Redis cache" : "Live path, Redis optional/down";
  const aiConfigured = status.ai?.configured_count ?? 0;

  return (
    <main id="content">
      <section className="page-hero">
        <div className="eyebrow hero-tag">STACK STATUS</div>
        <h1>What this instance is actually running.</h1>
        <p>
          No API keys are shown here. Redis and AI adapters are labeled configured or not.
          Market data is CoinGecko — never CoinMarketCap. Informational only, not financial advice.
        </p>
      </section>

      <section className="status-grid">
        <article className="card status-card">
          <span>Markets</span>
          <strong><StatusBadge source="coingecko" /></strong>
          <em>{marketLabel}. Source flips to cache/demo when CoinGecko rate-limits.</em>
        </article>
        <article className="card status-card">
          <span>Redis</span>
          <strong className={`tone-${redis === "ok" ? "live" : "down"}`}>{redis === "ok" ? "Connected" : "Not connected"}</strong>
          <em>Optional short cache + last-live snapshot. The API still runs without it.</em>
        </article>
        <article className="card status-card">
          <span>Postgres</span>
          <strong className="tone-down">Not provisioned</strong>
          <em>This build does not persist to a database. Watchlists stay in this browser.</em>
        </article>
        <article className="card status-card">
          <span>AI council</span>
          <strong className={`tone-${aiConfigured ? "live" : "cache"}`}>{aiConfigured} / {status.ai?.supported ?? 0} keys set</strong>
          <em>
            {aiConfigured
              ? `Configured adapters: ${status.ai?.configured.join(", ")}.`
              : "No keys set — briefs and analysis use the heuristic engine."}
          </em>
        </article>
        <article className="card status-card">
          <span>News RSS</span>
          <strong className={`tone-${(status.news?.feeds ?? 0) > 0 ? "live" : "down"}`}>
            {status.news?.feeds ?? 0} feed{(status.news?.feeds ?? 0) === 1 ? "" : "s"}
          </strong>
          <em>
            {status.news?.using_defaults
              ? `Default public feeds (${status.news.hosts.join(", ") || "CoinDesk, Cointelegraph"}). CoinVigil does not write these stories.`
              : (status.news?.hosts.length
                ? `Custom hosts: ${status.news.hosts.join(", ")}.`
                : "No feeds configured — the news page stays empty on purpose.")}
          </em>
        </article>
        <article className="card status-card">
          <span>API</span>
          <strong className={`tone-${status.status === "ok" ? "live" : "down"}`}>{status.status === "ok" ? "Healthy" : "Unavailable"}</strong>
          <em>Version {status.version || "unknown"}. {status.disclaimer}</em>
        </article>
      </section>
    </main>
  );
}
