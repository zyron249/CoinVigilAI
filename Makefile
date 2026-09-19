.PHONY: env setup up down logs api web test test-api test-contracts

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

test-api:
	cd apps/api && python3 -m pytest -q

test-contracts:
	cd contracts && npm test

test: test-api test-contracts
