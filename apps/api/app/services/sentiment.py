import re
from typing import Any

from app.services.news import get_news

# Headline lexicon only — not a social graph, not Twitter, not NLP.
BULLISH = {
    "surge", "rally", "bull", "bullish", "soar", "soars", "record", "gain", "gains",
    "jump", "jumps", "highs", "beats", "inflow", "inflows", "recovery", "rebounds",
}
BEARISH = {
    "crash", "dump", "bear", "bearish", "plunge", "plunges", "plummet", "loss", "losses",
    "hack", "lawsuit", "outflow", "outflows", "selloff", "fraud", "ban",
}
TOKEN_RE = re.compile(r"[a-z0-9]+")
# Short English words that are also coin names — require the ticker, not "cash flow".
GENERIC_COIN_WORDS = {
    "flow", "near", "one", "ocean", "gas", "ton", "dash", "core", "beam",
    "move", "mask", "super", "link", "cake", "injective", "compound", "maker",
}


def headline_polarity(title: str) -> int:
    tokens = TOKEN_RE.findall((title or "").lower())
    pos = sum(1 for token in tokens if token in BULLISH)
    neg = sum(1 for token in tokens if token in BEARISH)
    if pos > neg:
        return 1
    if neg > pos:
        return -1
    return 0


def _bounded_phrase(text: str, phrase: str) -> bool:
    needle = (phrase or "").strip().lower()
    if len(needle) < 3:
        return False
    pattern = re.escape(needle).replace(r"\-", r"[\s\-]+").replace(r"\ ", r"[\s\-]+")
    return re.search(rf"(?<![a-z0-9]){pattern}(?![a-z0-9])", text) is not None


def headline_matches_coin(title: str, coin: dict[str, str]) -> bool:
    raw = title or ""
    text = f" {raw.lower()} "
    ident = (coin.get("id") or "").lower()
    name = (coin.get("name") or "").lower()
    symbol = (coin.get("symbol") or "").lower()
    ident_phrase = ident.replace("-", " ")
    generic = ident_phrase in GENERIC_COIN_WORDS or name in GENERIC_COIN_WORDS
    if symbol and len(symbol) >= 3:
        if generic:
            if re.search(rf"\b{re.escape(symbol.upper())}\b", raw) or re.search(rf"\${re.escape(symbol)}\b", text):
                return True
        elif re.search(rf"\b{re.escape(symbol)}\b", text):
            return True
    if generic:
        return False
    if ident_phrase and _bounded_phrase(text, ident_phrase):
        return True
    if name and _bounded_phrase(text, name):
        return True
    return False


def score_watchlist_headlines(
    coins: list[dict[str, str]],
    headlines: list[dict[str, Any]],
) -> dict[str, Any]:
    if not coins:
        return {
            "available": False,
            "engine": "headline-heuristic",
            "reason": "sentiment unavailable — no watchlist coins were provided. CoinVigil does not invent social scores.",
            "items": [],
        }
    matched: list[dict[str, Any]] = []
    for item in headlines:
        title = str(item.get("title") or "")
        hit = next((coin for coin in coins if headline_matches_coin(title, coin)), None)
        if not hit:
            continue
        polarity = headline_polarity(title)
        matched.append({
            "title": title[:180],
            "source": str(item.get("source") or "RSS")[:80],
            "url": item.get("link") or item.get("url"),
            "coin_id": hit.get("id"),
            "polarity": polarity,
            "lean": "bullish" if polarity > 0 else "bearish" if polarity < 0 else "mixed",
        })
    if not matched:
        return {
            "available": False,
            "engine": "headline-heuristic",
            "reason": "sentiment unavailable — no watchlist-related headlines in this RSS fetch. CoinVigil does not invent social scores.",
            "items": [],
        }
    net = sum(row["polarity"] for row in matched)
    lean = "bullish" if net > 0 else "bearish" if net < 0 else "mixed"
    return {
        "available": True,
        "engine": "headline-heuristic",
        "reason": None,
        "lean": lean,
        "matched": len(matched),
        "net": net,
        "items": matched[:8],
        "note": "Lexicon on attributed RSS titles for starred coins only — not Twitter, not NLP, not a social score.",
    }


async def watchlist_sentiment(coins: list[dict[str, str]]) -> dict[str, Any]:
    cleaned = []
    seen = set()
    for row in coins:
        ident = str(row.get("id") or "").strip().lower()
        if not ident or ident in seen:
            continue
        seen.add(ident)
        cleaned.append({
            "id": ident,
            "symbol": str(row.get("symbol") or ident).strip().lower()[:16],
            "name": str(row.get("name") or ident).strip()[:80],
        })
        if len(cleaned) >= 25:
            break
    headlines = await get_news(30)
    if not headlines:
        return {
            "available": False,
            "engine": "headline-heuristic",
            "reason": "sentiment unavailable — no news feeds returned headlines. CoinVigil does not invent social scores.",
            "items": [],
        }
    return score_watchlist_headlines(cleaned, headlines)
