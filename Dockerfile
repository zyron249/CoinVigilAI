# Production image: Next.js + FastAPI behind nginx on $PORT (Render).
# Browser calls are same-origin (/api, /health). Redis is optional via REDIS_URL.

FROM node:22-bookworm-slim AS web-deps
WORKDIR /web
COPY apps/web/package.json apps/web/package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

FROM node:22-bookworm-slim AS web-build
WORKDIR /web
ARG NEXT_PUBLIC_API_URL=same-origin
ARG NEXT_PUBLIC_FACTORY_ETHEREUM
ARG NEXT_PUBLIC_FACTORY_BASE
ARG NEXT_PUBLIC_FACTORY_BSC
ARG NEXT_PUBLIC_FACTORY_POLYGON
ARG NEXT_PUBLIC_FACTORY_ARBITRUM
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_FACTORY_ETHEREUM=$NEXT_PUBLIC_FACTORY_ETHEREUM
ENV NEXT_PUBLIC_FACTORY_BASE=$NEXT_PUBLIC_FACTORY_BASE
ENV NEXT_PUBLIC_FACTORY_BSC=$NEXT_PUBLIC_FACTORY_BSC
ENV NEXT_PUBLIC_FACTORY_POLYGON=$NEXT_PUBLIC_FACTORY_POLYGON
ENV NEXT_PUBLIC_FACTORY_ARBITRUM=$NEXT_PUBLIC_FACTORY_ARBITRUM
COPY --from=web-deps /web/node_modules ./node_modules
COPY apps/web/ ./
RUN npm run build

FROM python:3.12-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
      nginx \
      curl \
      ca-certificates \
      gettext-base \
      xz-utils \
    && curl -fsSL https://nodejs.org/dist/v22.16.0/node-v22.16.0-linux-x64.tar.xz \
      | tar -xJ -C /usr/local --strip-components=1 \
    && rm -rf /var/lib/apt/lists/*

COPY apps/api/requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt && rm /tmp/requirements.txt

WORKDIR /api
COPY apps/api/app ./app

WORKDIR /web
COPY --from=web-build /web/.next/standalone ./
COPY --from=web-build /web/.next/static ./.next/static

COPY deploy/nginx.conf.template /etc/nginx/nginx.conf.template
COPY deploy/start.sh /start.sh
RUN chmod +x /start.sh

ENV NODE_ENV=production
ENV NEXT_PUBLIC_API_URL=same-origin
ENV API_INTERNAL_URL=http://127.0.0.1:8000
ENV PORT=10000
EXPOSE 10000

CMD ["/start.sh"]
