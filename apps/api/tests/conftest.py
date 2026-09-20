import os

os.environ.setdefault("REDIS_URL", "")
os.environ.setdefault("NEWS_RSS_URLS", "")
os.environ.setdefault("COINGECKO_API_KEY", "")
os.environ["FEAR_GREED_URL"] = ""

import pytest

from app.config import get_settings


@pytest.fixture(autouse=True)
def clear_settings_cache(monkeypatch):
    from app.services.market import clear_market_memory_cache

    async def _no_sleep(_seconds: float = 0) -> None:
        return None

    monkeypatch.setattr("app.services.market._sleep", _no_sleep)
    get_settings.cache_clear()
    clear_market_memory_cache()
    yield
    get_settings.cache_clear()
    clear_market_memory_cache()
