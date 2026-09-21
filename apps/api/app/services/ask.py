import json
import re
from typing import Any

from app.config import get_settings
from app.models import AskAnswer, AskCitation, MarketAsset
from app.services.ai import _build_provider_calls, _extract_json
from app.services.market import get_asset_with_source, get_ranked_markets
from app.services.news import get_news

ASK_DISCLAIMER = (
    "You are interacting with CoinVigil AI. Informational research only — not financial advice. "
    "Prices, market cap, and volume come from read-only CoinGecko/news tools. CoinVigil does not invent numbers, "
    "does not predict prices, and does not execute trades."
)
HEURISTIC_ENGINE = "heuristic-tools"
ADVICE_RE = re.compile(
    r"\b(buy|sell|long|short|leverage|apy guarantee|price target|predict|will it (moon|dump|hit)|should i (buy|sell))\b",
    re.I,
)
TOKEN_RE = re.compile(r"[a-z0-9][a-z0-9-]{1,40}")
SKIP_TOKENS = {
    "what", "whats", "price", "market", "cap", "volume", "why", "moved", "the", "for",
    "how", "much", "is", "are", "and", "with", "over", "this", "that", "today", "doing",
    "change", "news", "brief", "tell", "me", "about", "please", "show", "current",
    "snapshot", "rank", "vs", "versus", "from", "into", "usd", "dollar", "dollars",
    "now", "latest", "update", "updates", "moving", "look", "looking", "24h", "1h", "7d",
}


def question_tokens(question: str) -> list[str]:
    return [token for token in TOKEN_RE.findall(question.lower()) if token not in SKIP_TOKENS and len(token) >= 2]


def _quote_row(asset: MarketAsset, source: str) -> dict[str, Any]:
    return {
        "id": asset.id,
        "symbol": asset.symbol.upper(),
        "name": asset.name,
        "price_usd": asset.current_price,
        "change_1h": asset.price_change_percentage_1h,
        "change_24h": asset.price_change_percentage_24h,
        "change_7d": asset.price_change_percentage_7d,
        "market_cap": asset.market_cap,
        "volume_24h": asset.total_volume,
        "rank": asset.market_cap_rank,
        "source": source,
    }


def _usd(value: float | None) -> str:
    if value is None:
        return "unavailable in this snapshot"
    if abs(value) >= 1_000_000_000:
        return f"${value / 1_000_000_000:.2f}B"
    if abs(value) >= 1_000_000:
        return f"${value / 1_000_000:.2f}M"
    if abs(value) >= 1:
        return f"${value:,.2f}"
    return f"${value:.6f}"


def _pct(value: float | None) -> str:
    if value is None:
        return "n/a"
    return f"{value:+.2f}%"


async def tool_screen_markets(query: str | None = None, limit: int = 8) -> dict[str, Any]:
    page = await get_ranked_markets(limit=limit, page=1, sort="market_cap", order="desc", query=query)
    return {
        "tool": "screen_markets",
        "query": (query or "").strip() or None,
        "source": page.source,
        "partial": page.partial,
        "universe_size": page.universe_size,
        "stale": page.stale,
        "assets": [_quote_row(asset, page.source) for asset in page.data[:limit]],
    }


async def tool_get_asset_quote(coin_id: str) -> dict[str, Any] | None:
    asset, source = await get_asset_with_source(coin_id)
    if not asset:
        return None
    return {"tool": "get_asset_quote", **_quote_row(asset, source)}


async def tool_get_news(limit: int = 5, query: str | None = None) -> dict[str, Any]:
    items = await get_news(max(1, min(limit, 12)))
    needle = (query or "").strip().lower()
    rows = []
    for item in items:
        title = str(item.get("title") or "")
        if needle and needle not in title.lower() and needle not in str(item.get("source") or "").lower():
            continue
        link = str(item.get("link") or "")
        if link and not link.startswith(("http://", "https://")):
            continue
        rows.append({
            "title": title[:180],
            "source": str(item.get("source") or "RSS")[:80],
            "url": link or None,
            "published_at": item.get("published_at") or None,
        })
        if len(rows) >= limit:
            break
    return {"tool": "get_news", "query": needle or None, "items": rows}


def resolve_coin_id(question: str, assets: list[dict[str, Any]], coin_id: str | None) -> str | None:
    if coin_id and coin_id.strip():
        return coin_id.strip().lower()
    text = f" {question.lower()} "
    ranked = sorted(assets, key=lambda row: len(str(row.get("name") or "")), reverse=True)
    for row in ranked:
        name = str(row.get("name") or "").lower()
        symbol = str(row.get("symbol") or "").lower()
        ident = str(row.get("id") or "").lower()
        if ident and ident in text:
            return ident
        if name and len(name) >= 3 and name in text:
            return ident or name
        if symbol and re.search(rf"\b{re.escape(symbol)}\b", text):
            return ident or symbol
    for token in question_tokens(question):
        for row in assets:
            if token in {str(row.get("id") or ""), str(row.get("symbol") or "").lower()}:
                return str(row.get("id"))
    return None


def _citations(facts: dict[str, Any]) -> list[AskCitation]:
    rows: list[AskCitation] = []
    quote = facts.get("quote")
    if quote:
        rows.append(AskCitation(
            kind="quote",
            label=f"{quote.get('name')} quote",
            detail=f"{_usd(quote.get('price_usd'))} · source {quote.get('source')}",
        ))
    screen = facts.get("screen") or {}
    if screen.get("assets"):
        rows.append(AskCitation(
            kind="markets",
            label="CoinGecko-tracked snapshot",
            detail=f"{screen.get('universe_size')} assets · source {screen.get('source')}",
        ))
    for item in (facts.get("news") or {}).get("items") or []:
        rows.append(AskCitation(
            kind="news",
            label=item.get("title") or "Headline",
            detail=item.get("source"),
            url=item.get("url"),
        ))
    return rows[:8]


def heuristic_answer(question: str, facts: dict[str, Any], *, refused: bool, insight: bool) -> str:
    parts: list[str] = []
    if refused:
        parts.append("CoinVigil does not give buy/sell advice or price predictions.")
    quote = facts.get("quote")
    if quote:
        verb = "TLDR of this snapshot" if insight else "Tool quote"
        parts.append(
            f"{verb}: {quote.get('name')} ({quote.get('symbol')}) is {_usd(quote.get('price_usd'))} "
            f"with {_pct(quote.get('change_24h'))} over 24h. "
            f"Market cap {_usd(quote.get('market_cap'))}; 24h volume {_usd(quote.get('volume_24h'))}. "
            f"Source: {quote.get('source')}."
        )
        if quote.get("source") == "demo":
            parts.append("This quote is from a labeled demo snapshot, not live CoinGecko.")
    screen = facts.get("screen") or {}
    assets = screen.get("assets") or []
    if assets and not quote:
        lead = assets[0]
        parts.append(
            f"Top of this CoinGecko-tracked screen: {lead.get('name')} at {_usd(lead.get('price_usd'))} "
            f"({_pct(lead.get('change_24h'))} 24h). Source: {screen.get('source')}."
        )
    elif assets and quote:
        peers = [row for row in assets if row.get("id") != quote.get("id")][:3]
        if peers:
            bits = [f"{row.get('symbol')} {_pct(row.get('change_24h'))}" for row in peers]
            parts.append("Nearby snapshot rows: " + ", ".join(bits) + ".")
    news = (facts.get("news") or {}).get("items") or []
    if news:
        headlines = "; ".join(f"{item.get('title')} ({item.get('source')})" for item in news[:3])
        parts.append(f"Attributed RSS headlines (not invented): {headlines}.")
    elif insight:
        parts.append("No matching RSS headlines in this fetch — the gap stays empty.")
    if not parts:
        parts.append("Tools returned no matching quote or headlines. CoinVigil does not invent a fill-in answer.")
    parts.append("Numbers above are copied from tools, not generated.")
    return " ".join(parts)


def ask_prompt(question: str, facts: dict[str, Any]) -> str:
    payload = {
        "task": (
            "You are CoinVigil Ask. The user is interacting with an AI. "
            "Use ONLY the supplied tool facts. Never invent prices, market cap, volume, URLs, or news. "
            "If a number is missing, say it is unavailable. No buy/sell advice and no price prediction. "
            "Return strict JSON only."
        ),
        "question": question,
        "facts": facts,
        "required_json": {
            "answer": "2-6 sentences grounded in the facts",
        },
    }
    return json.dumps(payload, separators=(",", ":"), ensure_ascii=False)


async def _maybe_model_answer(question: str, facts: dict[str, Any]) -> tuple[str | None, list[str], list[str]]:
    settings = get_settings()
    if not settings.ai_council_enabled:
        return None, [], []
    calls = _build_provider_calls(ask_prompt(question, facts), settings)
    requested = [name for name, _, _ in calls]
    if not calls:
        return None, requested, []
    import asyncio

    async def run(name, _model, call):
        try:
            text = await call()
            parsed = _extract_json(text)
            answer = str(parsed.get("answer") or "").strip()
            return name, answer
        except Exception:
            return name, ""

    results = await asyncio.gather(*[run(name, model, call) for name, model, call in calls])
    responded = [name for name, answer in results if answer]
    preferred = next((answer for name, answer in results if name == "xai" and answer), None)
    chosen = preferred or next((answer for _name, answer in results if answer), None)
    return (chosen[:1600] if chosen else None), requested, responded


async def answer_ask(question: str, coin_id: str | None = None, *, insight: bool = False) -> AskAnswer:
    text = " ".join((question or "").split())[:500]
    if not text:
        return AskAnswer(
            question="",
            answer="Ask a market question. CoinVigil will only answer from read-only tools.",
            engine=HEURISTIC_ENGINE,
            generated=False,
            tools_used=[],
            data_source="unavailable",
        )

    refused = bool(ADVICE_RE.search(text))
    tokens = question_tokens(text)
    screen_query = None if insight else coin_id

    screen = await tool_screen_markets(screen_query, limit=8)
    tools = ["screen_markets"]
    facts: dict[str, Any] = {"screen": screen}
    resolved = resolve_coin_id(text, screen.get("assets") or [], coin_id)
    if resolved:
        quote = await tool_get_asset_quote(resolved)
        if quote:
            facts["quote"] = quote
            tools.append("get_asset_quote")
    if "quote" not in facts:
        for token in tokens[:3]:
            quote = await tool_get_asset_quote(token)
            if quote:
                facts["quote"] = quote
                tools.append("get_asset_quote")
                resolved = str(quote.get("id") or token)
                break
    news_query = (facts.get("quote") or {}).get("name") or resolved or (None if insight else screen_query)
    facts["news"] = await tool_get_news(5, news_query if insight or resolved else None)
    tools.append("get_news")

    heuristic = heuristic_answer(text, facts, refused=refused, insight=insight)
    model_text, requested, responded = await _maybe_model_answer(text, facts)
    generated = bool(model_text)
    answer = model_text if generated else heuristic
    if refused and generated:
        answer = "CoinVigil does not give buy/sell advice or price predictions. " + answer
    source = (facts.get("quote") or {}).get("source") or screen.get("source") or "unknown"
    quotes = []
    if facts.get("quote"):
        quotes.append(facts["quote"])
    quotes.extend(screen.get("assets") or [])
    seen: set[str] = set()
    unique_quotes = []
    for row in quotes:
        ident = str(row.get("id") or "")
        if not ident or ident in seen:
            continue
        seen.add(ident)
        unique_quotes.append(row)

    return AskAnswer(
        question=text,
        answer=answer,
        engine=f"ai-council:{len(responded)}" if generated else HEURISTIC_ENGINE,
        generated=generated,
        tools_used=tools,
        citations=_citations(facts),
        quotes=unique_quotes[:6],
        data_source=source,
        coin_id=resolved,
        refused_advice=refused,
        providers_requested=requested,
        providers_responded=responded,
        disclaimer=ASK_DISCLAIMER if generated else (
            "You are interacting with CoinVigil AI in heuristic-tool mode (no live model vote). " + ASK_DISCLAIMER
        ),
    )
