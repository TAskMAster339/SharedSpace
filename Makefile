.PHONY: dev prod dev-up prod-up dev-down prod-down dev-build prod-build \
        dev-logs prod-logs dev-ps prod-ps dev-restart prod-restart \
        back front check

# ============================================================
# Development
# ============================================================

dev-up:
	docker compose -f docker-compose.dev.yml --env-file .env up -d

dev-down:
	docker compose -f docker-compose.dev.yml down

dev-build:
	docker compose -f docker-compose.dev.yml --env-file .env build

dev-restart: dev-down dev-up

dev-logs:
	docker compose -f docker-compose.dev.yml logs -f

dev-ps:
	docker compose -f docker-compose.dev.yml ps

dev:
	docker compose -f docker-compose.dev.yml --env-file .env up --build -d

# ============================================================
# Production
# ============================================================

prod-up:
	docker compose -f docker-compose.yml --env-file .env up -d

prod-down:
	docker compose -f docker-compose.yml down

prod-build:
	docker compose -f docker-compose.yml --env-file .env build

prod-restart: prod-down prod-up

prod-logs:
	docker compose -f docker-compose.yml logs -f

prod-ps:
	docker compose -f docker-compose.yml ps

prod:
	docker compose -f docker-compose.yml --env-file .env up -d

# ============================================================
# Code Quality
# ============================================================

back:
	cd backend && $(MAKE) fmt && $(MAKE) lint && $(MAKE) swagger && go test ./...

front:
	cd frontend && npx prettier --write ./src

check: back front
