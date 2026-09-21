# Deploy CoinVigil AI on Render (`coinvigilai.com`)

CoinVigil is FastAPI (`apps/api`) + Next.js (`apps/web`) + optional Redis. Locally that is three Compose services. **Production on Render is one Docker web service** so users hit a single URL.

```text
https://coinvigilai.com          → Next.js desk
https://coinvigilai.com/api/*    → FastAPI
https://coinvigilai.com/health   → FastAPI liveness (Render health check)
https://coinvigilai.com/docs     → OpenAPI
```

The image (`Dockerfile` at the repo root) runs uvicorn on `127.0.0.1:8000`, Next standalone on `127.0.0.1:3000`, and nginx on `$PORT`. Redis is a separate Render Key Value instance. If Redis is down, markets still work (in-process snapshot, then labeled demo).

This is not Vercel: the product needs the API process, not only a static/SSR frontend.

## What you set vs what stays honest

| Item | Launch requirement |
| --- | --- |
| Render web service from this Dockerfile | Required |
| `CORS_ALLOW_ORIGINS=https://coinvigilai.com,https://www.coinvigilai.com` | Required (also in `render.yaml`) |
| `NEXT_PUBLIC_API_URL=same-origin` | Required — baked at **image build** |
| `COINGECKO_API_KEY` | Optional, recommended (free Demo key). Without it, Live may fall back to a labeled demo snapshot. |
| Redis Key Value | Optional cache. Blueprint provisions it. |
| AI provider keys | Optional. Zero keys → heuristic brief / “models offline”. Never a fake BULLISH 78%. |
| Fear & Greed | Uses Alternative.me when `FEAR_GREED_URL` is set. Omitted when that feed fails. Never invented. |
| Postgres / accounts / newsletter | Not provisioned. Watchlist and alerts stay in the browser. |

Do not commit secrets. `sync: false` keys in `render.yaml` are filled in the Render dashboard.

## Render steps

1. Push this branch (or `main` after merge) to GitHub.
2. In Render: **New → Blueprint** and select `zyron249/CoinVigilAI`, or **New → Web Service** → Docker, root `Dockerfile`.
3. Blueprint creates:
   - **coinvigil** (web, Docker, health `/health`)
   - **coinvigil-redis** (Key Value, internal-only)
4. Use at least the **Standard** instance (this image runs Next + Python + nginx; 512MB Starter/Free can OOM. Free also spins down after idle).
5. Set dashboard env (Blueprint already lists these; paste secrets only):
   - `COINGECKO_API_KEY` — [CoinGecko Demo](https://www.coingecko.com/en/api/pricing)
   - optional `XAI_API_KEY` / `OPENAI_API_KEY` / others from `.env.example`
6. Deploy. Copy the hostname Render assigns, e.g. `coinvigil-xxxx.onrender.com`.
7. Confirm:
   - `https://<service>.onrender.com/health` → `{"status":"ok",...}`
   - `https://<service>.onrender.com/` → CoinVigil desk
   - `https://<service>.onrender.com/api/status` → no secrets, `postgres: not_provisioned`

`NEXT_PUBLIC_*` values (including `same-origin` and any Token Studio factory addresses) are compile-time. Changing them requires a **rebuild**, not just a restart.

## Namecheap DNS for `coinvigilai.com`

Do this **after** the Render service is up and you have added custom domains on that service (**Settings → Custom Domains**): add `coinvigilai.com` and `www.coinvigilai.com`. Render then issues TLS.

Replace `YOUR-SERVICE.onrender.com` with the real Render hostname.

In Namecheap → domain → **Advanced DNS**, remove parking/URL-redirect/`AAAA` records that conflict, then:

| Type | Host | Value | TTL |
| --- | --- | --- | --- |
| **A** | `@` | `216.24.57.1` | 1 min while verifying, then automatic |
| **CNAME** | `www` | `YOUR-SERVICE.onrender.com` | 1 min while verifying |

That A record is [Render’s documented Namecheap apex target](https://render.com/docs/configure-namecheap-dns). Confirm it in the Render custom-domain panel if Render shows a different IP later.

Optional: add `www` → apex URL redirect at Namecheap **only if** you did not add `www` as a Render custom domain. Prefer both hostnames as custom domains so HTTPS is on each.

Wait for Render to mark the domains **Verified** (certificates). DNS can take a few minutes; it is not instant.

## Local production image (optional)

```bash
docker build -t coinvigil:prod .
docker run --rm -p 10000:10000 -e PORT=10000 -e CORS_ALLOW_ORIGINS=http://localhost:10000 coinvigil:prod
# then: curl -fsS http://127.0.0.1:10000/health
```

Compose (`make up`) remains the local three-service path on `:3000` / `:8000`.

## After go-live

- Open `/status` and confirm Live vs cache vs demo, Redis, and `key_configured` without printing secrets.
- If CoinGecko is rate-limited, the UI must stay labeled — do not scrape CMC or invent prices to look “full”.
- Newsletter subscribe on the dashboard does not send email unless a real backend is added later.
