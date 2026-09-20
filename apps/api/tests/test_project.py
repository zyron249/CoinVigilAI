import httpx
import pytest

from app.services.project import (
    categories_from_payload,
    contracts_from_payload,
    genesis_date_from_payload,
    get_asset_profile,
    project_links_from_payload,
    sanitize_http_url,
)


BITCOIN_LINKS = {
    "homepage": ["https://bitcoin.org/", "https://bitcoin.org/", "javascript:alert(1)", ""],
    "whitepaper": "https://bitcoin.org/bitcoin.pdf",
    "blockchain_site": ["https://blockchair.com/bitcoin/", "ftp://explorer.example", "https://mempool.space/"],
    "official_forum_url": ["https://bitcointalk.org/"],
    "chat_url": ["https://discord.gg/bitcoin", "https://t.me/Bitcoin"],
    "announcement_url": ["https://bitcoincore.org/en/blog/"],
    "twitter_screen_name": "bitcoin",
    "facebook_username": "bitcoins",
    "telegram_channel_identifier": "BitcoinChat",
    "subreddit_url": "https://www.reddit.com/r/Bitcoin/",
    "repos_url": {
        "github": [
            "https://github.com/bitcoin/bitcoin",
            "https://evil.example/not-github",
            "https://github.com/bitcoin/bips",
        ],
    },
}


def test_sanitize_rejects_non_http_and_local():
    assert sanitize_http_url("javascript:alert(1)") is None
    assert sanitize_http_url("data:text/html,hi") is None
    assert sanitize_http_url("ftp://example.com") is None
    assert sanitize_http_url("https://localhost/secret") is None
    assert sanitize_http_url("http://127.0.0.1/") is None
    assert sanitize_http_url("") is None
    assert sanitize_http_url("https://bitcoin.org/") == "https://bitcoin.org/"


def test_project_links_from_payload_maps_handles_and_skips_junk():
    links = project_links_from_payload(BITCOIN_LINKS)
    by_kind = {item.kind: item for item in links}
    urls = [item.url for item in links]
    assert any(item.kind == "website" and item.url == "https://bitcoin.org/" for item in links)
    assert by_kind["whitepaper"].url == "https://bitcoin.org/bitcoin.pdf"
    assert by_kind["x"].url == "https://x.com/bitcoin"
    assert "https://t.me/BitcoinChat" in urls
    assert "https://t.me/Bitcoin" in urls
    assert by_kind["facebook"].url == "https://www.facebook.com/bitcoins"
    assert by_kind["reddit"].url == "https://www.reddit.com/r/Bitcoin/"
    assert by_kind["discord"].url == "https://discord.gg/bitcoin"
    assert "https://github.com/bitcoin/bitcoin" in urls
    assert "https://github.com/bitcoin/bips" in urls
    assert all(item.url.startswith(("http://", "https://")) for item in links)
    assert "javascript:alert(1)" not in urls
    assert "ftp://explorer.example" not in urls
    assert "https://evil.example/not-github" not in urls
    assert urls.count("https://bitcoin.org/") == 1
    kinds = [item.kind for item in links]
    assert kinds.index("website") < kinds.index("explorer")
    assert kinds.index("explorer") < kinds.index("x")
    assert kinds.index("telegram") < kinds.index("github")
    assert kinds.index("discord") < kinds.index("github")
    assert kinds.index("x") < kinds.index("github")


def test_genesis_date_and_category_priority():
    assert genesis_date_from_payload("2009-01-03") == "2009-01-03"
    assert genesis_date_from_payload("not-a-date") is None
    assert genesis_date_from_payload("1999-01-01") is None
    assert genesis_date_from_payload("https://example.com") is None
    cats = categories_from_payload(["GMCI 30 Index", "Layer 1 (L1)", "FTX Holdings", "Proof of Work (PoW)"])
    assert cats[0] == "Layer 1 (L1)"
    assert cats.index("Layer 1 (L1)") < cats.index("GMCI 30 Index")


def test_contracts_from_payload_never_invents():
    assert contracts_from_payload(None) == []
    assert contracts_from_payload({"": "", "ethereum": ""}) == []
    assert contracts_from_payload({"ethereum": "javascript:alert(1)"}) == []
    assert contracts_from_payload({"ethereum": "0x"}) == []
    rows = contracts_from_payload(
        {"ethereum": "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48"},
        {
            "ethereum": {"contract_address": "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48"},
            "solana": {"contract_address": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"},
            "": {"contract_address": ""},
        },
    )
    assert [item.platform for item in rows] == ["ethereum", "solana"]
    assert rows[0].label == "Ethereum"
    assert rows[0].address.startswith("0xa0b8")
    assert rows[1].platform == "solana"


def test_discord_from_forum_is_social_before_github():
    links = project_links_from_payload({
        "homepage": ["https://example.org/"],
        "official_forum_url": ["https://discord.gg/example"],
        "repos_url": {"github": ["https://github.com/example/example"]},
    })
    kinds = [item.kind for item in links]
    assert kinds == ["website", "discord", "github"]


def test_project_links_empty_when_missing_or_invalid():
    assert project_links_from_payload(None) == []
    assert project_links_from_payload({}) == []
    assert project_links_from_payload({"homepage": ["", "not-a-url"], "twitter_screen_name": "!!"}) == []
    assert project_links_from_payload({"twitter_screen_name": "https://evil.example/phishing"}) == []
    assert project_links_from_payload({"telegram_channel_identifier": "https://evil.example/nope"}) == []
    from_x = project_links_from_payload({"twitter_screen_name": "https://x.com/bitcoin"})
    assert from_x and from_x[0].url == "https://x.com/bitcoin"
    assert categories_from_payload(["Layer 1", "Layer 1", "x" * 80, "  "]) == ["Layer 1"]


class _FailingClient:
    def __init__(self, *args, **kwargs):
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        return False

    async def get(self, *args, **kwargs):
        raise RuntimeError("offline")


class _ProfileClient:
    payload = {
        "id": "bitcoin",
        "links": BITCOIN_LINKS,
        "categories": ["Cryptocurrency", "Layer 1 (L1)"],
        "description": {"en": "<p>Bitcoin is a <a href='https://bitcoin.org'>peer-to-peer</a> network.</p>"},
        "genesis_date": "2009-01-03",
        "platforms": {"": ""},
        "detail_platforms": {"": {"contract_address": ""}},
    }

    def __init__(self, *args, **kwargs):
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        return False

    async def get(self, url, params=None):
        request = httpx.Request("GET", str(url))
        return httpx.Response(200, json=self.payload, request=request)


async def _noop_cache_get(_key):
    return None


@pytest.mark.asyncio
async def test_profile_does_not_invent_urls_when_offline(monkeypatch):
    monkeypatch.setattr("app.services.project.httpx.AsyncClient", _FailingClient)
    monkeypatch.setattr("app.services.project.cache_get", _noop_cache_get)
    profile = await get_asset_profile("bitcoin")
    assert profile.links == []
    assert profile.source in {"demo", "unavailable"}
    assert "invent" in profile.note.lower()
    assert "scrape" in profile.note.lower()


@pytest.mark.asyncio
async def test_profile_parses_coingecko_payload(monkeypatch):
    monkeypatch.setattr("app.services.project.httpx.AsyncClient", _ProfileClient)
    monkeypatch.setattr("app.services.project.cache_get", _noop_cache_get)
    profile = await get_asset_profile("bitcoin")
    assert profile.source == "coingecko"
    assert profile.links
    assert any(item.kind == "website" and "bitcoin.org" in item.url for item in profile.links)
    assert any(item.kind == "x" and item.url == "https://x.com/bitcoin" for item in profile.links)
    assert "Cryptocurrency" in profile.categories
    assert profile.description and "Bitcoin is a" in profile.description
    assert profile.genesis_date == "2009-01-03"
    assert profile.contracts == []
    assert "<p>" not in (profile.description or "")
    assert all(item.url.startswith("https://") for item in profile.links)
    assert "invent" in profile.note.lower() or "coingecko" in profile.note.lower()


class _EmptyProfileClient(_ProfileClient):
    payload = {"id": "obscure-coin", "links": {}, "categories": [], "description": {}, "genesis_date": None}


@pytest.mark.asyncio
async def test_profile_cache_envelope_drops_javascript(monkeypatch):
    async def poisoned(_key):
        return {
            "links": [{"kind": "x", "label": "X", "url": "javascript:alert(1)"}, {"kind": "web", "label": "Web", "url": "https://bitcoin.org/"}],
            "categories": ["Cryptocurrency"],
            "description": "ok",
            "genesis_date": "not-a-date",
            "source": "coingecko",
            "note": "cached",
            "last_live_at": "2026-09-20T00:00:00Z",
        }

    monkeypatch.setattr("app.services.project.cache_get", poisoned)
    profile = await get_asset_profile("bitcoin")
    assert all(item.url.startswith("https://") for item in profile.links)
    assert profile.links and profile.links[0].url == "https://bitcoin.org/"
    assert all("javascript" not in item.url for item in profile.links)
    assert profile.genesis_date is None


@pytest.mark.asyncio
async def test_profile_empty_links_stay_empty(monkeypatch):
    monkeypatch.setattr("app.services.project.httpx.AsyncClient", _EmptyProfileClient)
    monkeypatch.setattr("app.services.project.cache_get", _noop_cache_get)
    profile = await get_asset_profile("obscure-coin")
    assert profile.links == []
    assert profile.source == "coingecko"
    assert profile.description is None
    assert profile.genesis_date is None
    assert "invent" in profile.note.lower()
