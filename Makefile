.DEFAULT_GOAL := help

ENV_FILE ?= .env
PYTHON ?= python3
DOCKER_COMPOSE ?= docker compose
DEV_COMPOSE = $(DOCKER_COMPOSE) -f docker-compose.dev.yml --env-file "$(ENV_FILE)"
DEV_OFFICE_COMPOSE = $(DEV_COMPOSE) --profile office
DEV_START = $(DEV_COMPOSE) $(shell $(DEV_COMPOSE) config --environment | sed -n 's/^OFFICE_ENABLED=true$$/--profile office/p')
PROD_COMPOSE = $(DOCKER_COMPOSE) -f docker-compose.yml --env-file "$(ENV_FILE)"

.PHONY: help env dev dev-office dev-up dev-down dev-build dev-restart dev-logs dev-ps \
        prod prod-up prod-down prod-build prod-restart prod-logs prod-ps back front check

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
	$(PROD_COMPOSE) up -d

prod-down:
	$(PROD_COMPOSE) down

prod-build:
	$(PROD_COMPOSE) build

prod-restart: prod-down
	$(MAKE) prod-up

prod-logs:
	$(PROD_COMPOSE) logs -f

prod-ps:
	$(PROD_COMPOSE) ps

back:
	cd backend && $(MAKE) fmt && $(MAKE) lint && $(MAKE) swagger && go test ./...

front:
	cd frontend && npx prettier --write ./src

check: back front
