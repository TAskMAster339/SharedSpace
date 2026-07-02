# Документация проекта SharedSpace

## Описание

SharedSpace — это файловый хостинг с возможностью организации совместного доступа к файлам и директориям. Проект построен на микросервисной архитектуре: бэкенд на Go, фронтенд на React/TypeScript.

## Быстрый старт

### Через Docker Compose (рекомендуется)

```bash
# 1. Клонировать репозиторий
git clone https://github.com/TAskMAster339/SharedSpace.git && cd SharedSpace

# 2. Настроить переменные окружения
cp .env.example .env

# 3. Запустить все сервисы
docker compose up --build
```

Сервисы будут доступны:
- **Фронтенд**: http://localhost:80
- **API бэкенда**: http://localhost:8080
- **Swagger UI**: http://localhost:8080/swagger
- **MinIO Console**: http://localhost:9001
- **PostgreSQL**: localhost:5432

### Локальный запуск (без Docker)

**Бэкенд:**
```bash
# Требуется: Go 1.26+, PostgreSQL 15+, MinIO, ffmpeg
cd backend
cp .env.example .env  # настроить DATABASE_URL и MINIO_ENDPOINT=localhost:9000
go run cmd/api/main.go
```

**Фронтенд:**
```bash
cd frontend
npm install
REACT_APP_API_BASE_URL=http://localhost:8080/api/v1 npm start
```

## Важные детали для разработчика

### Переменные окружения

| Переменная | Описание | Значение по умолчанию |
|------------|----------|----------------------|
| `DATABASE_URL` | DSN для PostgreSQL | `postgres://...` |
| `MINIO_ENDPOINT` | Внутренний адрес MinIO | `minio:9000` |
| `MINIO_PUBLIC_ENDPOINT` | Публичный адрес MinIO (для presigned URL) | `localhost:9002` |
| `JWT_SECRET` | Секрет для подписи JWT | `change-me-in-production` |
| `JWT_TTL` | Время жизни access токена (сек) | `3600` (1 час) |
| `REFRESH_JWT_TTL` | Время жизни refresh токена (сек) | `2592000` (30 дней) |
| `MINIO_USE_SSL` | Использовать SSL для MinIO (внутренний) | `false` |
| `MINIO_PUBLIC_USE_SSL` | Использовать SSL для публичного MinIO | `false` (локально), `true` (production) |
| `REACT_APP_API_BASE_URL` | Базовый URL API для фронтенда | `http://localhost:8080/api/v1` |

**Внимание:** При локальном запуске `MINIO_PUBLIC_USE_SSL` должен быть `false`, иначе presigned URL будут использовать HTTPS вместо HTTP и браузер заблокирует загрузку. В production — `true`.

При локальном запуске бэкенда (вне Docker) `MINIO_ENDPOINT` должен быть `localhost:9000`. При запуске через Docker Compose — `minio:9000`.

### Команды разработки

```bash
# Бэкенд
cd backend
make lint        # Проверка форматирования (gofmt) + go vet
make fmt         # Авто-форматирование (gofmt + goimports)
make swagger     # Генерация Swagger-документации

# Фронтенд
cd frontend
npm run lint              # ESLint
npm run format:check      # Prettier проверка
npm test                  # Запуск тестов
npm run build             # Сборка для продакшена
```

### CI/CD

В репозитории настроены GitHub Actions:
- [`.github/workflows/backend.yml`](/.github/workflows/backend.yml) — сборка и тестирование бэкенда
- [`.github/workflows/frontend.yml`](/.github/workflows/frontend.yml) — сборка и тестирование фронтенда
- [`.github/workflows/deploy.yml`](/.github/workflows/deploy.yml) — деплой

### Инфраструктура (docker-compose)

| Сервис | Образ | Порт(ы) | Назначение |
|--------|-------|---------|------------|
| `postgres` | postgres:17-alpine | 5432 | База данных |
| `minio` | minio/minio:latest | 9000 (API), 9001 (Console) | S3-совместимое хранилище |
| `nginx-minio` | nginx:alpine | 9002 | Прокси для публичных ссылок MinIO |
| `backend` | сборка из `backend/Dockerfile` | 8080 | Go REST API |
| `frontend` | сборка из `frontend/Dockerfile` | 80 | React SPA через nginx |

## Общие разделы

- **[Тестирование](testing.md)** — как запускать тесты, структура, покрытие (бэкенд + фронтенд)
- **[Безопасность](security.md)** — JWT, bcrypt, CORS, RBAC, хранение токенов
- **[Deployment](deployment.md)** — production-окружение, CI/CD, nginx, systemd
- **[Contributing](CONTRIBUTING.md)** — Git workflow, code style, PR process
- **[Troubleshooting / FAQ](troubleshooting.md)** — частые проблемы и их решения

## Структура документации

- **[Бэкенд](/docs/backend/README.md)** — техническая документация серверной части
  - [Архитектура](/docs/backend/architecture.md) — общая архитектура и компоненты
  - [Сущности БД](/docs/backend/entities.md) — модель данных и схема базы данных
  - [API Эндпоинты](/docs/backend/api-endpoints.md) — полное описание REST API
  - [Аутентификация и JWT](/docs/backend/auth.md) — регистрация, логин, токены
  - [Файловое хранилище](/docs/backend/storage.md) — интеграция с MinIO + полная матрица конвертации
  - [Совместный доступ](/docs/backend/sharing.md) — шаринг директорий, роли, инвайты
  - [Обработка ошибок](/docs/backend/errors.md) — коды ошибок API, типовые ситуации
  - [Миграции БД](/docs/backend/migrations.md) — как создавать, нейминг, существующие миграции
  - [Используемые библиотеки](/docs/backend/README.md#используемые-библиотеки) — список зависимостей Go

- **[Фронтенд](/docs/frontend/README.md)** — техническая документация клиентской части
  - [Страницы](/docs/frontend/pages.md) — описание всех 15 страниц
  - [Компоненты](/docs/frontend/components.md) — каталог UI-компонентов и сценарии использования
  - [Работа с API](/docs/frontend/api-layer.md) — HTTP-клиент, типы, все API-вызовы
  - [Управление состоянием](/docs/frontend/state-management.md) — Zustand-сторинг и хуки
  - [Роутинг](/docs/frontend/routing.md) — маршруты, guard-ы, навигация
  - [Используемые библиотеки](/docs/frontend/README.md#используемые-библиотеки) — список npm-зависимостей

- **[Изображения](/docs/images/)** — диаграммы и схемы
  - [ER-диаграмма](/docs/images/ER.jpg) — схема базы данных
