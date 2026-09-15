.PHONY: up down logs api web

up:
	docker compose up --build

down:
	docker compose down

logs:
	docker compose logs -f

api:
	cd apps/api && uvicorn app.main:app --reload --port 8000

web:
	cd apps/web && npm run dev
