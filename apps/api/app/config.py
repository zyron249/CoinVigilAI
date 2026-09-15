from functools import lru_cache
import json
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_env: str = "development"
    coingecko_base_url: str = "https://api.coingecko.com/api/v3"
    news_rss_urls: str = ""
    database_url: str = "postgresql://coinvigil:coinvigil@localhost:5432/coinvigil"
    redis_url: str = "redis://localhost:6379/0"

    ai_council_enabled: bool = True
    ai_request_timeout_seconds: float = 25.0
    ai_provider_weights_json: str = ""

    openai_api_key: str = ""
    openai_model: str = "gpt-5.6-luna"

    xai_api_key: str = ""
    xai_model: str = "grok-4.6"
    xai_base_url: str = "https://api.x.ai/v1"

    gemini_api_key: str = ""
    gemini_model: str = "gemini-3.8-flash"

    anthropic_api_key: str = ""
    anthropic_model: str = ""

    mistral_api_key: str = ""
    mistral_model: str = "mistral-large-latest"
    mistral_base_url: str = "https://api.mistral.ai/v1"

    deepseek_api_key: str = ""
    deepseek_model: str = "deepseek-chat"
    deepseek_base_url: str = "https://api.deepseek.com"

    groq_api_key: str = ""
    groq_model: str = "openai/gpt-oss-120b"
    groq_base_url: str = "https://api.groq.com/openai/v1"

    perplexity_api_key: str = ""
    perplexity_model: str = ""
    perplexity_base_url: str = "https://api.perplexity.ai"

    openrouter_api_key: str = ""
    openrouter_model: str = ""
    openrouter_base_url: str = "https://openrouter.ai/api/v1"

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @property
    def rss_urls(self) -> list[str]:
        return [url.strip() for url in self.news_rss_urls.split(",") if url.strip()]

    @property
    def provider_weights(self) -> dict[str, float]:
        if not self.ai_provider_weights_json.strip():
            return {}
        try:
            raw = json.loads(self.ai_provider_weights_json)
            return {
                str(name).lower(): max(0.0, float(weight))
                for name, weight in raw.items()
            }
        except (TypeError, ValueError, json.JSONDecodeError):
            return {}


@lru_cache
def get_settings() -> Settings:
    return Settings()
