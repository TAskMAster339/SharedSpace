# Управление состоянием

Используется **Zustand v5** — лёгкий стейт-менеджер без boilerplate.

## authStore — аутентификация

**Файл:** `store/authStore.ts`

**Состояние:**
```typescript
{
  user: AuthUser | null;           // профиль пользователя
  accessToken: string | null;       // текущий JWT access token
  isAuthenticated: boolean;         // флаг аутентификации
  isHydrating: boolean;             // true во время инициализации приложения
}
```

**Действия:**

| Действие | Описание |
|----------|----------|
| `login(email, password)` | Вызов API, сохранение токенов (access в store, refresh в cookie), загрузка personalStorageId, сброс favorites |
| `register(data)` | Регистрация → авто-логин |
| `logout()` | Вызов API logout, удаление cookie, сброс store, сброс directoryStore и favoritesStore |
| `hydrate()` | При загрузке приложения: если есть refresh token в cookie → обновить access token, загрузить профиль |
| `refreshUser()` | Обновить профиль с сервера |
| `updateProfile(data)` | Обновить имя/email/username |
| `changePassword(oldPw, newPw)` | Смена пароля (требует refresh token) |
| `deleteAccount()` | Удаление аккаунта (требует refresh token) |

**Токены:**
- **Access token** — хранится в памяти (Zustand)
- **Refresh token** — хранится в cookie (httpOnly отсутствует, но `SameSite=Strict` + `Secure`)

**Глобальные обработчики:** `authStore` регистрирует `refresh` и `onAuthFailure` в `api/client.ts` для автоматического обновления токена при 401.

---

## directoryStore — директории

**Файл:** `store/directoryStore.ts`

**Состояние:**
```typescript
{
  personalStorageId: string;   // ID корневой директории (кэшируется в localStorage)
  isLoading: boolean;
  currentSection: 'personal' | 'shared' | null;
}
```

**Действия:**

| Действие | Описание |
|----------|----------|
| `fetchPersonalStorageId(token)` | Запрос корневой директории, кэш в localStorage |
| `setCurrentSection(section)` | Установка активной секции для Sidebar |
| `reset()` | Сброс состояния |

---

## favoritesStore — избранное

**Файл:** `store/favoritesStore.ts`

**Состояние:**
```typescript
{
  favoriteIds: Set<string>;         // для O(1) проверки
  favorites: FavoriteFile[];
  isLoading: boolean;
  loadedToken: string | null;       // предотвращает повторную загрузку для того же токена
}
```

**Действия:**

| Действие | Описание |
|----------|----------|
| `loadFavorites(token, force?)` | Загрузка избранного с API (Idempotent: повторный вызов с тем же токеном — no-op). Защита от параллельных запросов. |
| `toggleFavorite(token, fileId)` | **Оптимистичное обновление** Set-а → API запрос → откат при ошибке |
| `reset()` | Сброс состояния |

---

## sharedDirectoriesStore — общие директории

**Файл:** `store/sharedDirectoriesStore.ts`

**Состояние:**
```typescript
{
  sharedDirectories: SharedDirectoryWithStats[];
  sharedDirectoryIds: Set<string>;     // Set directory_id для быстрой проверки
  isLoading: boolean;
  loadedToken: string | null;
}
```

**Действия:**

| Действие | Описание |
|----------|----------|
| `loadSharedDirectories(token)` | Idempotent: повторный вызов с тем же токеном — no-op. Защита от параллельных запросов. |
| `reset()` | Сброс состояния |

---

## dragDropStore — drag-and-drop

**Файл:** `store/dragDropStore.ts`

**Состояние:**
```typescript
{
  targetDirectoryId: string | null;   // куда загружать файлы
  onUploadComplete: (() => void) | null;
}
```

**Действия:**

| Действие | Описание |
|----------|----------|
| `setTargetDirectoryId(id)` | Установка целевой директории (вызывается DirectoryPage) |
| `setOnUploadComplete(callback)` | Регистрация колбека после загрузки |
| `triggerUploadComplete()` | Вызов колбека |

---

## useToast — уведомления

**Файл:** `hooks/useToast.ts` (Zustand store)

**Состояние:**
```typescript
{
  toasts: ToastItem[];   // { id, message, variant, actionLabel, onAction, duration }
}
```

**Действия:**

| Действие | Описание |
|----------|----------|
| `showToast(message, variant?, actionLabel?, onAction?)` | Показать уведомление |
| `removeToast(id)` | Закрыть уведомление |

**Варианты:** `success` (зелёный), `error` (красный), `info` (синий), `undo` (красный с кнопкой отмены), `favorite` (жёлтый), `move` (зелёный).

---

## Связанные страницы

- [Компоненты](components.md)
- [Работа с API](api-layer.md)
