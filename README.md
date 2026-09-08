# Family Chores RPG

[![CI](https://github.com/irosssss/family_bot/actions/workflows/ci.yml/badge.svg)](https://github.com/irosssss/family_bot/actions/workflows/ci.yml)
[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=111827)](https://react.dev/)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Семейная игра домашних дел для Telegram Mini App: дети выполняют задания и развивают персонажей, взрослые управляют семьёй и подтверждают результаты. Интерфейс рассчитан прежде всего на телефоны 375–390 px.

## Состояние проекта

На 2026-09-08 в репозитории существуют три отдельных части:

| Часть | Что работает | Границы |
| --- | --- | --- |
| Текущая демо — `src/demo/` | Дом, задания и подтверждение, общая копилка, бой, гардероб, питомцы, комнаты, редактор семьи | Тестовая игровая модель; не целевая экономика MVP |
| Legacy — `src/App.tsx`, `server.ts`, `src/api/` | Прежнее приложение, PostgreSQL, бот, магазин, рейды и платежные интеграции | Production-сборка по-прежнему запускает этот клиент; наличие кода не означает готовность нового MVP |
| Новый backend — `src/target/` | Изолированная БД, identity/session/guards, PIN/recovery/приглашения, синтетический HTTP transport; plain_text compiler и локальная публикация/активация | Fixture-среда; production onboarding, игровые механики и интеграция с UI ещё впереди |

G04-A/W12, G04-B/W13 и G04-C/W14 реализованы в ограниченном объёме. Следующий блок — **G04-D/W15: preview точного кандидата контента**. Полный G04 ещё не закрыт. Источник текущего плана: [IMPLEMENTATION_PLAN](docs/IMPLEMENTATION_PLAN.md) и [IMPLEMENTATION_BACKLOG](docs/IMPLEMENTATION_BACKLOG.md).

Целевой продукт описан в [PRODUCT_CONTRACT](docs/PRODUCT_CONTRACT.md). Старые streak, рейды, общая копилка и ассортимент демо не задают целевой MVP автоматически. Родители управляют семьёй и не получают игровые награды за участие в боях.

## Быстрый старт

Для текущей разработки используйте Node.js 24 и npm; локальная демо/legacy используют PostgreSQL 18. Docker нужен для изолированных target-тестов. Основной CI и legacy Dockerfile пока используют Node.js 20, target CI — Node.js 24.

```bash
npm ci
cp .env.example .env
# Заполните параметры своей локальной БД.
npm run dev
```

- [Локальная демо](http://localhost:3000/) открывается по умолчанию в development.
- [Legacy-клиент](http://localhost:3000/?legacy=1) доступен через `?legacy=1`.
- [Healthcheck](http://localhost:3000/api/health).

Схема локальной legacy/demo БД управляется командами `db:push`/`db:migrate`; запускайте их только для выбранной вами БД. На Windows PostgreSQL можно запустить через `scripts/start-pg.bat` в отдельной открытой консоли. Инструкции legacy Docker/HTTPS: [DEPLOY](docs/DEPLOY.md).

Основные параметры описаны в [.env.example](.env.example): `SQL_*` для БД, `BOT_TOKEN` и `TELEGRAM_WEBHOOK_SECRET` для бота, `VITE_API_URL` для Mini App, необязательные `SENTRY_DSN` и `S3_*`. `.env` и секреты не коммитятся.

### Отдельная браузерная и Telegram preview

`src/preview/` использует экраны демо. В обычном браузере создаётся отдельная семья в памяти страницы, сбрасываемая при обновлении. В Telegram сервер проверяет initData и хранит отдельный временный мир для каждого пользователя до перезапуска. Каталоги здесь не редактируются; участники и задания доступны взрослым.

```bash
node --import tsx scripts/build-telegram-preview.ts
```

Сборка находится в `work/telegram-preview/dist`. Запуск сервера с HTTPS-туннелем и безопасной передачей `BOT_TOKEN`: [TELEGRAM_DEVICE_PREVIEW](docs/implementation/TELEGRAM_DEVICE_PREVIEW.md). Постоянной публичной ссылки нет; последний временный URL при повторной проверке вернул DNS error.

## Команды и проверки

| Команда | Назначение |
| --- | --- |
| `npm run dev` | Текущая демо и legacy Express/Vite, порт 3000 |
| `npm run build` / `npm start` | Сборка и запуск legacy production frontend/server |
| `npm run lint` | TypeScript проекта |
| `npm test` | Демо/legacy/preview-регрессия |
| `npm run target:typecheck` | Отдельная проверка типов нового backend |
| `npm run target:build` | Библиотеки и CLI в `work/target-build/` |
| `npm run target:test` | Target-тесты; PG-сценарии без отдельной среды пропускаются |
| `npm run target:test:pg` | Полный target-прогон в собственном временном PostgreSQL с проверкой удаления контейнера |
| `npm run target:content:validate -- <source-dir> <namespace>` | Проверка входного plain_text пакета |
| `npm run target:content:build -- <new-output-dir> <package-id> <version> <namespace> <source-dir>...` | Сборка кандидата; существующий каталог не перезаписывается |
| `npm run db:push` / `npm run db:migrate` | Схема и миграции legacy БД; не target-конвейер |

Пример проверки поставляемого контентного fixture:

```bash
npm run target:content:validate -- tests/fixtures/content/g04-b/base fixture
npm run target:content:build -- /tmp/family-content-candidate fixture:package/root_texts 1.0.0 fixture tests/fixtures/content/g04-b/root tests/fixtures/content/g04-b/base
```

Выходной каталог примера должен отсутствовать. Build создаёт локального кандидата, публикация и активация — отдельные операции. Target использует только явную конфигурацию `RPG_TARGET_*` и собственную тестовую БД, не `SQL_*` legacy. Подробности: [G02 foundation](docs/implementation/G02_FOUNDATION_RESULT.md), [G04 compiler](docs/implementation/G04_COMPILER_RESULT.md), [G04 release](docs/implementation/G04_RELEASE_RESULT.md).

Последняя проверка после исправлений ревью: **499 target-тестов** на PostgreSQL 18.6 и **253 регрессионных теста** прошли; 9 opt-in legacy PG-тестов пропущены. Lint, target:typecheck и target build прошли. [Ручная браузерная проверка](docs/implementation/BROWSER_FUNCTIONAL_QA_2026_09_08.md) покрывает основные игровые цепочки демо при 375 px, но не полную матрицу Telegram WebView.

[GitHub Actions](.github/workflows/ci.yml) запускает lint/tests/legacy build и отдельный target job с typecheck/build, PIN benchmark и временной PostgreSQL. Локальный PASS и результат CI конкретного коммита проверяются отдельно.

## Архитектура

```text
server.ts                  Legacy Express/Socket.IO/Vite и demo API
src/demo/                  Текущие игровые экраны и тестовая доменная модель
src/preview/               Изолированный browser/Telegram preview
src/target/
  access/                  Identity, session, PIN, recovery и lifecycle
  transport/               Синтетический HTTP transport
  content/                 Входные схемы, compiler, storage, release/activation
  db/                      Изолированный клиент и Drizzle-схемы
src/api/, src/services/    Legacy API и бизнес-логика
src/bot/, src/db/          Legacy бот и БД
migrations/target/         Журналируемые target-миграции 0001–0007
scripts/target/            CLI и собственная тестовая среда
public/assets/game/        Runtime-ассеты демо/legacy
tests/target/              Target contracts, compiler, concurrency и PG-тесты
docs/                     Продуктовые контракты, план и результаты этапов
```

## Ассеты

Все текущие изображения — **демо**, не утверждённая финальная графика. В игре используются Habitica, LPC/ULPC и другие наборы; эмодзи в UI и игровых сообщениях запрещены. Целевая art-спецификация: [docs/art/ASSET_BIBLE.md](docs/art/ASSET_BIBLE.md).

Назначение и runtime-потребители перечислены в [ASSET_MANIFEST](docs/ASSET_MANIFEST.md). Перед удалением ассета проверяйте ссылки в `src/` и сборке. Входы генерации не размещаются среди runtime-ассетов.

## Документация

- [Продуктовый контракт](docs/PRODUCT_CONTRACT.md) и [roadmap](docs/PRODUCT_ROADMAP.md).
- [План реализации](docs/IMPLEMENTATION_PLAN.md) и [backlog](docs/IMPLEMENTATION_BACKLOG.md).
- [Конвейер контента](docs/content/CONTENT_PIPELINE.md), [контракты](docs/content/AUTHORING_CONTRACTS.md), [публикация и активация](docs/content/RELEASE_OPERATIONS.md).
- [Физическая схема](docs/data/PHYSICAL_SCHEMA.md) и [протокол доступа](docs/security/ACCESS_PROTOCOL.md).
- [G04-A](docs/implementation/G04_AUTHORING_INPUT_RESULT.md), [G04-B](docs/implementation/G04_COMPILER_RESULT.md), [G04-C](docs/implementation/G04_RELEASE_RESULT.md) — выполненные работы и ограничения.
- [Правила разработки](AGENTS.md), [память проекта](docs/AGENT_MEMORY.md), [legacy deployment](docs/DEPLOY.md).
- [Архив](docs/archive/README.md) — исторические материалы.

## Лицензия

Исходный код — [MIT](LICENSE). Игровые ассеты имеют отдельные условия: Habitica — CC-BY-SA, Lucide — ISC, LPC/ULPC — согласно исходным наборам, отдельные Kenney — CC0. Атрибуцию каждого набора проверяйте перед публикацией.
