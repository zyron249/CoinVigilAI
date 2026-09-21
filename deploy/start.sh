#!/bin/sh
set -eu

PUBLIC_PORT="${PORT:-10000}"
export PUBLIC_PORT
export API_INTERNAL_URL="${API_INTERNAL_URL:-http://127.0.0.1:8000}"
export PYTHONUNBUFFERED=1
export NODE_ENV=production

envsubst '${PUBLIC_PORT}' < /etc/nginx/nginx.conf.template > /etc/nginx/nginx.conf

cd /api
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 &
API_PID=$!

i=0
while [ "$i" -lt 60 ]; do
  if curl -fsS http://127.0.0.1:8000/health >/dev/null; then
    break
  fi
  i=$((i + 1))
  sleep 1
done
if ! curl -fsS http://127.0.0.1:8000/health >/dev/null; then
  echo "API failed to become healthy on :8000" >&2
  kill "$API_PID" 2>/dev/null || true
  exit 1
fi

cd /web
# Render sets PORT for the public listener. Next must stay on the internal 3000.
env PORT=3000 HOSTNAME=127.0.0.1 node server.js &
WEB_PID=$!

i=0
while [ "$i" -lt 60 ]; do
  if curl -fsS http://127.0.0.1:3000/ >/dev/null; then
    break
  fi
  i=$((i + 1))
  sleep 1
done

nginx -g "daemon off;" &
NGINX_PID=$!

echo "CoinVigil listening on :${PUBLIC_PORT} (web :3000, api :8000)"

while kill -0 "$API_PID" 2>/dev/null && kill -0 "$WEB_PID" 2>/dev/null && kill -0 "$NGINX_PID" 2>/dev/null; do
  sleep 2
done

echo "A process exited; shutting down" >&2
kill "$API_PID" "$WEB_PID" "$NGINX_PID" 2>/dev/null || true
wait || true
exit 1
