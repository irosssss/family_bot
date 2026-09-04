# Family Chores RPG

[![CI](https://github.com/irosssss/family_bot/actions/workflows/ci.yml/badge.svg)](https://github.com/irosssss/family_bot/actions/workflows/ci.yml)
[![Node.js](https://img.shields.io/badge/Node.js-20%2B-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=111827)](https://react.dev/)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Семейная RPG для домашних дел. Обычные обязанности превращаются в совместное приключение: дети выполняют задания, получают золото и опыт, растят питомцев и вместе с семьёй сражаются с боссом.

Проект рассчитан прежде всего на мобильный Telegram Mini App: основные сценарии проверяются на ширине 375–390 px.

## Возможности

- ежедневные, разовые и квестовые задачи;
- семейный прогресс, streak и награды за идеальный день;
- кооперативный рейд с общим боссом и семейным HP;
- классы, навыки, золото, кристаллы, питомцы и маунты;
- магазин, гардероб и единый образ персонажа во всех сценах;
- родительская роль для управления семьёй и задачами;
- Telegram initData HMAC-проверка в production;
- Telegram Stars и webhook с проверкой секрета и дедупликацией платежей;
- PWA-кэширование игровых ассетов.

## Игровая модель

| Роль | Возможности |
| --- | --- |
| Родитель | Администрирует семью, добавляет задачи, управляет участниками и видит прогресс |
| Ребёнок | Выполняет задачи, получает награды, развивает персонажа и участвует в рейде |

Родители не являются игровыми персонажами: игровые действия, золото, streak и урон по боссу предназначены для детей.

## Технологии

- **Frontend:** React 18, Vite, Tailwind CSS 4, Motion, PWA
- **Backend:** Node.js 20+, Express, Socket.IO, node-cron, Sentry
- **Database:** PostgreSQL 18, Drizzle ORM, postgres.js
- **Bot:** node-telegram-bot-api, Telegram Mini App API, Telegram Stars
- **Quality:** TypeScript, Vitest, GitHub Actions
- **Visuals:** Habitica sprite pack, LPC/ULPC assets, Lucide icons

## Быстрый старт

### Локальный запуск

Требования: Node.js 20+, npm и PostgreSQL 18. Telegram bot token нужен для полноценного production-сценария; в development без него доступен demo-режим.

~~~bash
npm ci
cp .env.example .env
# заполнить .env
npm run dev
~~~

Приложение: <http://localhost:3000><br>
Healthcheck: <http://localhost:3000/api/health>

На Windows PostgreSQL запускается двойным кликом по scripts/start-pg.bat в отдельной консоли. Окно PostgreSQL должно оставаться открытым.

### Docker

~~~bash
docker compose up -d --build
docker compose run --rm app npm run db:push
~~~

После запуска приложение доступно на <http://localhost:3000>.

### Переменные окружения

Начните с [.env.example](.env.example). Основные группы настроек:

- BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET — Telegram и webhook;
- SQL_HOST, SQL_USER, SQL_PASSWORD, SQL_DB_NAME — PostgreSQL;
- VITE_API_URL — публичный URL Mini App;
- SENTRY_DSN — необязательный мониторинг;
- S3_* — необязательное внешнее хранилище ассетов.

.env не коммитится. Секреты нельзя добавлять в исходники, README, логи или память агента.

## Команды

| Команда | Назначение |
| --- | --- |
| npm run dev | Vite/Express dev-сервер на порту 3000 |
| npm run build | Production-бандл frontend и server в dist/ |
| npm start | Запуск собранного production-сервера |
| npm run lint | Проверка TypeScript без генерации файлов |
| npm test | Запуск Vitest |
| npm run db:push | Применение актуальной Drizzle-схемы к PostgreSQL |
| npm run db:migrate | Запуск журналируемых SQL-миграций |
| npm run unpack-local | Распаковка локальных asset-архивов |

Перед отправкой изменений в GitHub выполните:

~~~bash
npm run lint
npm test
npm run build
~~~

Эти же проверки запускаются в [GitHub Actions](.github/workflows/ci.yml) на push в main и для pull request.

## Архитектура

~~~text
server.ts                  Express + Socket.IO + Vite + bootstrap
src/
  api/                     HTTP-роутеры по доменам
  services/                Бизнес-логика и persistence helpers
  bot/                     Telegram webhook, notifications, cron
  db/                      Drizzle schema, seed и database access
  components/
    scenes/                Family Hub, Boss Raid, Wardrobe
    ui/                    PixelButton, PixelCard и UI primitives
  utils/                   auth, API transport, assets, haptics, look mapping
  data/                    demo/catalog data
public/assets/game/        Runtime-ассеты игры
tests/                     Unit и service tests
docs/                      Deploy, asset manifest, roadmap и audit notes
~~~

Клиентские запросы к собственному API проходят через src/utils/apiFetch.ts. В production auth guard требует Telegram initData; mutation-роуты проверяют actor и права администратора. Идентификатор пользователя из body запроса сам по себе не считается доказательством доступа.

## Ассеты и визуальный канон

Основной визуальный канон — стиль Habitica. Вспомогательные LPC/ULPC-ассеты используются для отдельных питомцев, иконок магазина и torso items. Эмодзи в интерфейсе и игровых сообщениях не используются.

Полный реестр ассетов с назначением, размерами и runtime-потребителями находится в [docs/ASSET_MANIFEST.md](docs/ASSET_MANIFEST.md). Перед изменением или удалением ассета необходимо проверить ссылки в src/ и production-сборке.

## Текущий статус

Текущий working tree проходит:

- TypeScript lint без ошибок;
- 46 unit/service tests;
- production build frontend и backend;
- локальный healthcheck и ручной проход сцен Дом, Арена и Гардероб.

Перед полноценным production-релизом ещё требуется закрыть технический backlog: довести family isolation до всех маршрутов, сделать миграции самодостаточными для чистой БД, усилить Socket.IO auth/CORS, завершить интеграционные тесты HTTP-роутов и разделить крупный frontend bundle.

План MAX-интеграции и двухканальной архитектуры: [docs/MAX_LAUNCH_PLAN.md](docs/MAX_LAUNCH_PLAN.md).

## Документация

- [AGENTS.md](AGENTS.md) — правила разработки и известные project quirks;
- [docs/DEPLOY.md](docs/DEPLOY.md) — deployment checklist;
- [docs/ASSET_MANIFEST.md](docs/ASSET_MANIFEST.md) — asset registry;
- [docs/AGENT_MEMORY.md](docs/AGENT_MEMORY.md) — краткая память для следующих рабочих сессий;
- [docs/archive/](docs/archive/README.md) — исторические материалы, не источник правды.

## Лицензия

Исходный код распространяется по [MIT License](LICENSE).

Игровые ассеты имеют отдельные условия: Habitica — CC-BY-SA, Lucide — ISC, LPC/ULPC — согласно исходным наборам, отдельные Kenney-ассеты — CC0. Проверяйте атрибуцию перед публичным коммерческим релизом.
