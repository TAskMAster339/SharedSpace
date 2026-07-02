# Contribution Guide

## Git Workflow

### Ветки

| Ветка | Назначение |
|-------|------------|
| `main` | Production-ready код |
| `feature/*` | Новые фичи (ветвится от `main`) |
| `fix/*` | Исправления багов |
| `refactor/*` | Рефакторинг |

### Branch naming

```
feature/short-description    → feature/file-conversion
fix/login-error-handling     → fix/login-error-handling
refactor/api-middleware       → refactor/api-middleware
```

### Commit style

Префиксы коммитов (опционально, но желательно):

```
feat:    новая функциональность
fix:     исправление бага
refactor: рефакторинг
test:    добавление/изменение тестов
docs:    документация
chore:   служебные изменения (CI, зависимости)
style:   форматирование, lint
```

Примеры:

```
feat: add file conversion to WebP format
fix: resolve 401 loop on expired refresh token
docs: update API endpoint documentation
test: add service tests for directory soft delete
```

### Процесс

1. Создать ветку от `main`
2. Внести изменения
3. Убедиться, что проходят:
   - `make lint` (backend)
   - `go test ./...` (backend)
   - `npm run lint` (frontend)
   - `npm test` (frontend)
4. Создать Pull Request в `main`
5. Дождаться прохождения CI (GitHub Actions)
6. Смержить после ревью

## Code Style

### Go

- Форматирование: `gofmt -s` (проверка через `make lint`, авто-фикс через `make fmt`)
- Импорты сортируются: стандартная библиотека → внешние → внутренние
- Ошибки оборачиваются через `fmt.Errorf("context: %w", err)` или `apperror.WrapInternal(err)`
- Интерфейсы определяются в пакете-потребителе (consumer), не в пакете-реализации
- Названия файлов: `snake_case.go`

### TypeScript / React

- Форматирование: Prettier (проверка через `npm run format:check`)
- Именование: `camelCase` для переменных/функций, `PascalCase` для компонентов/типов
- Файлы компонентов: `PascalCase.tsx`
- Файлы утилит: `camelCase.ts`
- Стилизация: Tailwind CSS + CSS-переменные (не инлайн-стили)
- Состояние: Zustand (не useState для глобального состояния)

### Архитектурные правила

- **Бэкенд**: каждый домен → `types.go` → `interfaces.go` → `repository.go` → `service.go` → `handler.go`
- **Фронтенд**: компоненты без бизнес-логики, логика в хуках/store, API в `api/`
- **Транзакции**: все операции, изменяющие несколько таблиц, должны быть в транзакции

## Тестирование

### Backend

- Service-тесты с моками (mock repository, storage, tx)
- Handler-тесты с httptest
- Table-driven тесты для матричных проверок (permissions, конвертация)
- `go test ./...` перед пушем

### Frontend

- Тесты компонентов через @testing-library/react
- Snapshot-тесты для стабильных компонентов
- `npm test` перед пушем

## Pull Request

### Что должно быть в PR

1. Описание изменений (что и зачем)
2. Ссылка на issue (если есть)
3. Скриншоты для UI-изменений (если применимо)
4. Checklist:
   - [ ] `make lint` проходит
   - [ ] `go test ./...` проходит
   - [ ] `npm run lint` проходит
   - [ ] Тесты написаны/обновлены
   - [ ] Документация обновлена

## Связанные страницы

- [Тестирование](testing.md)
- [Архитектура бэкенда](backend/architecture.md)
- [Компоненты фронтенда](frontend/components.md)
