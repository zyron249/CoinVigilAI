from datetime import datetime, timezone
import feedparser
from dateutil import parser as date_parser
from app.config import get_settings


def _published(entry) -> str:
    raw = entry.get("published") or entry.get("updated")
    if not raw:
        return datetime.now(timezone.utc).isoformat()
    try:
        return date_parser.parse(raw).astimezone(timezone.utc).isoformat()
    except Exception:
        return datetime.now(timezone.utc).isoformat()


def get_news(limit: int = 30) -> list[dict]:
    settings = get_settings()
    items: list[dict] = []
    for url in settings.rss_urls:
        feed = feedparser.parse(url)
        source = feed.feed.get("title", url)
        for entry in feed.entries[:limit]:
            items.append({
                "title": entry.get("title", "Untitled"),
                "link": entry.get("link", ""),
                "source": source,
                "published_at": _published(entry),
                "summary": entry.get("summary", "")[:500],
            })
    items.sort(key=lambda item: item["published_at"], reverse=True)
    return items[:limit]
