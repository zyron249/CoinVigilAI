import Link from "next/link";
import { getNews } from "../../lib/api";

export default async function NewsPage() {
  const news = await getNews();

  return (
    <main>
      <nav>
        <Link className="brand" href="/"><span className="brand-mark">V</span> CoinVigil <b>AI</b></Link>
        <div className="nav-links">
          <Link href="/">Markets</Link>
          <span>News</span>
          <Link href="/token-studio">Token Studio</Link>
        </div>
        <Link className="nav-cta" href="/token-studio">Create Token</Link>
      </nav>

      <section className="studio-hero">
        <div className="eyebrow hero-tag">INTELLIGENCE FEED</div>
        <h1>Source-linked headlines.<br /><span>No invented news.</span></h1>
        <p>
          CoinVigil only lists stories from RSS feeds you configure. It does not generate headlines
          or fill gaps with model speculation.
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
                <time>{item.published_at.slice(0, 10)}</time>
              </a>
            ))}
          </div>
        )}
      </section>

      <footer>
        <div>CoinVigil AI · Headlines are sourced, not generated.</div>
        <div>v0.4.0</div>
      </footer>
    </main>
  );
}
