# CoinVigil AI

CoinVigil AI is a 24/7 AI-powered crypto market intelligence platform. It combines live market data, automated risk scoring, market radar signals, configurable news monitoring, and optional LLM analysis in one dashboard.

## MVP capabilities

- Live crypto prices and market metrics
- AI/heuristic market analysis per asset
- Risk score with transparent drivers
- Market radar for unusual movers
- Configurable RSS intelligence feed
- Optional OpenAI analysis through the Responses API
- Dockerized API + web app + PostgreSQL + Redis
- Health checks and graceful fallbacks when data providers are unavailable

## Architecture

```text
Market APIs -----> FastAPI ------> Risk Engine -----------+
                     |                                   |
News/RSS ----------> | -------> Intelligence Engine ----> API ----> Next.js dashboard
                     |                                   |
                     +-------> Optional OpenAI ----------+
                     |
                 Redis/Postgres (next persistence stage)
```

## Quick start

1. Copy the environment file:

```bash
cp .env.example .env
```

2. Start everything:

```bash
docker compose up --build
```

3. Open:

- Web: http://localhost:3000
- API docs: http://localhost:8000/docs
- API health: http://localhost:8000/health

## Optional AI mode

Set `OPENAI_API_KEY` in `.env`. Without a key, the platform still returns deterministic heuristic analysis, so the MVP remains functional.

## Main API routes

- `GET /health`
- `GET /api/market?limit=20`
- `GET /api/assets/{coin_id}/analysis`
- `GET /api/radar`
- `GET /api/news`

## Product direction

The MVP intentionally separates source collection, quantitative scoring, and LLM narrative generation. The LLM does not invent market facts; it receives market metrics and risk signals already collected by the platform and explains them.

Next milestones:

1. Exchange WebSocket ingestion
2. Historical candles + TimescaleDB
3. On-chain provider integrations
4. Entity/event deduplication and confidence scoring
5. User accounts, watchlists, alerts
6. Source credibility and event verification pipeline
7. Backtesting for risk and signal models
8. Production observability and deployment

## Disclaimer

CoinVigil AI is an informational analytics product, not financial advice. Market and AI outputs can be wrong, incomplete, or delayed.
