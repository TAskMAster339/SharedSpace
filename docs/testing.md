# Тестирование

## Бэкенд (Go)

### Запуск тестов

```bash
cd backend

# Все тесты
go test ./...

# С флагом verbose
go test -v ./...

# Конкретный пакет
go test -v ./internal/files/...

# С покрытием
go test -cover ./...
go test -coverprofile=coverage.out ./...
go tool cover -html=coverage.out  # визуальный отчёт
```

### CI-запуск

В GitHub Actions (`backend.yml`) тесты запускаются с MinIO в качестве service container. Перед тестами устанавливается ffmpeg.

### Структура тестов

В проекте 18 тестовых файлов, каждый домен тестируется на двух уровнях:

| Уровень | Файл | Что тестирует |
|---------|------|---------------|
| Service | `service_test.go` | Бизнес-логика с моками репозитория, хранилища, tx |
| Handler | `handler_test.go` | HTTP-обработчики (JSON, статусы, заголовки) |

### Домены с тестами

| Домен | Service тесты | Handler тесты | Особенности |
|-------|---------------|---------------|-------------|
| `auth` | ✓ (397 строк) | ✓ (140 строк) | Register, Login, Refresh, Logout, password validation |
| `users` | ✓ (310 строк) | ✓ (276 строк) | GetMe, UpdateMe, ChangePassword, SearchUsers |
| `files` | ✓ (426 строк) | ✓ (196 строк) | Upload, SoftDelete, PermanentDelete, Convert, ExtractExtension |
| `files/convert` | ✓ (203 строки) | — | Конвертация PNG, JPG, WebP, GIF, BMP, TIFF |
| `dirs` | ✓ (962 строки) | ✓ (366 строк) | RootContents, GetContents, CRUD, quota |
| `sharing` | ✓ (816 строк) | ✓ (661 строк) | Invite, Accept, Decline, ChangeRole, RemoveMember |
| `sharelinks` | ✓ (653 строки) | ✓ (501 строка) | Create, Resolve (public/auth/password), CRUD |
| `favorites` | ✓ (279 строк) | ✓ (300 строк) | Add, Remove, List |
| `trash` | — | — | Нет тестов |
| `access` | ✓ (matrix_test.go) | — | Permission matrix (table-driven) |
| `middleware` | — | ✓ (jwt_test.go) | JWT middleware |
| `storage` | Интеграционный (83 строки) | — | MinIO Upload/Get/Delete (пропускается если MinIO недоступен) |

### Паттерны тестирования

#### Service-тесты с моками

```go
// Определение моков в каждом пакете
type mockRepo struct {
    mock.Mock
    // имплементация RepositoryInterface
}

func TestService_Upload(t *testing.T) {
    repo := new(mockRepo)
    storage := new(mockStorage)
    access := new(mockAccess)
    svc := NewService(repo, storage, access)

    repo.On("FindDirByID", mock.Anything, mock.Anything).Return(&directoryRecord{...}, nil)
    // ...
}
```

#### Handler-тесты

```go
func TestHandler_Upload(t *testing.T) {
    // Сборка HTTP запроса
    body := new(bytes.Buffer)
    writer := multipart.NewWriter(body)
    // ... добавление файла
    req := httptest.NewRequest("POST", "/api/v1/files", body)
    req.Header.Set("Content-Type", writer.FormDataContentType())

    // Выполнение
    recorder := httptest.NewRecorder()
    handler.ServeHTTP(recorder, req)

    // Проверка
    assert.Equal(t, http.StatusOK, recorder.Code)
}
```

#### Интеграционные тесты

```go
func TestStorage_Upload(t *testing.T) {
    // Пропускается если MinIO не настроен
    storage := setupStorage(t)
    if storage == nil {
        t.Skip("MinIO not available")
    }
    // ... тест Upload, Get, Delete
}
```

### Table-driven тесты

```go
func TestCan(t *testing.T) {
    tests := []struct {
        name   string
        role   Role
        action Action
        want   bool
    }{
        {"admin can view", RoleAdmin, ActionView, true},
        {"editor can upload", RoleEditor, ActionUpload, true},
        {"viewer cannot delete", RoleViewer, ActionDelete, false},
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            assert.Equal(t, tt.want, Can(tt.role, tt.action))
        })
    }
}
```

## Фронтенд (React)

### Запуск тестов

```bash
cd frontend
npm test                 # интерактивный режим (watch)
npm test -- --watchAll   # все тесты без фильтрации
npx react-scripts test -- --coverage  # с покрытием
```

### Состояние

На данный момент **фронтенд-тесты отсутствуют**. Для добавления тестов используются:

- **@testing-library/react** — рендер компонентов
- **@testing-library/jest-dom** — DOM-матчеры (toBeInTheDocument, toHaveClass)
- **@testing-library/user-event** — симуляция пользовательских действий

### Пример (планируемый)

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button } from './Button';

test('renders button with label', () => {
  render(<Button>Click me</Button>);
  expect(screen.getByText('Click me')).toBeInTheDocument();
});

test('calls onClick handler', async () => {
  const handleClick = jest.fn();
  render(<Button onClick={handleClick}>Click</Button>);
  await userEvent.click(screen.getByText('Click'));
  expect(handleClick).toHaveBeenCalledTimes(1);
});
```
