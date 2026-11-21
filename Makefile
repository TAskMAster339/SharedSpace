.DEFAULT_GOAL := help

ENV_FILE ?= .env
PYTHON ?= python3
DOCKER_COMPOSE ?= docker compose
DEV_COMPOSE = $(DOCKER_COMPOSE) -f docker-compose.dev.yml --env-file "$(ENV_FILE)"
DEV_OFFICE_COMPOSE = $(DEV_COMPOSE) --profile office
DEV_START = $(DEV_COMPOSE) $(shell $(DEV_COMPOSE) config --environment | sed -n 's/^OFFICE_ENABLED=true$$/--profile office/p')
PROD_COMPOSE = $(DOCKER_COMPOSE) -f docker-compose.yml --env-file "$(ENV_FILE)"
PROD_OFFICE_PROFILE = $(shell $(PROD_COMPOSE) config --environment | sed -n 's/^PROD_OFFICE_LOCAL=true$$/--profile office/p')
PROD_START = $(PROD_COMPOSE) $(PROD_OFFICE_PROFILE)

.PHONY: help env dev dev-office dev-up dev-down dev-build dev-restart dev-logs dev-ps \
        prod prod-up prod-deploy prod-down prod-build prod-restart prod-logs prod-ps back front check

help:
	@printf '%s\n' \
		'make dev          Собрать и запустить локальный SharedSpace' \
		'make dev-office   Собрать и запустить SharedSpace с офисным редактором' \
		'make env          Создать или дополнить локальный .env' \
		'make dev-ps       Показать состояние локальных сервисов' \
		'make dev-logs     Открыть логи локальных сервисов' \
		'make dev-restart  Перезапустить локальные сервисы' \
		'make dev-down     Остановить локальные сервисы' \
		'make check        Отформатировать код и запустить проверки'

env:
	$(PYTHON) scripts/init-env.py --output "$(ENV_FILE)"

dev: env
	$(DEV_START) up --build -d

dev-office: env
	OFFICE_ENABLED=true $(DEV_OFFICE_COMPOSE) up --build -d

dev-up: env
	$(DEV_START) up -d

dev-build: env
	$(DEV_COMPOSE) build

dev-down:
	$(DEV_OFFICE_COMPOSE) down

dev-restart:
	$(DEV_OFFICE_COMPOSE) restart

dev-logs:
	$(DEV_OFFICE_COMPOSE) logs -f

dev-ps:
	$(DEV_OFFICE_COMPOSE) ps

prod: prod-up

prod-up:
	$(PROD_START) up -d

prod-deploy:
	$(PROD_START) config -q
	@if [ -n "$(PROD_OFFICE_PROFILE)" ]; then \
		$(PROD_START) config --environment | grep -qE '^OFFICE_JWT_SECRET=.{32,}$$' || { echo "Configure OFFICE_JWT_SECRET before deploying ONLYOFFICE"; exit 1; }; \
		test -f nginx/certs/office/onlyoffice.conf && test -f nginx/certs/office/fullchain.pem && test -f nginx/certs/office/privkey.pem || { echo "Install the ONLYOFFICE Nginx configuration and TLS certificate first"; exit 1; }; \
	fi
	$(PROD_START) build backend frontend
	@if [ -n "$(PROD_OFFICE_PROFILE)" ]; then $(PROD_START) up -d --wait --wait-timeout 420 onlyoffice; fi
	$(PROD_START) up -d --no-build --wait --wait-timeout 120 postgres backend frontend
	$(PROD_START) run --rm --no-deps nginx nginx -t
	$(PROD_START) up -d --no-build --no-deps --force-recreate nginx
	$(PROD_START) ps

prod-down:
	$(PROD_COMPOSE) --profile office down

prod-build:
	$(PROD_COMPOSE) build

prod-restart: prod-down
	$(MAKE) prod-up

prod-logs:
	$(PROD_COMPOSE) --profile office logs -f

prod-ps:
	$(PROD_COMPOSE) --profile office ps

back:
	cd backend && $(MAKE) fmt && $(MAKE) lint && $(MAKE) swagger && go test ./...

front:
	cd frontend && npx prettier --write ./src

check: back front
