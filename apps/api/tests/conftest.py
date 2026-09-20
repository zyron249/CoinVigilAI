import os

os.environ.setdefault("REDIS_URL", "")
os.environ.setdefault("NEWS_RSS_URLS", "")
os.environ.setdefault("COINGECKO_API_KEY", "")
os.environ["FEAR_GREED_URL"] = ""

import pytest

from app.config import get_settings


@pytest.fixture(autouse=True)
def clear_settings_cache():
    from app.services.market import clear_market_memory_cache
    get_settings.cache_clear()
    clear_market_memory_cache()
    yield
    get_settings.cache_clear()
    clear_market_memory_cache()
