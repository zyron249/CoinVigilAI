import { getStackStatus } from "../../lib/api";
import { PremiumToggle } from "../../components/PremiumToggle";
import { StatusBadge } from "../../components/StatusBadge";
import { StatusRefresh } from "../../components/StatusRefresh";

export default async function StatusPage() {
  const status = await getStackStatus();
  const redis = status.market?.redis || "unavailable";
  const observed = Boolean(status.market?.observed);
  const marketSource = status.market?.source || undefined;
  const fallback = status.market?.fallback_reason;
  const aiConfigured = status.ai?.configured_count ?? 0;

  return (
    <StatusRefresh>
    <main id="content">
      <section className="page-hero">
        <div className="eyebrow hero-tag">STACK STATUS</div>
        <h1>What this instance is actually running.</h1>
        <p>
          No API keys are shown here. Redis, the CoinGecko key, and AI adapters are labeled configured or not.
          Market data is CoinGecko — never CoinMarketCap. Informational only, not financial advice.
        </p>
      </section>

      <section className="status-grid">
        <article className="card status-card">
          <span>Markets</span>
          <strong>
            {observed
              ? <StatusBadge source={marketSource} stale={Boolean(status.market?.stale)} />
              : <span className="tone-cache">No snapshot yet</span>}
          </strong>
          <em>
            {observed
              ? `Last observed CoinGecko path${fallback ? ` (${fallback})` : ""}. This page does not call CoinGecko.`
              : "Open Markets to fetch. Status never stamps the public API."}
            {" "}
            {status.market?.key_configured
              ? "A CoinGecko key is configured (value never shown)."
              : "No CoinGecko key — public rate limits apply. See the README runbook."}
          </em>
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
              ? `Configured adapters: ${status.ai?.configured.join(", ")}. Ask CoinVigil can synthesize tool facts with those models.`
              : "No keys set — Ask, briefs, and analysis use heuristic tools, never fake live model output."}
            {" "}
            Ask mode: {status.ai?.ask || "heuristic-tools"}. You are told when text is AI-generated. Not financial advice.
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
          <span>Watchlist alerts</span>
          <strong>Watchlist-scoped</strong>
          <em>
            Free cap 3 coins. Local premium toggle is not billing. In-tab only — Telegram/Discord/push
            are a README path, not a fake send. No on-chain whale feed. Alerts stay in this browser.
          </em>
          <PremiumToggle />
        </article>
        <article className="card status-card">
          <span>API</span>
          <strong className={`tone-${status.status === "ok" ? "live" : "down"}`}>{status.status === "ok" ? "Healthy" : "Unavailable"}</strong>
          <em>Version {status.version || "unknown"}. {status.disclaimer}</em>
        </article>
      </section>
    </main>
    </StatusRefresh>
  );
}
