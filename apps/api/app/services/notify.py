from collections import deque
from time import time
from urllib.parse import urlparse

import httpx
from fastapi import Request

from app.config import get_settings

DISCLAIMER = "Informational research only — not financial advice. Not a push receipt unless delivered is true."
NOTIFY_LIMIT_PER_HOUR = 30
_notify_hits: deque[float] = deque()


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


def is_discord_webhook(url: str) -> bool:
    host = (urlparse(url).hostname or "").lower()
    return host.endswith("discord.com") or host.endswith("discordapp.com")


def notify_rate_ok() -> bool:
    now = time()
    while _notify_hits and now - _notify_hits[0] > 3600:
        _notify_hits.popleft()
    if len(_notify_hits) >= NOTIFY_LIMIT_PER_HOUR:
        return False
    _notify_hits.append(now)
    return True


def notify_authorized(request: Request | None) -> bool:
    token = get_settings().alert_notify_token.strip()
    if not token:
        return True
    header = ""
    if request is not None:
        header = request.headers.get("x-coinvigil-notify") or ""
    return header == token


def webhook_body(target: str, payload: dict) -> dict:
    name = str(payload.get("name") or payload.get("coin_id") or "watchlist")
    kind = str(payload.get("kind") or "rule")
    threshold = payload.get("threshold")
    note = str(payload.get("note") or "")[:800]
    line = f"Watchlist alert: {name} {kind} {threshold}"
    if is_discord_webhook(target):
        content = f"{line}\n{note}\n{DISCLAIMER}".strip()[:2000]
        return {"content": content}
    return {
        "event": "watchlist_alert",
        "disclaimer": DISCLAIMER,
        "coin_id": payload.get("coin_id"),
        "name": payload.get("name"),
        "symbol": payload.get("symbol"),
        "kind": payload.get("kind"),
        "threshold": payload.get("threshold"),
        "note": note,
        "at": payload.get("at"),
    }


async def forward_alert(payload: dict, request: Request | None = None) -> dict:
    settings = get_settings()
    target = webhook_target_ok(settings.alert_webhook_url)
    if not target:
        return {
            "delivered": False,
            "configured": False,
            "reason": "ALERT_WEBHOOK_URL is not set. In-app history still records the fire. No Telegram/Discord/push is faked.",
        }
    if not notify_authorized(request):
        return {
            "delivered": False,
            "configured": True,
            "reason": "Notify token rejected. Set ALERT_NOTIFY_TOKEN on trusted callers. In-app history still records the fire.",
        }
    if not notify_rate_ok():
        return {
            "delivered": False,
            "configured": True,
            "reason": "Notify rate limited (30/hour). In-app history still records the fire. CoinVigil does not fake delivery.",
        }
    body = webhook_body(target, payload)
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
