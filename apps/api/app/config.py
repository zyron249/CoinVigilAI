from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_env: str = "development"
    coingecko_base_url: str = "https://api.coingecko.com/api/v3"
    openai_api_key: str = ""
    openai_model: str = "gpt-5.6-luna"
    news_rss_urls: str = ""
    database_url: str = "postgresql://coinvigil:coinvigil@localhost:5432/coinvigil"
    redis_url: str = "redis://localhost:6379/0"

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @property
    def rss_urls(self) -> list[str]:
        return [url.strip() for url in self.news_rss_urls.split(",") if url.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
