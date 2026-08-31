# Прод-деплой Family Chores RPG

Чек-лист выката на сервер с доменом и HTTPS. Локальная разработка (npm run dev) эти шаги не требует.

## 0. Предпосылки

- Сервер с публичным **https**-доменом (Telegram принимает вебхуки только на 443/80/88/8443; localhost/http не подходит).
- Docker + Docker Compose.
- Токен бота от @BotFather (`BOT_TOKEN`).

## 1. Переменные окружения

Создай `.env` рядом с `docker-compose.yml`:

```bash
BOT_TOKEN=123456:ABC...              # от @BotFather
TELEGRAM_WEBHOOK_SECRET=$(openssl rand -hex 32)   # сгенерируй один раз
VITE_API_URL=https://твой-домен.ру   # публичный https Mini App
DB_PASSWORD=<надёжный пароль PG>
```

Что читает код:
- `BOT_TOKEN` — `src/bot/telegramBot.ts` (без него DEMO MODE, бот null).
- `TELEGRAM_WEBHOOK_SECRET` — `src/api/webhookRoutes.ts` (проверка `X-Telegram-Bot-Api-Secret-Token`) и `src/bot/webhookRegistration.ts` (setWebHook secret_token).
- `VITE_API_URL` — URL Mini App в кнопке бота и база вебхука.
- `TELEGRAM_ALLOWED_USERS` — белый список Telegram-ID (пусто = отключен).

## 2. Запуск

```bash
docker compose up -d --build
# Схема БД — ВРУЧНУЮ (безопасно, без автоприменения при старте):
docker compose run --rm app npm run db:push
```

При старте сервер автоматически:
- засеет каталог (items/rewards/pets/achievements), демо-задачи и перенесёт прогресс из памяти **только если целевые таблицы пусты** (идемпотентный backfill);
- создаст уникальный индекс `uq_completions_user_task_day`;
- зарегистрирует Telegram-вебхук (`setWebHook` с `secret_token`) — новый, см. `src/bot/webhookRegistration.ts`.

## 3. Проверка деплоя (5 минут)

```bash
# 1. Health
curl https://твой-домен.ру/api/health

# 2. Вебхук зарегистрирован и Telegram его видит
curl https://api.telegram.org/bot$BOT_TOKEN/getWebhookInfo
# ждём: url = https://твой-домен.ру/api/webhook/telegram,
# last_error_message отсутствует, pending_update_count не растёт

# 3. Ручной апдейт с секретом (подделка без секрета должна дать 403)
curl -X POST https://твой-домен.ру/api/webhook/telegram \
  -H "Content-Type: application/json" \
  -H "X-Telegram-Bot-Api-Secret-Token: $TELEGRAM_WEBHOOK_SECRET" \
  -d '{"update_id":1,"message":{"message_id":1,"from":{"id":69513172,"is_bot":false,"first_name":"Test"},"chat":{"id":69513172,"type":"private"},"date":0,"text":"/start"}}'
# ждём 200; без заголовка секрета — 403

# 4. Бот отвечает в Telegram (/start → кнопка Mini App), Mini App открывается
```

## 4. Ограничения (честно)

- **Один вебхук-URL на бота.** Роут `/api/webhook/stars` (ответ на pre_checkout) недостижим как отдельный URL — Telegram шлёт всё на `/telegram`. Stars-платежи заработают после слияния обработки pre_checkout в `telegramWebhookHandler` (следующий шаг бэклога).
- Вебхук требует валидный сертификат (Let's Encrypt ок); самоподписанный — только с `certificate` в setWebHook.
- `docker compose run --rm app npm run db:push` — только при смене схемы; на каждом деплое не нужен.

## 5. Откат

```bash
docker compose down && git checkout <предыдущий-тег> && docker compose up -d --build
```

Данные — в volume `pgdata`, даун/апдейт контейнеров их не трогает.
