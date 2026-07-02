# Архитектура бэкенда

## Общая схема

```
Client (браузер/мобильное приложение)
          |
    HTTP REST API
          |
   chi Router (middleware: CORS, JWT, Logger, Recover)
          |
    Handler Layer (HTTP handlers)
          |
    Service Layer (бизнес-логика)
          |
    Repository Layer (работа с БД)
          |
    PostgreSQL + MinIO
```

## Принципы построения

Каждый домен (auth, users, files, dirs и т.д.) следует паттерну **Clean Architecture**:

1. **`types.go`** — структуры данных, request/response модели
2. **`interfaces.go`** — интерфейсы сервиса и репозитория
3. **`repository.go`** — реализация работы с БД
4. **`service.go`** — бизнес-логика
5. **`handler.go`** — HTTP-обработчики

## Dependency Injection (DI)

Все зависимости передаются через конструкторы. Граф зависимостей собирается в `cmd/api/main.go`:

```
config.Load() → Config
database.NewPool() → pgxpool.Pool
storage.New() → Storage (main + tmp)
auth: Repository → Service → Handler
users: Repository → Service → Handler (зависит от auth.TokenParser)
access: Repository → Checker
dirs: Repository + sharing.Repository + access.Checker + storage → Service → Handler
files: Repository + storage + access.Checker → Service → Handler
sharing: Repository + access.Checker → Service → Handler
favorites: Repository + access.Checker → Service → Handler
trash: Repository + storage → Service → Handler
sharelinks: Repository + storage + access.Checker → Service → Handler
```

## Пакеты

| Пакет | Назначение |
|-------|------------|
| `auth` | Регистрация, логин, JWT-токены |
| `users` | Профили пользователей |
| `files` | Загрузка, метаданные, конвертация |
| `dirs` | Управление директориями |
| `sharing` | Общие директории, участники |
| `sharelinks` | Публичные ссылки |
| `favorites` | Избранные файлы |
| `trash` | Корзина |
| `access` | RBAC контроль доступа |
| `storage` | MinIO клиент |
| `middleware` | HTTP-мидлвари |
| `pagination` | Курсорная пагинация |

## Связанные страницы

- [Сущности БД](entities.md)
- [API Эндпоинты](api-endpoints.md)
- [Аутентификация](auth.md)
