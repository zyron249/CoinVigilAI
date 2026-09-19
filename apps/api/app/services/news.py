from datetime import datetime, timezone
import logging

import feedparser
import httpx
from dateutil import parser as date_parser

from app.config import get_settings

logger = logging.getLogger(__name__)


def _published(entry) -> str:
    raw = entry.get("published") or entry.get("updated")
    if not raw:
        return datetime.now(timezone.utc).isoformat()
    try:
        return date_parser.parse(raw).astimezone(timezone.utc).isoformat()
    except Exception:
        return datetime.now(timezone.utc).isoformat()


def parse_feed_bytes(payload: bytes, source_fallback: str, limit: int) -> list[dict]:
    feed = feedparser.parse(payload)
    source = feed.feed.get("title", source_fallback)
    items: list[dict] = []
    for entry in feed.entries[:limit]:
        items.append({
            "title": entry.get("title", "Untitled"),
            "link": entry.get("link", ""),
            "source": source,
            "published_at": _published(entry),
            "summary": entry.get("summary", "")[:500],
        })
    return items


async def get_news(limit: int = 30) -> list[dict]:
    settings = get_settings()
    items: list[dict] = []
    timeout = httpx.Timeout(8.0, connect=4.0)
    headers = {"User-Agent": "CoinVigilAI/0.3", "Accept": "application/rss+xml, application/xml, text/xml, */*"}

    async with httpx.AsyncClient(timeout=timeout, follow_redirects=True, headers=headers) as client:
        for url in settings.rss_urls:
            try:
                response = await client.get(url)
                response.raise_for_status()
                items.extend(parse_feed_bytes(response.content, url, limit))
            except Exception as exc:
                logger.warning("RSS fetch failed for %s (%s)", url, type(exc).__name__)

    items.sort(key=lambda item: item["published_at"], reverse=True)
    return items[:limit]
