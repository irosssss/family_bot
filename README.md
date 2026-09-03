# Family Chores RPG

**Семейная RPG-игра домашних дел: превращает рутинные обязанности в совместное приключение.** Никаких скучных дашбордов — приложение выглядит и играется как ретро-RPG: три сцены (хаб семьи, арена с боссом, гардероб), прокачка, золото, кристаллы, питомцы и маунты.

Платформы: **Telegram Mini App** (готов на ~90%) и **MAX Mini App** (приоритет запуска — см. [docs/MAX_LAUNCH_PLAN.md](docs/MAX_LAUNCH_PLAN.md)). Mobile-first: 95% пользователей — телефоны 375–390px.

---

## Ролевая модель семьи

- **Родители (папа/мама)** — администраторы семьи: ставят задачи, управляют составом, видят прогресс детей. **Не играют**: без золота, XP, босса и streak. Первый зарегистрированный пользователь автоматически становится родителем-админом.
- **Дети (сын/дочка)** — игроки без ограничений по количеству: выполняют задачи, копят золото, растят питомцев, бьют босса в рейде.

Все `POST/PUT/DELETE /api/users` требуют `actorId` (admin-guard, 403 для не-родителей).

## Игровые механики

| Механика | Как работает |
|---|---|
| Задачи | Ежедневные/разовые домашние дела → золото + XP; perfect day и streak |
| Босс-рейды | Совместный урон всей семьёй; «Мощный удар» только на арене; классы и скиллы |
| Экономика | Золото (игровое) + кристаллы (редкая валюта: заморозка streak 50💎, пополнение через Telegram Stars) |
| Питомцы и маунты | Кормление за золото; `feed_points ≥ 100` → питомец вырастает в маунта; активный компаньон ходит за героем в хабе |
| Гардероб | Покупная одежда/оружие/причёски; экипировка видна во всех сценах (единый `getUnifiedLook`) |
| Визуал | **Единый канон — стиль Habitica** для всех персонажей/предметов/питомцев; эмодзи запрещены везде, только пиксель-арт спрайты и lucide-иконки |

## Стек

- **Frontend**: React 18, Vite 6, Tailwind CSS 4, Motion, Recharts, Socket.IO-client, PWA
- **Backend**: Node.js 20+, Express, Socket.IO, node-cron, Sentry
- **БД**: PostgreSQL 18, Drizzle ORM + postgres.js (источник правды для прогресса; in-memory DEMO-режим без БД для разработки)
- **Бот**: node-telegram-bot-api (вебхуки, Stars-платежи, push); в планах @maxhub/max-bot-api
- **Design system**: `src/components/ui` — PixelButton/PixelCard ≥44px, WCAG 2.1 AA
- **Ассеты**: Habitica sprite pack в `public/assets/game/` (CC-BY-SA, кредит ниже)

## Быстрый старт

Требования: **Node.js 18+**, **PostgreSQL 18** (или Docker), для полной работы — токен бота от [@BotFather](https://t.me/BotFather).

```bash
npm ci
cp .env.example .env        # заполнить токены/БД
```

**Windows:** PostgreSQL запускается двойным кликом `scripts/start-pg.bat` (окно открыто = БД работает; `pg_ctl` из git-bash падает с error 487). Без БД сервер поднимается в DEMO-режиме (in-memory).

```bash
npm run dev                  # http://localhost:3000
curl http://localhost:3000/api/health
```

**Docker (всё сразу: PostgreSQL + приложение):**

```bash
docker compose up -d --build
```

## Скрипты

| Команда | Что делает |
|---|---|
| `npm run dev` | dev-сервер (tsx watch, порт 3000) |
| `npm run build` | Vite-бандл фронтенда + esbuild-бандл сервера в `dist/` |
| `npm start` | прод-сервер (`node dist/server.cjs`) |
| `npm run lint` | `tsc --noEmit` — должен быть 0 ошибок |
| `npm run db:push` | применить схему Drizzle к PostgreSQL |

## Структура проекта

```
server.ts               # тонкий bootstrap: Express + Socket.IO + Vite
src/
  api/                  # Express-роутеры по доменам (state, tasks, shop, users...)
  services/             # бизнес-логика (taskService, streakService, progressService...)
  components/
    scenes/             # 3 сцены: FamilyHubScene, BossRaidScene, WardrobeCustomizationScene
    ui/                 # дизайн-система (PixelButton, PixelCard — >=44px, WCAG AA)
    legacy/             # изолированные старые аватары (НЕ использовать в новом коде)
  bot/                  # Telegram-бот (webhook, accessControl, Stars)
  db/                   # Drizzle schema + миграции
  utils/                # unifiedLook, shopLookMap, haptics...
  config/               # централизованная конфигурация (.env)
public/assets/game/     # только файлы, которые грузит игра (см. docs/ASSET_MANIFEST.md)
docs/                   # документация (карта ниже)
scripts/                # start-pg.bat, вспомогательные скрипты
migrations/             # SQL-миграции
```

## Документация — карта

| Документ | О чём |
|---|---|
| [AGENTS.md](AGENTS.md) | Гайд для агентов/разработчиков: квирки, silent-failure, правила |
| [docs/DEPLOY.md](docs/DEPLOY.md) | Чеклист деплоя (webhook, секреты, прод-режим) |
| [docs/MAX_LAUNCH_PLAN.md](docs/MAX_LAUNCH_PLAN.md) | MAX-first роадмап M1–M8 (идентичность, платежи, модерация) |
| [docs/MONETIZATION_AUDIT.md](docs/MONETIZATION_AUDIT.md) | Модель монетизации (Habitica-подход: косметика, не pay-to-win) |
| [docs/REVENUE_FORECAST.md](docs/REVENUE_FORECAST.md) | Прогноз выручки по бенчмаркам |
| [docs/INFRA_COSTS.md](docs/INFRA_COSTS.md) | Варианты инфраструктуры (0₽ vs mini-VPS) |
| [docs/ASSET_MANIFEST.md](docs/ASSET_MANIFEST.md) | Реестр ассетов: Name/Size/Path/Used-by |
| [docs/archive/](docs/archive/README.md) | Устаревшие решения (не источник правды) |

## Продакшен-режим и безопасность

- TMA-auth включается только при `NODE_ENV=production` + `BOT_TOKEN` (`src/utils/apiAuth.ts`); dev остаётся открытым.
- Подпись initData Telegram проверяется HMAC-SHA256 (`src/utils/telegramAuth.ts`) — та же схема переиспользуется для MAX initData.
- Stars-webhook fail-closed на `TELEGRAM_WEBHOOK_SECRET`; дедупликация charge_id; покупка через `db.transaction` с условным списанием.
- Whitelist бота: `TELEGRAM_ALLOWED_USERS` (пусто = выключен).

## Лицензии

- Код: **MIT** (см. [LICENSE](LICENSE)).
- Ассеты: пиксель-арт из открытого пака **Habitica** (HabitRPG) — лицензия **CC-BY-SA 3.0/4.0**, © HabitRPG Inc. и контрибьюторы; иконки интерфейса — **lucide-react** (ISC). Ассеты LPC/Kenney — CC-BY-SA / CC0. Полная разбивка — `docs/ASSET_MANIFEST.md`.
