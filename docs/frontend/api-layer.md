# Работа с API

## HTTP-клиент (`api/client.ts`)

### Базовый клиент

Все запросы проходят через функцию `apiRequest<T>(path, options)`:

```typescript
apiRequest<T>(path, options) → Promise<T>
```

**Параметры:**
- `path` — путь относительно базового URL (например, `/auth/login`)
- `options.token` — access token (добавляется как `Authorization: Bearer`)
- `options` — все стандартные `RequestInit` (method, body, headers)

**Особенности:**
- Базовый URL: `http://localhost:8080/api/v1` (из `REACT_APP_API_BASE_URL`)
- Content-Type по умолчанию: `application/json`
- Возвращает `null` для HTTP 204
- При ошибке парсит тело ответа и бросает `ApiError` с полями `status` и `code`

### Автоматический refresh токенов

При получении **401** клиент автоматически пытается обновить access token:

1. Проверяет, что путь не входит в список исключений (`/auth/login`, `/auth/register`, `/auth/refresh`, `/auth/logout`)
2. Вызывает `refreshHandler()` (зарегистрирован `authStore`)
3. Повторяет исходный запрос с новым токеном
4. Если refresh не удался → вызывает `onAuthFailure()` → разлогинивает пользователя

Дублирующиеся параллельные refresh-запросы объединяются через `refreshPromise`.

### `ApiError`

```typescript
class ApiError extends Error {
  status: number;
  code?: string;  // 'not_found', 'forbidden', 'validation', и т.д.
}
```

---

## API-модули

Каждый файл в `api/` экспортирует типы и функции для конкретного домена.

### `api/auth.ts`
**Типы:** `AuthUser`, `TokenPair`, `RegisterPayload`, `LoginPayload`
**Функции:**
| Функция | Метод | Путь |
|---------|-------|------|
| `register(payload)` | POST | `/auth/register` |
| `login(payload)` | POST | `/auth/login` |
| `refresh(refreshToken)` | POST | `/auth/refresh` |
| `logout(refreshToken)` | POST | `/auth/logout` |

### `api/users.ts`
**Функции:**
| Функция | Метод | Путь |
|---------|-------|------|
| `getMe(accessToken)` | GET | `/users/me` |
| `updateProfile(accessToken, payload)` | PATCH | `/users/me` |
| `changePassword(accessToken, payload)` | PATCH | `/users/me/password` |
| `deleteAccount(accessToken, payload)` | DELETE | `/users/me` |
| `searchUsers(accessToken, query)` | GET | `/users/search?query=` |
| `getUserById(accessToken, userId)` | GET | `/users/{id}` |

### `api/directories.ts`
**Типы:** `Directory`, `DirectoryContents`, `BreadcrumbItem`, `File`
**Функции:**
| Функция | Метод | Путь |
|---------|-------|------|
| `getRootDirectoryContents(token, pagination?)` | GET | `/directories/root/contents` |
| `getDirectoryContents(token, id, pagination?)` | GET | `/directories/{id}/contents` |
| `getDirectoryPath(token, id)` | GET | `/directories/{id}/path` |
| `getDirectoryById(token, id)` | GET | `/directories/{id}` |
| `createDirectory(token, data)` | POST | `/directories` |
| `updateDirectory(token, id, data)` | PATCH | `/directories/{id}` |
| `softDeleteDirectory(token, id)` | DELETE | `/directories/{id}` |
| `restoreDirectory(token, id)` | POST | `/directories/{id}/restore` |
| `permanentDeleteDirectory(token, id)` | DELETE | `/directories/{id}/permanent` |

**Пагинация директорий:**
```typescript
interface DirectoryPaginationParams {
  files_limit?: number;
  files_cursor?: string;
  dirs_limit?: number;
  dirs_cursor?: string;
}
```

### `api/files.ts`
**Типы:** `FileUploadResponse`, `FileMetadata`, `ConvertRequest`, `ConversionResponse`
**Функции:**
| Функция | Метод | Путь |
|---------|-------|------|
| `getRecentFiles(token, limit?)` | GET | `/files/recent` |
| `uploadFilesWithProgress(token, dirId, files, onProgress)` | POST (XHR) | `/files` |
| `getFileMetadata(token, fileId)` | GET | `/files/{id}` |
| `getFileContentUrl(token, fileId)` | GET | `/files/{id}/content` |
| `softDeleteFile(token, fileId)` | DELETE | `/files/{id}` |
| `restoreFile(token, fileId)` | POST | `/files/{id}/restore` |
| `permanentDeleteFile(token, fileId)` | DELETE | `/files/{id}/permanent` |
| `moveFile(token, fileId, parentId)` | PATCH | `/files/{id}` |
| `convertAndSave(token, fileId, format, dirId?)` | POST | `/files/{id}/convert` |
| `convertAndDownload(token, fileId, format)` | POST | `/files/{id}/convert` |

**Загрузка с прогрессом:** Использует XMLHttpRequest для отслеживания прогресса (событие `upload.onprogress`). Content-Type — `multipart/form-data`.

### `api/favorites.ts`
**Функции:**
| Функция | Метод | Путь |
|---------|-------|------|
| `getFavorites(token, pagination?)` | GET | `/files/favorites` |
| `addFavorite(token, fileId)` | POST | `/files/{id}/favorite` |
| `removeFavorite(token, fileId)` | DELETE | `/files/{id}/favorite` |

### `api/sharing.ts`
**Типы:** `SharingRole`, `SharedDirectory`, `Member`, `Invitation`
**Функции:**
| Функция | Метод | Путь |
|---------|-------|------|
| `getSharedWithMeStats(token)` | GET | `/shared/with-me/stats` |
| `getSharedWithMe(token, limit?)` | GET | `/shared/with-me` |
| `getUserSharedDirectories(token, limit?)` | GET | `/shared/directories` |
| `getMembers(token, sharedDirId, limit?)` | GET | `/shared-directories/{id}/members` |
| `inviteToDirectory(token, sharedDirId, username)` | POST | `/shared-directories/{id}/invitations` |
| `getMyInvitations(token, pagination?)` | GET | `/invitations` |
| `acceptInvitation(token, invitationId)` | POST | `/invitations/{id}/accept` |
| `declineInvitation(token, invitationId)` | POST | `/invitations/{id}/decline` |
| `changeMemberRole(token, sharedDirId, userId, role)` | PATCH | `/shared-directories/{id}/members/{userId}` |
| `removeMember(token, sharedDirId, userId)` | DELETE | `/shared-directories/{id}/members/{userId}` |

### `api/sharelinks.ts`
**Типы:** `ShareLink`, `ShareLinkResolveResult`, `CreateShareLinkRequest`
**Функции:**
| Функция | Метод | Путь |
|---------|-------|------|
| `createShareLink(token, fileId, body)` | POST | `/files/{id}/share-links` |
| `listShareLinks(token, fileId)` | GET | `/files/{id}/share-links` |
| `updateShareLink(token, linkId, body)` | PATCH | `/share-links/{id}` |
| `deleteShareLink(token, linkId)` | DELETE | `/share-links/{id}` |
| `resolveShareLink(token, accessToken?, password?)` | GET | `/s/{token}` |
| `createDirectoryShareLink(token, dirId, body)` | POST | `/directories/{id}/share-links` |
| `listDirectoryShareLinks(token, dirId)` | GET | `/directories/{id}/share-links` |
| `resolveDirectoryShareLink(token, params?, accessToken?, password?)` | GET | `/sd/{token}` |

### `api/trash.ts`
**Функции:**
| Функция | Метод | Путь |
|---------|-------|------|
| `getTrashList(token, pagination?)` | GET | `/trash` |
| `clearTrash(token, itemIds)` | DELETE | `/trash` |

---

## Связанные страницы

- [Управление состоянием](state-management.md)
- [Страницы](pages.md)
- [Бэкенд: API Эндпоинты](/docs/backend/api-endpoints.md)
