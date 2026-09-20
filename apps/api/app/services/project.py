"""Public project links from CoinGecko /coins/{id}. Never invents URLs or scrapes socials."""

from __future__ import annotations

import logging
import re
from typing import Any
from urllib.parse import urlparse

import httpx

from app.config import get_settings
from app.models import AssetContract, AssetProfile, ProjectLink
from app.services.cache import cache_get, cache_set
from app.services.market import (
    VALID_SOURCES,
    _coingecko_get,
    _fallback_reason,
    _headers,
    _memory_get,
    _memory_set,
    _now_iso,
    load_last_good,
    save_last_good,
)

logger = logging.getLogger(__name__)

HANDLE_RE = re.compile(r"^[A-Za-z0-9_]{1,50}$")
TELEGRAM_RE = re.compile(r"^[A-Za-z0-9_]{3,64}$")
FACEBOOK_RE = re.compile(r"^[A-Za-z0-9._]{1,80}$")
HTML_TAG_RE = re.compile(r"<[^>]+>")
WHITESPACE_RE = re.compile(r"\s+")
GENESIS_RE = re.compile(r"^(\d{4})-(\d{2})-(\d{2})$")
CATEGORY_NOISE_RE = re.compile(r"\b(index|holdings|portfolio)\b", re.I)
MAX_DESCRIPTION = 520
MAX_CATEGORIES = 8
MAX_EXPLORERS = 3
MAX_REPOS = 3
MAX_URLS_PER_LIST = 4
MAX_CONTRACTS = 10
PLATFORM_RE = re.compile(r"^[a-z0-9][a-z0-9_-]{0,39}$")
ADDRESS_RE = re.compile(r"^[0-9A-Za-z:._-]{8,128}$")
KIND_RANK = {
    "website": 0,
    "whitepaper": 1,
    "explorer": 2,
    "x": 10,
    "telegram": 11,
    "discord": 12,
    "reddit": 13,
    "facebook": 14,
    "forum": 15,
    "chat": 16,
    "announcement": 17,
    "github": 20,
}


def sanitize_http_url(raw: str | None) -> str | None:
    text = (raw or "").strip()
    if not text or len(text) > 400:
        return None
    if " " in text or "\n" in text:
        text = text.split()[0]
    if not text.startswith(("http://", "https://")):
        return None
    parsed = urlparse(text)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        return None
    host = (parsed.hostname or "").lower()
    if not host or host in {"localhost", "127.0.0.1", "0.0.0.0", "::1"} or host.endswith(".local"):
        return None
    return text


def _host_allowed(host: str, suffixes: tuple[str, ...]) -> bool:
    needle = (host or "").lower()
    return any(needle == suffix or needle.endswith("." + suffix) for suffix in suffixes)


def _handle(
    raw: str | None,
    pattern: re.Pattern[str] = HANDLE_RE,
    hosts: tuple[str, ...] = (),
) -> str | None:
    text = (raw or "").strip().lstrip("@")
    if text.startswith("http://") or text.startswith("https://"):
        parsed = urlparse(text)
        if not _host_allowed(parsed.hostname or "", hosts):
            return None
        path = (parsed.path or "").strip("/")
        text = path.split("/")[0] if path else ""
    if not text or not pattern.match(text):
        return None
    return text


def _strings(value: Any, limit: int = MAX_URLS_PER_LIST) -> list[str]:
    if isinstance(value, str):
        rows = [value]
    elif isinstance(value, list):
        rows = [item for item in value if isinstance(item, str)]
    else:
        return []
    cleaned: list[str] = []
    for item in rows:
        url = sanitize_http_url(item)
        if url:
            cleaned.append(url)
        if len(cleaned) >= limit:
            break
    return cleaned


def _clean_description(raw: str | None) -> str | None:
    text = HTML_TAG_RE.sub(" ", raw or "")
    text = WHITESPACE_RE.sub(" ", text).strip()
    if not text:
        return None
    if len(text) > MAX_DESCRIPTION:
        text = text[: MAX_DESCRIPTION - 1].rsplit(" ", 1)[0] + "…"
    return text


def _host_kind(url: str) -> str | None:
    host = (urlparse(url).hostname or "").lower()
    if host.endswith("x.com") or host.endswith("twitter.com"):
        return "x"
    if host.endswith("t.me") or host.endswith("telegram.me") or host.endswith("telegram.org"):
        return "telegram"
    if host.endswith("discord.com") or host.endswith("discord.gg"):
        return "discord"
    if host.endswith("reddit.com"):
        return "reddit"
    if host.endswith("facebook.com") or host.endswith("fb.com"):
        return "facebook"
    if host.endswith("github.com"):
        return "github"
    return None


def genesis_date_from_payload(raw: Any) -> str | None:
    text = str(raw or "").strip()
    match = GENESIS_RE.match(text)
    if not match:
        return None
    year, month, day = int(match.group(1)), int(match.group(2)), int(match.group(3))
    if not (2007 <= year <= 2100 and 1 <= month <= 12 and 1 <= day <= 31):
        return None
    return text


def ordered_project_links(links: list[ProjectLink]) -> list[ProjectLink]:
    return sorted(links, key=lambda item: (KIND_RANK.get(item.kind, 50), item.label.lower(), item.url.lower()))


def project_links_from_payload(links: Any) -> list[ProjectLink]:
    """Map CoinGecko `links` object to public http(s) URLs. Missing fields are omitted."""
    if not isinstance(links, dict):
        return []
    collected: list[ProjectLink] = []
    seen: set[str] = set()

    def add(kind: str, label: str, url: str | None) -> None:
        clean = sanitize_http_url(url)
        if not clean:
            return
        key = clean.rstrip("/").lower()
        if key in seen:
            return
        seen.add(key)
        collected.append(ProjectLink(kind=kind, label=label, url=clean))

    for index, url in enumerate(_strings(links.get("homepage"))):
        add("website", "Website" if index == 0 else f"Website {index + 1}", url)

    add("whitepaper", "Whitepaper", links.get("whitepaper") if isinstance(links.get("whitepaper"), str) else None)

    for index, url in enumerate(_strings(links.get("blockchain_site"), MAX_EXPLORERS)):
        add("explorer", "Explorer" if index == 0 else f"Explorer {index + 1}", url)

    twitter = _handle(
        links.get("twitter_screen_name") if isinstance(links.get("twitter_screen_name"), str) else None,
        hosts=("x.com", "twitter.com"),
    )
    if twitter:
        add("x", "X", f"https://x.com/{twitter}")

    telegram = _handle(
        links.get("telegram_channel_identifier") if isinstance(links.get("telegram_channel_identifier"), str) else None,
        TELEGRAM_RE,
        hosts=("t.me", "telegram.me", "telegram.org"),
    )
    if telegram:
        add("telegram", "Telegram", f"https://t.me/{telegram}")

    facebook = _handle(
        links.get("facebook_username") if isinstance(links.get("facebook_username"), str) else None,
        FACEBOOK_RE,
        hosts=("facebook.com", "fb.com"),
    )
    if facebook:
        add("facebook", "Facebook", f"https://www.facebook.com/{facebook}")

    add("reddit", "Reddit", links.get("subreddit_url") if isinstance(links.get("subreddit_url"), str) else None)

    extra_labels = {"telegram": 1 if telegram else 0, "discord": 0, "chat": 0}

    def add_chat(url: str) -> None:
        kind = _host_kind(url) or "chat"
        if kind not in {"telegram", "discord", "chat"}:
            kind = "chat"
        extra_labels[kind] += 1
        if kind == "discord":
            label = "Discord" if extra_labels[kind] == 1 else f"Discord {extra_labels[kind]}"
        elif kind == "telegram":
            label = "Telegram" if extra_labels[kind] == 1 else f"Telegram {extra_labels[kind]}"
        else:
            label = "Chat" if extra_labels[kind] == 1 else f"Chat {extra_labels[kind]}"
        add(kind, label, url)

    for url in _strings(links.get("chat_url"), 6):
        add_chat(url)

    forum_count = 0
    for url in _strings(links.get("official_forum_url")):
        kind = _host_kind(url)
        if kind in {"telegram", "discord"}:
            add_chat(url)
            continue
        forum_count += 1
        add("forum", "Forum" if forum_count == 1 else f"Forum {forum_count}", url)

    announcement_count = 0
    for url in _strings(links.get("announcement_url")):
        kind = _host_kind(url)
        if kind in {"telegram", "discord"}:
            add_chat(url)
            continue
        announcement_count += 1
        add("announcement", "Announcement" if announcement_count == 1 else f"Announcement {announcement_count}", url)

    repos = links.get("repos_url") if isinstance(links.get("repos_url"), dict) else {}
    github_rows = repos.get("github") if isinstance(repos.get("github"), list) else []
    github_count = 0
    for item in github_rows:
        if github_count >= MAX_REPOS:
            break
        url = sanitize_http_url(item if isinstance(item, str) else None)
        if not url or _host_kind(url) != "github":
            continue
        add("github", "GitHub" if github_count == 0 else f"GitHub {github_count + 1}", url)
        github_count += 1

    return ordered_project_links(collected)


def categories_from_payload(raw: Any) -> list[str]:
    if not isinstance(raw, list):
        return []
    seen: set[str] = set()
    rows: list[str] = []
    for item in raw:
        label = str(item or "").strip()
        if not label or len(label) > 48:
            continue
        key = label.lower()
        if key in seen:
            continue
        seen.add(key)
        rows.append(label)
    preferred = [item for item in rows if not CATEGORY_NOISE_RE.search(item)]
    noise = [item for item in rows if CATEGORY_NOISE_RE.search(item)]
    return (preferred + noise)[:MAX_CATEGORIES]


def sanitize_contract_address(raw: str | None) -> str | None:
    text = (raw or "").strip()
    if not text or len(text) < 8 or len(text) > 128:
        return None
    lowered = text.lower()
    if lowered.startswith(("http://", "https://", "javascript:", "data:", "vbscript:")):
        return None
    if " " in text or "\n" in text or "\t" in text:
        return None
    if lowered in {"null", "none", "undefined", "0x", "n/a"}:
        return None
    if not ADDRESS_RE.match(text):
        return None
    return text


CHAIN_ALIASES = {
    "binance-smart-chain": "BNB Smart Chain",
    "polygon-pos": "Polygon",
    "optimistic-ethereum": "Optimism",
    "arbitrum-one": "Arbitrum",
    "arbitrum-nova": "Arbitrum Nova",
    "avalanche": "Avalanche",
    "base": "Base",
    "solana": "Solana",
    "the-open-network": "TON",
}


def chain_label(platform_id: str) -> str | None:
    slug = platform_id.strip().lower().replace(" ", "-")
    if not slug or not PLATFORM_RE.match(slug):
        return None
    if slug in CHAIN_ALIASES:
        return CHAIN_ALIASES[slug]
    return slug.replace("-", " ").replace("_", " ").title()


def explorer_url_for_address(address: str | None, explorer_urls: Any) -> str | None:
    """Return a CoinGecko explorer URL only when it already contains this address. Never synthesize hosts or /token/ paths."""
    needle = sanitize_contract_address(address)
    if not needle:
        return None
    lowered = needle.lower()
    if isinstance(explorer_urls, str):
        candidates = [explorer_urls]
    elif isinstance(explorer_urls, (list, tuple)):
        candidates = list(explorer_urls)
    else:
        return None
    for item in candidates:
        url = sanitize_http_url(item if isinstance(item, str) else None)
        if not url:
            continue
        if lowered in url.lower():
            return url
    return None


def explorer_urls_from_payload(links: Any) -> list[str]:
    if not isinstance(links, dict):
        return []
    return _strings(links.get("blockchain_site"), 8)


def contracts_from_payload(
    platforms: Any,
    detail_platforms: Any = None,
    explorer_urls: Any = None,
) -> list[AssetContract]:
    """Map CoinGecko platforms / detail_platforms. Empty native keys are omitted — never invented."""
    rows: list[AssetContract] = []
    seen: set[str] = set()

    def add(platform_id: str, address: str | None) -> None:
        if len(rows) >= MAX_CONTRACTS:
            return
        label = chain_label(platform_id)
        clean = sanitize_contract_address(address)
        if not label or not clean:
            return
        key = f"{label.lower()}|{clean.lower()}"
        if key in seen:
            return
        seen.add(key)
        rows.append(
            AssetContract(
                platform=platform_id.strip().lower(),
                label=label,
                address=clean,
                explorer_url=explorer_url_for_address(clean, explorer_urls),
            )
        )

    if isinstance(detail_platforms, dict):
        for platform_id, payload in detail_platforms.items():
            if not isinstance(platform_id, str):
                continue
            address = None
            if isinstance(payload, dict):
                raw = payload.get("contract_address")
                address = raw if isinstance(raw, str) else None
            elif isinstance(payload, str):
                address = payload
            add(platform_id, address)

    if isinstance(platforms, dict):
        for platform_id, payload in platforms.items():
            if not isinstance(platform_id, str):
                continue
            address = payload if isinstance(payload, str) else None
            add(platform_id, address)

    return rows


def _empty_profile(coin_id: str, source: str, reason: str | None) -> AssetProfile:
    if source == "demo":
        note = "Project links are hidden in the labeled demo snapshot — URLs are never invented or scraped."
    elif reason == "rate_limited":
        note = "CoinGecko rate-limited project lookup. CoinVigil does not scrape social networks or invent URLs."
    else:
        note = "CoinGecko listed no public project links for this asset. CoinVigil does not invent URLs or scrape social networks."
    return AssetProfile(
        coin_id=coin_id,
        links=[],
        categories=[],
        description=None,
        genesis_date=None,
        contracts=[],
        source=source,
        note=note,
        stale=source == "cache",
        fallback_reason=reason,
        last_live_at=None,
        as_of=_now_iso(),
    )


def _links_from_envelope(raw: Any) -> list[ProjectLink]:
    rows: list[ProjectLink] = []
    seen: set[str] = set()
    if not isinstance(raw, list):
        return rows
    for item in raw:
        if not isinstance(item, dict):
            continue
        url = sanitize_http_url(item.get("url") if isinstance(item.get("url"), str) else None)
        if not url:
            continue
        key = url.rstrip("/").lower()
        if key in seen:
            continue
        seen.add(key)
        kind = str(item.get("kind") or "link").strip()[:24] or "link"
        label = str(item.get("label") or "Link").strip()[:40] or "Link"
        rows.append(ProjectLink(kind=kind, label=label, url=url))
    return ordered_project_links(rows)


def _contracts_from_envelope(raw: Any) -> list[AssetContract]:
    rows: list[AssetContract] = []
    seen: set[str] = set()
    if not isinstance(raw, list):
        return rows
    for item in raw:
        if not isinstance(item, dict):
            continue
        platform = str(item.get("platform") or "").strip().lower()
        label = chain_label(platform) or chain_label(str(item.get("label") or ""))
        address = sanitize_contract_address(item.get("address") if isinstance(item.get("address"), str) else None)
        if not platform or not label or not address:
            continue
        key = f"{label.lower()}|{address.lower()}"
        if key in seen:
            continue
        seen.add(key)
        raw_explorer = item.get("explorer_url") if isinstance(item.get("explorer_url"), str) else None
        rows.append(
            AssetContract(
                platform=platform[:40],
                label=label,
                address=address,
                explorer_url=explorer_url_for_address(address, [raw_explorer] if raw_explorer else []),
            )
        )
        if len(rows) >= MAX_CONTRACTS:
            break
    return rows


def _profile_from_envelope(coin_id: str, envelope: dict[str, Any], *, stale: bool, reason: str | None) -> AssetProfile:
    links = _links_from_envelope(envelope.get("links"))
    source = str(envelope.get("source") or "cache")
    if source not in VALID_SOURCES:
        source = "cache"
    note = str(envelope.get("note") or "")
    if not note:
        note = (
            "Public links from CoinGecko /coins/{id}. Missing fields are omitted — CoinVigil does not invent URLs."
            if links
            else "CoinGecko listed no public project links for this asset. CoinVigil does not invent URLs or scrape social networks."
        )
    return AssetProfile(
        coin_id=coin_id,
        links=links,
        categories=[str(item) for item in envelope.get("categories") or [] if str(item).strip()][:MAX_CATEGORIES],
        description=envelope.get("description") if isinstance(envelope.get("description"), str) else None,
        genesis_date=genesis_date_from_payload(envelope.get("genesis_date")),
        contracts=_contracts_from_envelope(envelope.get("contracts")),
        source=source,
        note=note,
        last_live_at=envelope.get("last_live_at"),
        as_of=envelope.get("last_live_at") if stale else _now_iso(),
        stale=stale,
        fallback_reason=reason,
    )


async def get_asset_profile(coin_id: str) -> AssetProfile:
    needle = coin_id.strip().lower()
    if not needle:
        return _empty_profile("unknown", "unavailable", "unreachable")

    settings = get_settings()
    cache_key = f"profile:v4:{needle}"
    mem = _memory_get(cache_key)
    if isinstance(mem, dict):
        return _profile_from_envelope(needle, mem, stale=bool(mem.get("stale")), reason=mem.get("fallback_reason"))

    cached = await cache_get(cache_key)
    if isinstance(cached, dict) and (cached.get("links") is not None or cached.get("source")):
        _memory_set(cache_key, cached)
        return _profile_from_envelope(needle, cached, stale=False, reason=cached.get("fallback_reason"))

    try:
        async with httpx.AsyncClient(timeout=12.0, headers=_headers()) as client:
            response = await _coingecko_get(
                client,
                f"{settings.coingecko_base_url}/coins/{needle}",
                {
                    "localization": "false",
                    "tickers": "false",
                    "market_data": "false",
                    "community_data": "false",
                    "developer_data": "false",
                    "sparkline": "false",
                },
            )
            payload = response.json()
        if not isinstance(payload, dict) or not payload.get("id"):
            return _empty_profile(needle, "unavailable", None)
        links = project_links_from_payload(payload.get("links"))
        explorer_urls = explorer_urls_from_payload(payload.get("links"))
        explorer_urls.extend(link.url for link in links if link.kind == "explorer" and link.url not in explorer_urls)
        description_map = payload.get("description") if isinstance(payload.get("description"), dict) else {}
        description = _clean_description(description_map.get("en") if isinstance(description_map.get("en"), str) else None)
        fetched_at = _now_iso()
        envelope = {
            "links": [link.model_dump() for link in links],
            "categories": categories_from_payload(payload.get("categories")),
            "description": description,
            "genesis_date": genesis_date_from_payload(payload.get("genesis_date")),
            "contracts": [
                item.model_dump()
                for item in contracts_from_payload(
                    payload.get("platforms"),
                    payload.get("detail_platforms"),
                    explorer_urls,
                )
            ],
            "source": "coingecko",
            "note": (
                "Public links from CoinGecko /coins/{id}. Missing fields are omitted — CoinVigil does not invent URLs."
                if links
                else "CoinGecko listed no public project links for this asset. CoinVigil does not invent URLs or scrape social networks."
            ),
            "last_live_at": fetched_at,
        }
        await cache_set(cache_key, envelope, settings.market_cache_ttl_seconds)
        await save_last_good(f"profile:{needle}", envelope)
        _memory_set(cache_key, envelope)
        return _profile_from_envelope(needle, envelope, stale=False, reason=None)
    except Exception as exc:
        reason = _fallback_reason(exc)
        logger.warning("CoinGecko project profile unavailable for %s (%s)", needle, type(exc).__name__)
        last_good = await load_last_good(f"profile:{needle}")
        if last_good:
            last_good = {**last_good, "source": "cache"}
            _memory_set(cache_key, {**last_good, "stale": True, "fallback_reason": reason})
            return _profile_from_envelope(needle, last_good, stale=True, reason=reason)
        return _empty_profile(needle, "demo" if reason else "unavailable", reason)
