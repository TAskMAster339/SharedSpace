# Компоненты

## Layout-компоненты

### `Layout`
**Назначение:** Базовый shell приложения.

**Что рендерит:**
- `Header` — верхняя навигация
- `Sidebar` — боковое меню (desktop, только для авторизованных)
- `<main>` — контент (children или Outlet для вложенных маршрутов)
- `Footer` — подвал
- `ScrollToTopButton` — кнопка «наверх»
- `ToastContainer` — уведомления

**Где используется:** Оборачивает все маршруты в `App.tsx`.

### `Header`
**Назначение:** Верхняя навигационная панель (sticky).

**Что рендерит:**
- Логотип SharedSpace (ссылка на `/dashboard` или `/`)
- `UserSearch` — поиск пользователей (desktop)
- Переключатель темы (светлая/тёмная)
- Профиль: аватар → дропдаун (Настройки, Выйти)
- Мобильное гамбургер-меню → `MobileNavMenu`
- Для неавторизованных: ссылки «Возможности», «Как это работает», кнопки Войти/Регистрация

**Когда использовать:** Всегда, на каждой странице.

### `Sidebar`
**Назначение:** Боковое меню для авторизованных пользователей (desktop, w-64).

**Что рендерит:**
- Меню: Dashboard, Personal Storage, Shared Directories, Invitations, Favorites, Trash
- Индикаторы: квота публичных ссылок, использование хранилища

**Когда использовать:** Автоматически в Layout для авторизованных.

### `MobileNavMenu`
**Назначение:** Мобильная версия Sidebar (через гамбургер-меню).

**Что рендерит:** Те же пункты меню + индикаторы квот.
**Пропсы:** `onNavigate: () => void`

### `Footer`
**Назначение:** Подвал сайта.
**Что рендерит:** Логотип, копирайт, ссылки (политика, GitHub).

### `DropZoneWrapper`
**Назначение:** Прокси-компонент, подключающий глобальный drag-and-drop.

**Что рендерит:** `GlobalDropZone` вокруг children. Добавляет `onFileUploaded` callback с toast-уведомлениями об успехе/ошибке загрузки.

**Когда использовать:** Оборачивать страницы, где нужна загрузка файлов (Dashboard, Directory, Favorites).

### `GlobalDropZone`
**Назначение:** Глобальная зона drag-and-drop на уровне страницы.

**Функциональность:**
- Определяет целевую директорию из URL или store
- Показывает overlay при перетаскивании файлов
- Загружает файлы через `uploadFilesWithProgress` с прогресс-баром
- Поддерживает автодобавление в избранное на странице `/favorites`
- Вызывает `onUploadStart` / `onUploadEnd` / `onFileUploaded` колбеки

### `ProtectedRoute`
**Назначение:** Guard для авторизованных маршрутов.
**Пропсы:** `children`
**Поведение:** Если не аутентифицирован → редирект на `/login` с сохранением текущего пути в `state`.

### `PublicRoute`
**Назначение:** Guard для страниц логина/регистрации.
**Пропсы:** `children`
**Поведение:** Если аутентифицирован → редирект на `/dashboard`.

### `ScrollToTopButton`
**Назначение:** Кнопка «наверх» (появляется после 300px скролла).

### `SEOHead`
**Назначение:** Управление SEO-мета-тегами.
**Пропсы:** `title`, `description`, `ogImage?`, `canonical?`, `ogType?`

---

## UI-компоненты (библиотека)

### `Button`
**Варианты:** `primary` (синий), `secondary` (серый), `danger` (красный), `ghost` (прозрачный)
**Размеры:** `sm`, `md`, `lg`
**Когда использовать:** Все кликабельные действия.

### `Card` + `CardHeader` + `CardTitle`
**Варианты:** `default` (с границей), `dark` (затемнённый), `empty` (пунктирная граница для пустых состояний)
**Когда использовать:** Группировка контента (виджеты дашборда, панели).

### `Modal`
**Размеры:** `sm`, `md`, `lg`, `xl`
**Функциональность:** Backdrop (клик → закрыть), Escape → закрыть, блокировка скролла body
**Когда использовать:** Все модальные окна.

### `ConfirmModal`
**Варианты:** `danger` (красный), `warning` (жёлтый), `info` (синий)
**Когда использовать:** Подтверждение деструктивных действий (удаление файла, удаление аккаунта).

### `EmptyState`
**Размеры:** `sm`, `md`
**Когда использовать:** Пустые списки (нет файлов, нет результатов поиска).

### `Toast` + `ToastContainer`
**Варианты:** `success`, `error`, `info`, `undo`, `favorite`, `move`
**Особенности:** Прогресс-бар обратного отсчёта, кнопка действия (undo)
**Когда использовать:** Уведомления о результатах операций.

### `Avatar`
**Пропсы:** `username`, `title?`
**Поведение:** Показывает первую букву username на цветном фоне.

### `AvatarStack`
**Пропсы:** `usernames: string[]`, `max?` (default: 4)
**Поведение:** Перекрывающиеся аватарки с "+N" оверфлоу.

### `Badge`
**Когда использовать:** Отображение статуса или роли (viewer, editor, admin).

### `ViewToggle`
**Пропсы:** `viewMode: 'grid' | 'list'`, `onViewModeChange`
**Когда использовать:** Переключение режима просмотра директорий.

### `SearchBar`
**Пропсы:** `value`, `onChange`, `placeholder`
**Когда использовать:** Поиск (внутри `UserSearch`).

### `QuotaIndicator`
**Пропсы:** `icon`, `label`, `used`, `total`, `fullWidth?`
**Когда использовать:** Индикаторы квот (ссылки, хранилище).

### `StorageIndicator`
**Пропсы:** `used: number`, `total: number` (в GB)
**Поведение:** Прогресс-бар + форматирование "X.X ГБ из Y.Y ГБ"
**Когда использовать:** В Sidebar и MobileNavMenu.

### `FileIcon`
**Пропсы:** `type: FileIconType`, `size?` (default 20)
**Типы:** img, pdf, video, audio, text, xlsx, presentation, archive, code, font, file
**Когда использовать:** Везде, где нужна иконка типа файла.

### `FileItem` / `FileGridItem`
**Пропсы:** `id`, `name`, `date`, `size`, `type`, `to`, `isFavorite?`, `hasShareLinks?`, action-колбеки, `onDragStart?`

**Когда использовать:**
- `FileItem` — для списка (list view)
- `FileGridItem` — для сетки (grid view)

### `FolderItem` / `FolderGridItem`
**Пропсы:** `id`, `name`, `to`, `hasShareLinks?`, action-колбеки, `onDrop?`

**Когда использовать:**
- `FolderItem` — для списка
- `FolderGridItem` — для сетки, поддерживает drop target для перемещения файлов

### `ItemActionsMenu`
**Что рендерит:** Меню действий (⋮) с опциями: Download, Convert, Share, Move, Favorite, Delete
**Особенности:** Автопозиционирование (вверх, если нет места вниз), на мобилках — bottom-sheet через portal
**Когда использовать:** Встроено в FileItem, FileGridItem, FolderItem, FolderGridItem.

### `DirectoryCard`
**Пропсы:** `id`, `name`, `role`, `memberCount`, `fileCount`, `memberUsernames`, `to`
**Когда использовать:** На странице `/directories` для отображения общей директории.

### `DirectoryItem`
**Пропсы:** `id`, `name`, `members?`, `to`
**Когда использовать:** В модалке перемещения файла (`MoveFileModal`).

### `DropZone`
**Пропсы:** `onFilesDrop`, `isUploading?`, `uploadProgress?`, `uploadError?`, `multiple?`, `accept?`
**Когда использовать:** Локальная зона загрузки (на странице директории).

### `ShareLinkModal`
**Пропсы:** `itemId`, `itemName`, `itemType: 'file' | 'directory'`, `accessToken`
**Функциональность:**
- Создание ссылки (тип доступа, срок действия, пароль)
- Список существующих ссылок (копирование, редактирование, удаление)
- При достижении лимита — кнопка неактивна

### `EditShareLinkModal`
**Пропсы:** `link`, `accessToken`, `onSaved`
**Функциональность:** Редактирование существующей ссылки (тип, срок, пароль).

### `MoveFileModal`
**Пропсы:** `fileId`, `fileName`, `currentDirectoryId`, `onMoveComplete?`
**Функциональность:**
- Навигация по дереву директорий (личные + общие, где у пользователя есть права на запись)
- Создание новой папки внутри выбранной
- Фильтрация директорий с ролью `viewer` (нельзя перемещать туда файлы)

### `ConvertModal`
**Пропсы:** `fileId`, `fileName`, `mimeType`, `extension`, `onConvertAndDownload`, `onConvertAndSave`
**Функциональность:**
- Выбор целевого формата (из `ALLOWED_CONVERT_FORMATS`)
- Выбор действия: сохранить в директорию или скачать
- Прогресс-бар конвертации

### `UserSearch`
**Пропсы:** `className?`
**Функциональность:**
- Поиск пользователей (debounce 300ms)
- Выбор пользователя → модалка с выбором общей директории → отправка приглашения

### `Link`
**Пропсы:** `variant: 'primary' | 'secondary'`
**Когда использовать:** Везде вместо прямого `<Link>` из react-router-dom.

---

## Hooks

### `useAuth`
Обёртка над `authStore`. Возвращает: `user`, `isAuthenticated`, `firstName`, `lastName`, `login`, `register`, `logout`, `updateProfile`, `changePassword`, `deleteAccount`.

### `useFavorites`
Управление избранным. Возвращает:
- `isFavorite(fileId) → boolean` — O(1) проверка через Set
- `toggleFavorite(fileId) → Promise<boolean>` — добавить/убрать, возвращает новое состояние
- `favorites`, `loadFavorites`, `isLoading`

### `useFileConversion`
Управление конвертацией. Внутренний стейт: `isConverting`, `conversionProgress`, `error`. Методы:
- `convertAndDownload(fileId, format, filename)` — конвертация + XHR-загрузка Blob
- `convertAndSave(fileId, format, filename)` — конвертация + сохранение в директорию

### `useInfiniteScroll`
Параметры: `onLoadMore`, `active`, `threshold` (default 300px)
Возвращает: `sentinelRef` — прикрепить к элементу-триггеру в конце списка.
Поведение: вызывает `onLoadMore` при пересечении sentinel-элемента с вьюпортом + добивка контента если высота < экрана.

### `useSharedDirectories`
Обёртка над `sharedDirectoriesStore`. Возвращает: `sharedDirectories`, `sharedDirectoryIds`, `isShared(id)`, `getUserRole(id)`, `canUpload(id)`.

### `useSidebarMenu`
Возвращает данные для меню: `menuItems` (массив с label, icon, path), `storageUsed`, `storageQuota`, `shareLinksUsed`, `shareLinksQuota`.

### `useTheme`
Управление тёмной/светлой темой. Сохраняет в localStorage, инициализирует из `prefers-color-scheme`. Возвращает: `theme`, `toggleTheme`.

### `useToast`
Управление toast-уведомлениями (Zustand store, используемый как хук). Методы: `showToast(message, variant?, actionLabel?, onAction?)`, `removeToast(id)`.

---

## Связанные страницы

- [Страницы](pages.md)
- [Управление состоянием](state-management.md)
- [Работа с API](api-layer.md)
