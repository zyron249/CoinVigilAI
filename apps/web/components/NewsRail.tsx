import type { NewsItem } from "../lib/api";

function age(value: string | null) {
  if (!value) return "Date unknown";
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return value.slice(0, 10) || "Date unknown";
  const hours = Math.max(0, Math.round((Date.now() - then) / 36e5));
  if (hours < 1) return "just now";
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

export function NewsRail({
  items,
  message,
}: {
  items: NewsItem[];
  message?: string | null;
}) {
  return (
    <section className="card news-rail">
      <div className="section-heading">
        <div>
          <div className="eyebrow">LATEST NEWS</div>
          <h2>Attributed RSS</h2>
        </div>
        <a className="ghost tool-button" href="/news">View all</a>
      </div>
      {items.length === 0 ? (
        <div className="empty empty-panel">
          <strong>No headlines</strong>
          <p>{message || "Feeds returned nothing. CoinVigil does not invent news."}</p>
        </div>
      ) : (
        <ul className="news-rail-list">
          {items.slice(0, 4).map((item) => (
            <li key={`${item.link}-${item.title}`}>
              <a href={item.link} target="_blank" rel="noopener noreferrer">
                <strong>{item.title}</strong>
                <span className="muted">{age(item.published_at)} · {item.source}</span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
