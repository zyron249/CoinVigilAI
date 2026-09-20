import { getNews } from "../../lib/api";

function formatNewsDate(value: string | null | undefined) {
  if (!value) return "Date unknown";
  const sliced = value.slice(0, 10);
  return sliced || "Date unknown";
}

export default async function NewsPage() {
  const news = await getNews();

  return (
    <main id="content">
      <section className="studio-hero">
        <div className="eyebrow hero-tag">INTELLIGENCE FEED</div>
        <h1>Source-linked headlines.<br /><span>No invented news.</span></h1>
        <p>
          CoinVigil only lists stories from RSS feeds you configure. It does not generate headlines
          or fill gaps with model speculation. Informational only — not financial advice.
        </p>
      </section>

      <section className="card news-panel">
        {news.items.length === 0 ? (
          <div className="empty">
            {news.message || "No stories available yet."}
            {!news.configured ? " Copy a public RSS URL into NEWS_RSS_URLS in your .env file, then restart the API." : ""}
          </div>
        ) : (
          <div className="news-list">
            {news.items.map((item) => (
              <a className="news-item" key={`${item.link}-${item.title}`} href={item.link} target="_blank" rel="noreferrer">
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
