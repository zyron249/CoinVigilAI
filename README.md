# CoinVigil AI

CoinVigil AI is a 24/7 crypto market intelligence platform that combines live market data, quantitative risk scoring, market radar signals, configurable news monitoring, and a multi-model AI Council.

## AI Council

CoinVigil does not rely on one model for the final AI judgment. Every configured provider receives the same canonical market and risk facts independently. Their outputs are normalized into a strict JSON contract, then combined by a weighted consensus engine.

Supported provider adapters:

- OpenAI / ChatGPT models
- xAI / Grok
- Google Gemini
- Anthropic Claude
- Mistral
- DeepSeek
- Groq-hosted models
- Perplexity
- OpenRouter for additional model families

The council runs configured providers in parallel. A provider timeout or failure does not crash the full analysis. Successful opinions are combined using provider weight and the model's stated confidence. The response exposes vote counts, weighted agreement, dissenting models, individual provider results, and the final consensus. If no external AI provider is configured or available, CoinVigil falls back to deterministic heuristic analysis.

No API keys belong in GitHub. All credentials stay in the local or deployment environment and `.env` remains ignored by Git.

## MVP capabilities

- Live crypto prices and market metrics
- Multi-model AI Council analysis per asset
- Deterministic heuristic fallback
- Transparent risk score with drivers
- Market radar for unusual movers
- Configurable RSS intelligence feed
- Per-provider failure isolation and request timeouts
- Weighted consensus, agreement score, and dissent visibility
- Dockerized API + web app + PostgreSQL + Redis
- Health checks and graceful fallbacks when providers are unavailable
- GitHub Actions full-stack build and smoke testing

## Architecture

```text
                        +--> OpenAI --------+
                        +--> xAI / Grok ----+
                        +--> Gemini --------+
                        +--> Claude --------+
Market APIs --> Risk -->+--> Mistral -------+--> AI Council --> Consensus
     |                  +--> DeepSeek ------+       |              |
     |                  +--> Groq ----------+       |              v
     |                  +--> Perplexity ----+       |         FastAPI response
     |                  +--> OpenRouter ----+       |              |
     |                                              |              v
News/RSS --------------------------------> Intelligence       Next.js dashboard
     |
     +---------------------------------------------> FastAPI

PostgreSQL + Redis support the application stack.
```

## Quick start

1. Copy the environment file:

```bash
cp .env.example .env
```

2. Add only the provider API keys you want to enable. You do not need all providers for the platform to run.

3. Start everything:

```bash
docker compose up --build
```

4. Open:

- Web: `http://localhost:3000`
- API docs: `http://localhost:8000/docs`
- API health: `http://localhost:8000/health`
- AI Council status: `http://localhost:8000/api/ai/council/status`

## AI provider configuration

`.env.example` contains configuration fields for all supported adapters. Important fields include:

```text
AI_COUNCIL_ENABLED=true
AI_REQUEST_TIMEOUT_SECONDS=25
AI_PROVIDER_WEIGHTS_JSON=

OPENAI_API_KEY=
XAI_API_KEY=
GEMINI_API_KEY=
ANTHROPIC_API_KEY=
MISTRAL_API_KEY=
DEEPSEEK_API_KEY=
GROQ_API_KEY=
PERPLEXITY_API_KEY=
OPENROUTER_API_KEY=
```

Model names are environment variables too, so they can be changed without modifying source code when providers release or retire models.

Optional weighting example:

```text
AI_PROVIDER_WEIGHTS_JSON={"openai":1.2,"xai":1.0,"gemini":1.0,"anthropic":1.1}
```

A weight changes how strongly that provider contributes to consensus. It does not bypass conflict handling: strong bullish/bearish disagreement can force the final council result to neutral.

## Council response behavior

For each configured provider the system requests only:

```json
{
  "bias": "bullish | bearish | neutral",
  "confidence": 0,
  "summary": "evidence-constrained explanation"
}
```

Providers receive market and risk facts collected by CoinVigil. Prompts explicitly prohibit inventing missing news, price targets, guarantees, or unsupported causes.

The final analysis can include:

- final consensus bias
- consensus confidence
- weighted agreement ratio
- providers requested and providers that responded successfully
- vote totals
- dissenting provider opinions
- latency and error state per provider

## Main API routes

- `GET /health`
- `GET /api/market?limit=20`
- `GET /api/assets/{coin_id}/analysis`
- `GET /api/ai/council/status`
- `GET /api/radar`
- `GET /api/news`

## CI verification

Every push to `main` builds and validates the application in GitHub Actions. The workflow currently checks Python syntax, Docker Compose configuration, API image build, AI Council consensus behavior, frontend production build, full-stack startup, API health, market/radar/analysis/news/council endpoints, and the web application.

Live third-party AI requests are intentionally not executed in public CI because provider API keys must not be committed to the repository. Adapter code is exercised structurally, consensus logic is tested deterministically, and real provider calls activate when valid keys are supplied in the deployment environment.

## Operational notes

Enabling many AI providers increases token/API cost. Requests are dispatched in parallel, so total response time is normally driven by the slowest responding configured provider up to the configured timeout. For production, provider weights, timeouts, rate limits, caching, and model selection should be tuned using measured quality, latency, and cost rather than brand name alone.

## Product direction

The platform intentionally separates source collection, quantitative scoring, AI interpretation, and consensus. The next major milestones are:

1. Exchange WebSocket ingestion
2. Historical candles + TimescaleDB
3. On-chain and whale intelligence providers
4. Event/entity deduplication and source-confidence scoring
5. User accounts, watchlists, and alerts
6. Multi-source news verification pipeline
7. Model evaluation, calibration, and backtesting
8. Provider cost/latency routing and automatic failover policies
9. Production observability and deployment

## Disclaimer

CoinVigil AI is an informational analytics product, not financial advice. Market data, source data, quantitative signals, and AI outputs can be wrong, incomplete, delayed, or contradictory. AI consensus is not a guarantee of future market behavior.
