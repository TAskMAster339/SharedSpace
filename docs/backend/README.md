# Бэкенд SharedSpace

## Обзор

Бэкенд написан на Go (1.26) и представляет собой REST API сервер. Основные технологии:

- **Роутинг**: chi (go-chi/chi/v5)
- **База данных**: PostgreSQL (pgx/v5)
- **Объектное хранилище**: MinIO (minio-go/v7)
- **Аутентификация**: JWT (HS256, access + refresh токены)
- **Конвертация файлов**: ffmpeg (u2takey/ffmpeg-go)

## Структура проекта

```
backend/
  cmd/api/main.go              — точка входа
  internal/
    access/                    — контроль доступа (RBAC)
    apperror/                  — стандартизированные ошибки API
    auth/                      — аутентификация
    config/                    — конфигурация из .env
    database/                  — подключение к БД и миграции
    dirs/                      — управление директориями
    files/                     — управление файлами
    favorites/                 — избранное
    middleware/                — HTTP-мидлвари
    pagination/                — курсорная пагинация
    server/                    — HTTP-сервер и роутер
    sharelinks/                — публичные ссылки
    sharing/                   — совместный доступ
    storage/                   — клиент MinIO
    trash/                     — корзина
    users/                     — профили пользователей
  migrations/                  — SQL-миграции
```

## Требования

- Go 1.26+
- PostgreSQL 15+
- MinIO
- ffmpeg (для конвертации файлов)

## Запуск

```bash
# Настройка переменных окружения
cp .env.example .env

# Запуск
go run cmd/api/main.go
```

## Важные детали для разработчика

### Конфигурация

Конфигурация загружается через `internal/config/config.go` из переменных окружения (с поддержкой `.env` файла через `godotenv`). Обязательные параметры: `DATABASE_URL` и `JWT_SECRET`.

**Важно про MinIO:** При локальной разработке `MINIO_PUBLIC_USE_SSL` обязательно выставить в `false`. Если оставить `true`, presigned-ссылки будут сгенерированы с `https://`, браузер увидит mixed content и заблокирует загрузку/просмотр файлов. В production — `true`.

### Миграции

SQL-миграции находятся в `backend/migrations/`. Применяются автоматически при запуске сервера через `database.Migrate()` в отсортированном порядке. Отслеживаются в таблице `schema_migrations`.

### Swagger-документация

API описан через аннотации swaggo. Для перегенерации:
```bash
make swagger  # требуется установленный swag: go install github.com/swaggo/swag/cmd/swag@v1.16.6
```
Сгенерированные файлы: `backend/docs/` (docs.go, swagger.json, swagger.yaml)

### Особенности архитектуры

- **Транзакции**: Каждый пакет определяет собственные `beginTxFunc` / `txWrapper` для работы с `pgx.Tx`
- **Контроль доступа**: Централизован в `internal/access/` с рекурсивным CTE для поиска владельца директории
- **Ротация refresh-токенов**: Каждый вызов `/auth/refresh` отзывает старый токен и выдаёт новый
- **Два MinIO bucket**: основной (постоянные файлы) и временный (результаты конвертации с префиксом `conv/`)
- **Очистка**: Фоновый worker каждые 15 минут удаляет временные файлы конвертации старше 30 минут

### Линтинг и форматирование

```bash
make lint  # gofmt + go vet
make fmt   # gofmt -s + goimports
```

## Используемые библиотеки

### Основные зависимости

| Библиотека | Назначение |
|------------|------------|
| `github.com/go-chi/chi/v5` | HTTP-роутер (легковесный, совместимый с net/http) |
| `github.com/jackc/pgx/v5` | Драйвер PostgreSQL (пул соединений, подготовленные запросы) |
| `github.com/minio/minio-go/v7` | S3-совместимый клиент для MinIO |
| `github.com/golang-jwt/jwt/v5` | Создание и валидация JWT-токенов (HS256) |
| `github.com/google/uuid` | Генерация UUID v4 |
| `golang.org/x/crypto` | bcrypt (хэширование паролей) |

### Вспомогательные

| Библиотека | Назначение |
|------------|------------|
| `github.com/joho/godotenv` | Загрузка `.env` файлов |
| `github.com/swaggo/http-swagger/v2` | Swagger UI для go-chi |
| `github.com/swaggo/swag` | Генерация Swagger-спецификации из аннотаций |
| `github.com/HugoSmits86/nativewebp` | Конвертация изображений в WebP (нативный C) |
| `github.com/u2takey/ffmpeg-go` | Обёртка для ffmpeg (конвертация медиафайлов) |
| `golang.org/x/image` | Дополнительные кодеки изображений |
| `golang.org/x/sync` | Синхронизация (errgroup для конкурентных операций) |

### Версия Go: 1.26.3

Полный список: [go.mod](/backend/go.mod)

## Страницы документации

| Раздел | Описание |
|--------|----------|
| [Архитектура](architecture.md) | Общая архитектура, DI, пакеты |
| [Сущности БД](entities.md) | Модели данных, таблицы, связи |
| [API Эндпоинты](api-endpoints.md) | Полный список эндпоинтов |
| [Аутентификация](auth.md) | JWT, регистрация, логин |
| [Файловое хранилище](storage.md) | MinIO, загрузка, конвертация |
| [Совместный доступ](sharing.md) | Шаринг, роли, приглашения |
| [Обработка ошибок](errors.md) | Коды и структура ошибок API |
| [Миграции БД](migrations.md) | Создание и применение миграций |
