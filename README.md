# CoinVigil AI

CoinVigil AI is a crypto market intelligence MVP: CoinGecko-backed rankings (CMC-style table, not a CoinMarketCap clone), global market stats, 24h gainers/losers, an optional AI Market Brief, a transparent risk score, a market radar, attributed public RSS headlines, a multi-model AI Council (including Grok), an interactive chart lab, and a non-custodial ERC-20 Token Studio.

It is an informational research tool, not a production trading desk and not financial advice.

## What works today

- FastAPI market rankings, global overview, movers, AI brief, radar, analysis, candle, news, and health endpoints
- Next.js Markets homepage: sortable/paginated/searchable rankings of a CoinGecko-tracked snapshot (paginated `/coins/markets`, up to 1,000 by market cap — not every coin worldwide), jump-to-asset search, local browser watchlist, global strip, gainers/losers, AI Market Brief
- Asset pages with an About/overview (English CoinGecko description, genesis date when listed, categories), CoinGecko-listed contract addresses by chain when present, official website/community links grouped website → explorers → socials → repos, denser stats (ATH/ATL + dates, vol/mcap, circulating vs max, 24h range), a Markets tab of CoinGecko exchange tickers (venue/volume filters), Chart Lab with an unmistakable mixed Live/Demo banner when OHLC falls back, and AI analysis
- Heuristic analysis and market brief when no AI keys are configured
- Parallel AI Council adapters (including optional xAI Grok) when you add provider keys
- Redis used as a short TTL cache plus a 6-hour last-live snapshot when CoinGecko rate-limits
- Docker Compose for API + web + Redis (Postgres is not started and is not used)
- GitHub Actions: unit tests, contract tests, image builds, and stack smoke tests

## What is not done yet

- PostgreSQL is **not provisioned**. `/health` reports `postgres: not_provisioned`. Watchlists are **localStorage in this browser only** — there are no accounts.
- There are no user accounts, alerts, WebSocket feed, or production deploy config.
- Token factory contracts are **unaudited**. Token Studio stays disabled until you deploy a factory and set `NEXT_PUBLIC_FACTORY_*`.
- Public CoinGecko is rate-limited. Without a key the API may show a labeled **demo snapshot** of a small BTC/ETH/SOL-led universe.

## AI Council

Every configured provider receives the same market and risk facts. Outputs are normalized to a strict JSON contract and combined by a weighted consensus engine. A single provider timeout does not fail the request. If no provider is configured or none return valid JSON, the API uses the heuristic fallback.

Supported adapters (all optional; missing keys are skipped): OpenAI, xAI / Grok (`XAI_API_KEY`), Gemini, Anthropic, Mistral, DeepSeek, Groq, Perplexity, OpenRouter.

No API keys belong in GitHub. Copy `.env.example` to `.env` and keep `.env` local.

## Architecture

```text
CoinGecko ──(+ Redis cache)──> Risk ──> AI Council (optional) ──> FastAPI
     |                                              |
News/RSS (optional) ───────────────────────────────> FastAPI
                                                    |
                                               Next.js dashboard
                                      (localStorage watchlist, this browser only)
                                                    |
                                         Token Studio (wallet-signed)

Postgres is not in the stack. Redis is optional cache + last-live snapshot only.
```

## Quick start

**One command (Docker):**

```bash
cp .env.example .env   # or: make env
make up                # API :8000, web :3000, Redis
```

Then open `http://localhost:3000` and `http://localhost:3000/status`. No API keys are required. Optional keys go in `.env` — never in git.

**Two terminals (no Docker):**

```bash
make setup
source .venv/bin/activate
make api    # terminal 1
make web    # terminal 2
```

Redis is optional. If it is down, market calls skip the short cache and keep an in-process last-live snapshot.

**Check the stack:**

```bash
make doctor
# or: curl -s http://localhost:8000/api/status
```

`/api/status` and `/status` show Live vs Redis vs AI-keys-configured vs news feeds. They never print secrets.

Other URLs: News `/news`, Token Studio `/token-studio`, API docs `/docs`, liveness `/health`.

## Tests

```bash
# API unit tests (no Docker, no provider keys, no live CoinGecko)
cd apps/api && python3 -m pytest -q

# Token factory / deployment policy tests (needs `cd contracts && npm install && npm run build` once)
cd contracts && npm test

# or
make test
```

## AI provider configuration

`.env.example` lists every adapter. Model IDs must be IDs the provider actually accepts — do not paste Cursor-internal slugs.

```text
AI_COUNCIL_ENABLED=true
AI_REQUEST_TIMEOUT_SECONDS=25
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o-mini
PERPLEXITY_MODEL=sonar
```

A provider is enabled only when **both** key and model are set. Perplexity and OpenRouter are easy to miss: a key without a model is ignored.

### xAI / Grok (optional)

CoinVigil calls the official xAI Chat Completions API when `XAI_API_KEY` is set. This is the OpenAI-compatible path documented by xAI — CoinVigil does not invent a custom Grok endpoint.

- Endpoint: `POST https://api.x.ai/v1/chat/completions`
- Auth: `Authorization: Bearer $XAI_API_KEY`
- Default model: `grok-4.6` (current xAI catalog flagship for chat / analysis; override with `XAI_MODEL`)
- Base URL override: `XAI_BASE_URL` (default `https://api.x.ai/v1`)
- API keys: [xAI console](https://console.x.ai/)
- Docs: [Chat Completions](https://docs.x.ai/developers/model-capabilities/legacy/chat-completions) and [Models](https://docs.x.ai/developers/models)

If `XAI_API_KEY` is empty, Grok is omitted from the parallel council dispatch and the rest of the stack continues. With no providers configured, per-asset analysis and the homepage AI Market Brief fall back to the deterministic heuristic engine so demo mode keeps working.

### CoinGecko (default market path)

The Markets homepage and `/api/market*` routes use CoinGecko only. A paid CoinMarketCap key is not required and is not wired.

```text
COINGECKO_BASE_URL=https://api.coingecko.com/api/v3
COINGECKO_API_KEY=
```

`COINGECKO_API_KEY` is optional but recommended. With a Demo or Pro key the dashboard can load 1h/24h/7d changes, circulating supply, 7d sparklines, and CoinGecko `/global` without tripping the public pool. Every payload includes `source`: `coingecko` | `cache` | `demo`, plus `last_live_at`, `as_of`, `stale`, and `fallback_reason` (`rate_limited` or `unreachable`). A 6-hour last-live snapshot is reused before the labeled demo fallback. Demo numbers are synthetic stand-ins and are labeled as such. The Markets page polls every 30s and pauses while the tab is hidden.

#### Raising CoinGecko rate limits

CoinGecko's keyless public pool is roughly 10–30 calls/minute. CoinVigil already retries 429/5xx up to three times with a **capped** delay so asset pages stay snappy, then continues later universe pages when one page fails (`partial: true`). Redis plus a 20s in-process universe cache absorb dashboard polling. Asset project links (`GET /api/assets/{id}/profile`) use the same short TTL plus a 6-hour last-good snapshot and never scrape social networks.

To raise the ceiling:

1. Create a CoinGecko account and a **Demo** API key (free) from [CoinGecko API pricing](https://www.coingecko.com/en/api/pricing). CoinVigil does not require a paid plan.
2. Set `COINGECKO_API_KEY` in `.env` and restart the API. CoinVigil sends `x-cg-demo-api-key` unless `COINGECKO_BASE_URL` contains `pro-api.coingecko.com`, in which case it sends `x-cg-pro-api-key`.
3. Confirm on `/status` and `GET /api/status`: `market.key_configured` is true or false. The key value is never returned. Status does not call CoinGecko.
4. Optional Analyst/Pro: point `COINGECKO_BASE_URL=https://pro-api.coingecko.com/api/v3` and keep the same env var. CoinVigil does not document paid quotas — use CoinGecko's own pricing page.
5. Keep Redis up (`MARKET_CACHE_TTL_SECONDS`, default 30) so the 30s client poll reuses the snapshot instead of stampeding.

If you still see `fallback_reason: rate_limited` and a labeled Demo snapshot, the key is missing, invalid, or the plan is exhausted. CoinVigil will not scrape exchanges or invent pairs to fill the gap. `make doctor` prints `/api/status` once the API is running.

Optional Fear & Greed is fetched from Alternative.me when `FEAR_GREED_URL` is set. If that request fails, the index is omitted — it is never invented.

```text
FEAR_GREED_URL=https://api.alternative.me/fng/?limit=1
```

To enable the AI Market Brief (council/Grok instead of the heuristic):

```text
XAI_API_KEY=your_xai_key
XAI_MODEL=grok-4.6
# or any other council key+model pair in .env.example
```

The brief is clearly labeled AI-generated (or heuristic) and is not financial advice.

xAI also publishes a newer Responses API. CoinVigil uses Chat Completions so Grok shares the same OpenAI-compatible adapter contract as Mistral, DeepSeek, Groq, Perplexity, and OpenRouter.

Optional weighting:

```text
AI_PROVIDER_WEIGHTS_JSON={"openai":1.2,"xai":1.0,"gemini":1.0,"anthropic":1.1}
```

Strong bullish/bearish disagreement can force the final council result to neutral.

## Main API routes

- `GET /health` — process liveness plus dependency notes (`postgres` is `not_provisioned`)
- `GET /api/status` — last observed Live/cache/demo path (no CoinGecko call), Redis, Postgres-not-provisioned, AI adapters configured (never keys), news hosts
- `GET /api/market?limit=50&page=1&sort=market_cap&order=desc&q=` — ranked CoinGecko-tracked snapshot (paginated `/coins/markets`, up to 1,000 by market cap, not every coin worldwide); `partial` is true when later pages were rate-limited; `source`: `coingecko` | `cache` | `demo`
- `GET /api/assets/{coin_id}/tickers` — CoinGecko exchange pairs. Optional `q`, `min_volume`, `sort` (`volume|price|spread|exchange|pair|trust`), `order`. Empty rather than invented when unavailable. Shareable on `/asset/{id}?q=&min_volume=&sort=&order=&page=`.
- `GET /api/assets/{coin_id}/profile` — CoinGecko `/coins/{id}` English description, genesis date, categories, platform contract addresses, and `links` (homepage, whitepaper, explorers, X, Telegram, Discord, Reddit, Facebook, GitHub, forums). Missing fields are omitted; URLs and contracts are never invented or scraped. Chip order is website → explorers → socials → repos.
- `GET /api/compare?ids=bitcoin,ethereum` — up to 3 CoinGecko-tracked assets side-by-side. Missing ids are listed, never invented.
- `GET /api/ai/council/status`
- `GET /api/radar`
- `GET /api/news`

## Token contracts

```bash
cd contracts
npm install
npm run build
npm test
# dry-run only; broadcasting requires CONFIRM_DEPLOY=YES and a local key
# RPC_URL=... EXPECTED_CHAIN_ID=11155111 DEPLOYER_ADDRESS=0x... npm run deploy:factory
```

Factory addresses must be set at **Next.js build time** (`NEXT_PUBLIC_FACTORY_*`). Compose passes those build args from `.env`.

## CI

Pushes and pull requests against `main` run API unit tests (including mocked xAI/Grok wiring), a secret-pattern scan, contract tests, image builds, and a compose smoke test. Live third-party AI calls are not made in public CI.

## Operational notes

- Enabling many AI providers increases cost. Latency is usually the slowest configured provider, up to `AI_REQUEST_TIMEOUT_SECONDS`.
- CoinGecko's keyless pool is roughly 10–30 calls/minute. Prefer `COINGECKO_API_KEY` (see “Raising CoinGecko rate limits” above) and keep Redis up so the dashboard does not stampede the public API. Client refresh reuses the 20s in-process universe cache. `/status` reports `key_configured` without revealing the secret.
- CORS defaults to localhost. Set `CORS_ALLOW_ORIGINS` before exposing the API.

## Product direction

1. Exchange WebSocket ingestion
2. Optional persistence / snapshot history if a database is actually wired
3. On-chain and whale intelligence
4. User accounts, synced watchlists, and alerts
5. Model evaluation and provider routing
6. Production observability and a real deploy path

## Disclaimer

CoinVigil AI is an informational analytics product, not financial advice. Market data, source data, quantitative signals, and AI outputs can be wrong, incomplete, delayed, or contradictory. AI consensus is not a guarantee of future market behavior. Demo market snapshots are synthetic stand-ins used only when CoinGecko is unavailable.
