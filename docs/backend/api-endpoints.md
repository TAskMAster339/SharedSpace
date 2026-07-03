# API Эндпоинты

## Публичные (без аутентификации)

| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/health` | Проверка здоровья сервера |
| GET | `/swagger` | Редирект на Swagger UI |
| GET | `/swagger/*` | Swagger UI |
| POST | `/api/v1/auth/register` | Регистрация |
| POST | `/api/v1/auth/login` | Вход |
| POST | `/api/v1/auth/refresh` | Обновление токенов |
| POST | `/api/v1/auth/logout` | Выход (отзыв refresh токена) |
| GET | `/api/v1/s/{token}` | Открыть файл по публичной ссылке |
| GET | `/api/v1/sd/{token}` | Открыть директорию по публичной ссылке |
| GET | `/api/v1/og/share/{token}` | Open Graph мета-теги для файла |
| GET | `/api/v1/og/share/dir/{token}` | Open Graph мета-теги для директории |
| GET | `/api/v1/sitemap.xml` | Sitemap публичных ссылок |

## Пользователи (`/api/v1/users`)

| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/me` | Получить свой профиль |
| PATCH | `/me` | Обновить профиль |
| PATCH | `/me/password` | Сменить пароль |
| DELETE | `/me` | Удалить аккаунт |
| GET | `/search` | Поиск пользователей |
| GET | `/{id}` | Получить пользователя по ID |

## Файлы (`/api/v1/files`)

| Метод | Путь | Описание |
|-------|------|----------|
| POST | `/` | Загрузить файлы (multipart) |
| GET | `/recent` | Недавние файлы (пагинация) |
| GET | `/favorites` | Избранные файлы |
| POST | `/{id}/favorite` | Добавить в избранное |
| DELETE | `/{id}/favorite` | Убрать из избранного |
| GET | `/{id}` | Метаданные файла |
| GET | `/{id}/content` | Получить presigned URL на скачивание |
| POST | `/{id}/rename` | Переименовать файл |
| PATCH | `/{id}` | Переименовать/переместить файл |
| DELETE | `/{id}` | Переместить в корзину |
| POST | `/{id}/restore` | Восстановить из корзины |
| DELETE | `/{id}/permanent` | Удалить навсегда |
| POST | `/{id}/share-links` | Создать публичную ссылку |
| GET | `/{id}/share-links` | Список публичных ссылок |
| POST | `/{id}/convert` | Конвертировать файл |
| GET | `/{id}/conversions` | История конвертаций |

## Директории (`/api/v1/directories`)

| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/root/contents` | Содержимое корневой директории |
| GET | `/{id}/contents` | Содержимое директории (пагинация) |
| GET | `/{id}/path` | Хлебные крошки (breadcrumb) |
| GET | `/{id}` | Информация о директории |
| POST | `/` | Создать директорию |
| POST | `/{id}/rename` | Переименовать директорию |
| PATCH | `/{id}` | Переименовать/переместить |
| DELETE | `/{id}` | Переместить в корзину (каскадно) |
| POST | `/{id}/restore` | Восстановить из корзины |
| DELETE | `/{id}/permanent` | Удалить навсегда |
| POST | `/{id}/share-links` | Создать публичную ссылку на директорию |
| GET | `/{id}/share-links` | Список публичных ссылок |

## Совместный доступ и приглашения

| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/api/v1/shared/with-me` | Директории, к которым у меня есть доступ |
| GET | `/api/v1/shared/with-me/stats` | То же со статистикой |
| GET | `/api/v1/shared/directories` | Мои общие директории |
| GET | `/api/v1/shared-directories/{id}/members` | Участники общей директории |
| PATCH | `/api/v1/shared-directories/{id}/members/{userId}` | Сменить роль |
| DELETE | `/api/v1/shared-directories/{id}/members/{userId}` | Удалить участника |
| POST | `/api/v1/shared-directories/{id}/invitations` | Пригласить пользователя |
| GET | `/api/v1/invitations` | Мои приглашения |
| POST | `/api/v1/invitations/{id}/accept` | Принять приглашение |
| POST | `/api/v1/invitations/{id}/decline` | Отклонить приглашение |
| DELETE | `/api/v1/invitations/{id}` | Отозвать приглашение |

## Управление публичными ссылками

| Метод | Путь | Описание |
|-------|------|----------|
| PATCH | `/api/v1/share-links/{id}` | Обновить ссылку |
| DELETE | `/api/v1/share-links/{id}` | Удалить ссылку |

## Корзина

| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/api/v1/trash` | Содержимое корзины (пагинация) |
| DELETE | `/api/v1/trash` | Очистить корзину (выборочно) |
| DELETE | `/api/v1/trash/all` | Очистить всю корзину безвозвратно |

---

> **Примечание:** Все protected эндпоинты требуют заголовок `Authorization: Bearer <access_token>`.

## Связанные страницы

- [Аутентификация](auth.md)
- [Сущности БД](entities.md)
- [Архитектура](architecture.md)
