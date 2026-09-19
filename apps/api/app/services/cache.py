import json
import logging
from typing import Any

from app.config import get_settings

logger = logging.getLogger(__name__)

_client = None
_unavailable = False


async def redis_status() -> str:
    settings = get_settings()
    if not settings.redis_url.strip():
        return "disabled"
    client = await get_redis()
    return "ok" if client is not None else "unavailable"


async def get_redis():
    global _client, _unavailable
    if _unavailable:
        return None
    if _client is not None:
        return _client

    settings = get_settings()
    if not settings.redis_url.strip():
        return None

    try:
        import redis.asyncio as redis
    except ImportError:
        logger.info("redis package not installed; continuing without cache")
        _unavailable = True
        return None

    try:
        candidate = redis.from_url(
            settings.redis_url,
            socket_connect_timeout=0.4,
            socket_timeout=0.4,
            decode_responses=True,
        )
        await candidate.ping()
        _client = candidate
        return _client
    except Exception as exc:
        logger.info("Redis unavailable, continuing without cache: %s", type(exc).__name__)
        _unavailable = True
        _client = None
        return None


async def cache_get(key: str) -> Any | None:
    client = await get_redis()
    if client is None:
        return None
    try:
        raw = await client.get(key)
        return json.loads(raw) if raw else None
    except Exception:
        return None


async def cache_set(key: str, value: Any, ttl_seconds: int) -> None:
    client = await get_redis()
    if client is None:
        return
    try:
        await client.set(key, json.dumps(value), ex=max(1, int(ttl_seconds)))
    except Exception:
        return
