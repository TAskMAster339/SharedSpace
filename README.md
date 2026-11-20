# SharedSpace

Файловый хостинг с совместным доступом.
Загружайте файлы, делитесь ссылками и работайте в общих папках с командой.

---

![Демонстрация SharedSpace](docs/images/sharedspace.gif)

*Запись сделана с помощью SharedSpace*

---

## Быстрый старт

```bash
git clone https://github.com/TAskMAster339/SharedSpace.git
cd SharedSpace
make dev
```

Для локального запуска нужны Docker с Compose, Make и Python 3.9 или новее. Команда `make dev` подготовит `.env`, соберёт и запустит сервисы.

- **Фронтенд** → http://localhost:3000
- **API** → http://localhost:8080/api/v1
- **Swagger** → http://localhost:8080/swagger/

## Разработка

Подробная документация — в папке [`/docs`](/docs).

**Бэкенд:** `make dev` из корня репозитория. Для запуска без Docker см. [настройку окружения](docs/README.md#локальный-запуск-без-docker).
**Фронтенд:** `cd frontend && npm install && npm start`
**Тесты:** `cd backend && go test ./...`

При запуске через `make dev` ссылки подтверждения регистрации и сброса пароля
появляются в логах бэкенда. Откройте логи перед регистрацией или запросом
сброса пароля:

```bash
make dev-logs
```

Найдите запись `dev mail:` со своим адресом и откройте ссылку из следующей строки.

### Работа с агентами

Порядок разработки описан в [AGENTS.md](AGENTS.md). Проектные инструкции лежат в [.skills/](.skills/README.md) и доступны сразу после клонирования. Правила редактуры `anti-neuroslog` уже включены в [скилл документации](.skills/documentation/SKILL.md).

Для ревью интерфейса можно установить Impeccable в пользовательское окружение. Для Codex подойдёт команда `npx impeccable install --providers=codex --scope=global`. После установки перезапустите Codex и вызовите `$impeccable` для ревью готовых изменений. Если установщик предложит автоматическую проверку при редактировании, её можно пропустить и запускать ревью вручную в конце работы. Для других агентов используйте [официальную инструкцию Impeccable](https://impeccable.style/docs/).

### Локальный редактор DOCX

Запустите `make dev-office` из корня проекта. Команда включает редактирование и запускает Document Server вместе с SharedSpace. Когда `curl -fsS http://localhost:8082/healthcheck` вернёт `true`, откройте [SharedSpace](http://localhost:3000), загрузите `.docx` и выберите «Редактировать». Новая версия появится после завершения общей сессии с правками.

`make dev-ps`, `make dev-logs`, `make dev-restart` и `make dev-down` работают и с редактором. После изменения настроек повторите `make dev-office`, чтобы Docker Compose применил их.

Чтобы подготовить настройки отдельно, выполните `make env` или `python3 scripts/init-env.py`. Скрипт использует `.env.example`, добавляет недостающие локальные настройки и генерирует пароль PostgreSQL, пароль MinIO и два JWT-секрета. Заданные значения сохраняются. Для публичной установки задайте домен, публичные URL и настройки хранилища. При использовании внешнего SMTP заполните параметры провайдера. Храните локальный `.env` вместе с данными dev-окружения. PostgreSQL использует пароль из первого запуска с его томом.

Подробности о публичной установке в [руководстве по деплою](docs/deployment.md#редактор-docx).

## Авторы

— [TAskMAster339](https://github.com/TAskMAster339)
— [rrinnaa](https://github.com/rrinnaa)
— [Daria0w0](https://github.com/Daria0w0)
— [MiniLynx13](https://github.com/MiniLynx13)
