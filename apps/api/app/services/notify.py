from urllib.parse import urlparse

import httpx

from app.config import get_settings

DISCLAIMER = "Informational research only — not financial advice. Not a push receipt unless delivered is true."


def webhook_configured() -> bool:
    return bool(get_settings().alert_webhook_url.strip())


def webhook_target_ok(url: str) -> str | None:
    raw = (url or "").strip()
    if not raw:
        return None
    parsed = urlparse(raw)
    if parsed.scheme not in {"https", "http"}:
        return None
    if parsed.scheme == "http" and parsed.hostname not in {"localhost", "127.0.0.1"}:
        return None
    if not parsed.netloc:
        return None
    return raw


async def forward_alert(payload: dict) -> dict:
    settings = get_settings()
    target = webhook_target_ok(settings.alert_webhook_url)
    if not target:
        return {
            "delivered": False,
            "configured": False,
            "reason": "ALERT_WEBHOOK_URL is not set. In-app history still records the fire. No Telegram/Discord/push is faked.",
        }
    body = {
        "event": "watchlist_alert",
        "disclaimer": DISCLAIMER,
        "coin_id": payload.get("coin_id"),
        "name": payload.get("name"),
        "symbol": payload.get("symbol"),
        "kind": payload.get("kind"),
        "threshold": payload.get("threshold"),
        "note": str(payload.get("note") or "")[:800],
        "at": payload.get("at"),
    }
    try:
        timeout = httpx.Timeout(8.0, connect=4.0)
        async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
            response = await client.post(target, json=body)
        ok = 200 <= response.status_code < 300
        return {
            "delivered": ok,
            "configured": True,
            "reason": None if ok else f"Webhook responded HTTP {response.status_code}. In-app history still has the fire.",
        }
    except Exception as exc:
        return {
            "delivered": False,
            "configured": True,
            "reason": f"Webhook POST failed ({type(exc).__name__}). In-app history still has the fire. CoinVigil does not fake delivery.",
        }
