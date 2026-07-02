# Роутинг и навигация

## Схема маршрутов

```
/                              → MainPage (публичная)
/share/:token                  → SharePage (публичная)
/share/dir/:token              → SharedDirectoryPage (публичная)

/login                         → LoginPage (только гости)
/register                      → RegisterPage (только гости)

/dashboard                     → DashboardPage (auth + DropZone)
/directories/:id               → DirectoryPage (auth + DropZone)
/favorites                     → FavoritesPage (auth + DropZone)
/settings                      → ProfileSettingsPage (auth)
/directories                   → SharedDirListPage (auth)
/files/:id                     → FileViewPage (auth)
/shared/:id/settings           → SharedSettingsPage (auth)
/invitations                   → InvitationsPage (auth)
/trash                         → TrashPage (auth)

*                              → Error404Page
```

## Защита маршрутов

### `ProtectedRoute`
- **Условие:** `isAuthenticated === true`
- **Редирект:** `/login` с `state.from` для возврата после логина

### `PublicRoute`
- **Условие:** `isAuthenticated === false`
- **Редирект:** `/dashboard`

## Инициализация (hydrate)

При загрузке приложения `App.tsx` вызывает `authStore.hydrate()`, который:
1. Читает refresh token из cookie
2. Если токен есть → обменивает на новую пару через `/auth/refresh`
3. Загружает профиль через `/users/me`
4. Загружает `personalStorageId`
5. Устанавливает `isAuthenticated`

Пока `isHydrating === true`, приложение рендерит `null` (пустой экран).

## DropZone-маршруты

Страницы, обёрнутые в `DropZoneWrapper`, поддерживают глобальный drag-and-drop для загрузки файлов:
- `/dashboard`
- `/directories/:id`
- `/favorites`

## Боковое меню (Sidebar)

Активный пункт определяется по:
1. `currentSection` из `directoryStore` (для Personal Storage / Shared Directories)
2. Текущему pathname для остальных пунктов

## Хлебные крошки (Breadcrumbs)

Строятся на странице `DirectoryPage` через API `/directories/{id}/path`. Для публичных страниц (`/share/dir/:token`) строятся на клиенте на основе переданных параметров.

## Связанные страницы

- [Страницы](pages.md)
- [Компоненты](components.md)
