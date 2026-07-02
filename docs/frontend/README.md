# Фронтенд SharedSpace

## Обзор

Фронтенд написан на React 19 + TypeScript и представляет собой SPA-приложение для файлового хостинга с совместным доступом.

### Основные технологии

- **React 19**, TypeScript 4.9
- **Роутинг**: react-router-dom v7
- **Стейт-менеджмент**: Zustand v5
- **Стилизация**: Tailwind CSS v3 с CSS-переменными для темизации
- **UI иконки**: lucide-react
- **SEO**: react-helmet-async

### Структура

```
frontend/src/
  api/           — HTTP-клиент и функции для каждого эндпоинта
  components/    — переиспользуемые компоненты (layout + ui/)
    ui/          — библиотка UI-компонентов (Button, Card, Modal, ...)
  constants/     — константы (форматы конвертации)
  hooks/         — кастомные React-хуки
  pages/         — страницы приложения (15 шт.)
  store/         — Zustand-сторинг (auth, directory, favorites, ...)
  utils/         — утилиты (форматирование, cookies, fileType, ...)
  App.tsx        — корневой компонент с роутингом
  index.tsx      — точка входа
```

## Важные детали для разработчика

### Роутинг и защита маршрутов

Настройка маршрутов — в `App.tsx`. Используются два guard-а:
- `ProtectedRoute` — перенаправляет на `/login` если не аутентифицирован
- `PublicRoute` — перенаправляет на `/dashboard` если аутентифицирован

### Аутентификация

- **Access token** хранится в памяти (Zustand) — теряется при перезагрузке
- **Refresh token** хранится в cookie (`SameSite=Strict`, `Secure` при HTTPS) — восстанавливается при `hydrate()`
- При 401 клиент автоматически вызывает `/auth/refresh` и повторяет запрос (кроме эндпоинтов `/auth/*`)

### Стилизация

- Используются CSS-переменные (см. `styles.css`) с поддержкой светлой и тёмной темы
- Классы-утилиты с префиксом `bg-theme-*`, `text-theme-*` для темизации
- Переключение темы: тоггл класса `dark` на `<html>` через хук `useTheme`

### UI-компоненты

Все компоненты находятся в `components/ui/`. Ключевые:
- `Button` — 4 варианта (primary/secondary/danger/ghost), 3 размера
- `Modal` — 4 размера (sm/md/lg/xl), Escape + backdrop для закрытия
- `Toast` — 6 вариантов (success/error/info/undo/favorite/move) с прогресс-баром
- `ItemActionsMenu` — на десктопе дропдаун, на мобилке bottom-sheet (через portal)

### Drag-and-drop

- Глобальный: `GlobalDropZone` оборачивает страницу, показывает overlay при перетаскивании
- Между папками: `FolderGridItem` / `FolderItem` поддерживают `onDrop` для перемещения файлов
- Прогресс загрузки: через XMLHttpRequest (`uploadFilesWithProgress`)

### Состояние (Zustand)

- `authStore` — hydrate при загрузке, автообновление токена
- `favoritesStore` — оптимистичные обновления (Set для O(1) проверки)
- `sharedDirectoriesStore` — ленивая загрузка с защитой от дублирующихся запросов
- `dragDropStore` — целевая директория + колбек после загрузки

### Пагинация

Курсорная, через URL-параметры. Хук `useInfiniteScroll` с sentinel-элементом для бесконечного скролла.

## Используемые библиотеки

### Core

| Библиотека | Версия | Назначение |
|------------|--------|------------|
| `react` | ^19.2.7 | UI-библиотека |
| `react-dom` | ^19.2.7 | Рендеринг React в DOM |
| `typescript` | ^4.9.5 | Статическая типизация |
| `react-router-dom` | ^7.18.0 | Клиентский роутинг |
| `zustand` | ^5.0.14 | Управление состоянием |

### UI и стилизация

| Библиотека | Назначение |
|------------|------------|
| `tailwindcss` ^3.4 | Utility-first CSS framework |
| `tailwindcss-animate` | Анимации для Tailwind |
| `tailwind-merge` | Умное слияние Tailwind-классов |
| `clsx` | Условные CSS-классы |
| `lucide-react` ^1.21 | Библиотека иконок (~1000+ иконок) |

### Функциональные

| Библиотека | Назначение |
|------------|------------|
| `react-helmet-async` ^3.0 | Управление `<head>` (SEO, OG-теги) |
| `prettier` ^3.8 | Форматирование кода |

### Dev-зависимости

| Библиотека | Назначение |
|------------|------------|
| `react-scripts` 5.0.1 | Сборка (Create React App) |
| `@testing-library/react` ^16 | Тестирование компонентов |
| `@testing-library/jest-dom` ^6 | DOM-матчеры для Jest |
| `autoprefixer` ^10 | Автопрефиксы CSS для Tailwind |
| `postcss` ^8 | Обработчик CSS |

Полный список: [package.json](/frontend/package.json)

## Страницы документации

| Раздел | Описание |
|--------|----------|
| [Страницы](pages.md) | Описание всех 15 страниц |
| [Компоненты](components.md) | Каталог UI-компонентов и сценарии использования |
| [Работа с API](api-layer.md) | API-клиент, обработка 401, типы запросов |
| [Управление состоянием](state-management.md) | Zustand-сторинг, hooks |
| [Роутинг и навигация](routing.md) | Маршруты, guard-ы, Layout |
