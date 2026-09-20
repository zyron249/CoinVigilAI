.PHONY: help env setup up down logs api web test test-api test-contracts doctor

help:
	@echo "CoinVigil — stranger quick start"
	@echo "  make up      One command: Docker Compose (API + web + Redis)"
	@echo "  make setup   Local venv + npm install (no Docker)"
	@echo "  make api     Local API on :8000  (activate .venv first)"
	@echo "  make web     Local Next.js on :3000"
	@echo "  make doctor  GET /api/status (stack must already be running)"
	@echo "  make test    API + contract tests"

env:
	@test -f .env || cp .env.example .env

setup: env
	python3 -m venv .venv
	.venv/bin/pip install -r apps/api/requirements.txt -r apps/api/requirements-dev.txt
	cd apps/web && npm install
	cd contracts && npm install

up: env
	docker compose up --build

down:
	docker compose down

logs:
	docker compose logs -f

api: env
	cd apps/api && python3 -m uvicorn app.main:app --reload --port 8000

web:
	cd apps/web && npm run dev

doctor:
	curl -fsS http://127.0.0.1:8000/api/status

test-api:
	cd apps/api && python3 -m pytest -q

test-contracts:
	cd contracts && npm test

test: test-api test-contracts
