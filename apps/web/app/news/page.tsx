import { getNews } from "../../lib/api";

function formatNewsDate(value: string | null | undefined) {
  if (!value) return "Date unknown";
  const sliced = value.slice(0, 10);
  return sliced || "Date unknown";
}

export default async function NewsPage() {
  const news = await getNews();
  const hosts = news.hosts.length ? news.hosts.join(", ") : "the configured feeds";

  return (
    <main id="content">
      <section className="page-hero">
        <div className="eyebrow hero-tag">INTELLIGENCE FEED</div>
        <h1>Source-linked headlines.<br /><span>No invented news.</span></h1>
        <p>
          {news.usingDefaults
            ? `Default public RSS from ${hosts}. CoinVigil does not write these stories and does not invent dates.`
            : news.configured
              ? `Stories are pulled from ${hosts}. Override NEWS_RSS_URLS to change feeds.`
              : "No RSS feeds are configured, so this page stays empty instead of filling with generated headlines."}
          {" "}Informational only — not financial advice.
        </p>
      </section>

      <section className="card news-panel">
        {news.items.length === 0 ? (
          <div className="empty empty-panel news-empty">
            <strong>
              {news.configured ? "Feeds returned no stories" : "No RSS feeds configured"}
            </strong>
            <p>{news.message || "No stories available yet."}</p>
            {news.configured ? (
              <p>
                {news.usingDefaults
                  ? "The default CoinDesk and Cointelegraph feeds did not respond. Gaps stay empty — they are never filled with generated news."
                  : `Check ${hosts} and try again. Gaps stay empty on purpose.`}
              </p>
            ) : (
              <p>
                Set <code>NEWS_RSS_URLS</code> to public RSS URLs, or restore the documented CoinDesk + Cointelegraph defaults in <code>.env.example</code>.
              </p>
            )}
          </div>
        ) : (
          <div className="news-list">
            {news.items.map((item) => (
              <a className="news-item" key={`${item.link}-${item.title}`} href={item.link} target="_blank" rel="noopener noreferrer">
                <div>
                  <strong>{item.title}</strong>
                  <span>{item.source}</span>
                </div>
                <time dateTime={item.published_at || undefined}>{formatNewsDate(item.published_at)}</time>
              </a>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
