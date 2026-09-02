# Исследование существующих проектов и кода для MAX (перед стартом разработки)

Дата: 3 сентября 2026. Цель: изучить всё существующее вокруг MAX Bot API и мини-приложений,
чтобы новая сессия разработки начиналась с проверенных паттернов, а не с нуля.

---

## 1. Официальные репозитории max-messenger (GitHub org)

| Репо | Стак | Что берём |
|---|---|---|
| **max-bot-api-client-ts** (137★, MIT) | TypeScript, grammy-подобный | **Основной SDK для нашего MAX-бота.** Версия 0.3.0, активная разработка (118 коммитов) |
| **max-ui** (64★) | React 18+, TS | Опционально: системные компоненты. Наш пиксель-стиль приоритетнее |
| **max-bot-api-client-go / -python** | Go / Python | Не используем (у нас TS), но полезно для сверки API-контрактов |
| **max-bot-example-todolist** | Go, Apache 2.0 | **Официальное демо**: бот + мини-приление в одном. Образец архитектуры |

SDK скачан и изучен: `$LOCALAPPDATA/Temp/max_study/max-bot-api-client-ts-main/`.

---

## 2. Проверенные паттерны из SDK (изучено по исходникам и examples)

### 2.1 Webhook на нашем Express-сервере (не поднимая второй сервер!)

SDK даёт `bot.webhookCallback(...)` — возвращает `(req, res)`-колбэк, совместимый
с Express через обёртку. Ключевой нюанс из docs/06-webhook.md:

> `webhookCallback` только создаёт обработчик. Он НЕ регистрирует webhook в MAX.
> Регистрация вручную: `bot.api.subscribe(url, secret, ['message_created'])`.

Путь вебхука генерируется стабильно: `/webhook/<sha256(token)>` через
`Webhook.generateTokenRelatedHash(token)`. Регистрация через `bot.api.subscribe(...)`,
очистка старых подписок `Webhook.clearSubscriptions(bot.api, url)`.

**Для нас**: интеграция в server.ts рядом с существующим `/api/webhook/telegram`:

```ts
import { Bot, Webhook } from '@maxhub/max-bot-api';
const maxBot = new Bot(process.env.MAX_BOT_TOKEN!);
const maxHandle = maxBot.webhookCallback({
  domain: process.env.HTTPS_DOMAIN!,
  secret: process.env.MAX_WEBHOOK_SECRET,
});
app.post('/api/webhook/max', (req, res) => maxHandle(req, res));
// при старте: bot.api.subscribe(Webhook.getWebhookUrl(domain, '/api/webhook/max'), secret, [...])
```

### 2.2 События SDK (что ловим)
- `bot_started` — аналог нашего /start; **`ctx.startPayload`** = наш invite_XXX deep-link
- `message_created` — текстовые сообщения/команды
- `message_callback` — inline-кнопки (`ctx.answerOnCallback(...)`)
- Команды: `bot.command('start', ...)`, `bot.hears(...)`, `bot.action(/regex/, ...)`

### 2.3 Клавиатуры
```ts
import { Keyboard } from '@maxhub/max-bot-api';
Keyboard.inlineKeyboard([
  [Keyboard.button.callback('Сдать дело', 'task:done:42'),
   Keyboard.button.openApp('Открыть игру', WEBAPP_URL, undefined, 'from_bot')],
]);
```
`openApp(text, webApp, contactId?, payload?)` — подтверждено в src/helpers/buttons.ts.

### 2.4 Long polling для дева
`bot.start()` без аргументов = polling. Для прод-отладки на локали — удобно
(не нужен туннель). В проде — webhook.

### 2.5 Session/Scenario (есть в SDK!)
- `session()` — персист-состояние между апдейтами (в памяти; для нас — не нужно,
  у нас БД-first)
- `defineScenario()` — конечный автомат диалогов (пример регистрации в
  examples/scenario-bot.ts). Пока НЕ используем: наша регистрация идёт в MiniApp UI.
  Держим в голове для будущих мастер-диалогов в чате.

### 2.6 Rate limit / поведение
- SDK оборачивает `MaxError`; лимит платформы 30 rps; 429 обрабатывается кодом
- Ключ сессии — user_id/chat_id из апдейта

---

## 3. Официальное демо max-bot-example-todolist — архитектурные ориентиры

Go-пример «бот + мини-приление» от самой команды MAX. Что подтверждает:
- Разделение «чат-команды» и «мини-приление» — ровно наша схема
- Список задач + чекбоксы + фильтры в мини-апп: наш TodayTasks — тот же UX-класс
- Приложение создаётся через кнопку open_app в чате бота
- guidelines/ в демо описывают: PostgreSQL (read/write реплики, транзакции),
  graceful shutdown, миграции, фоновые задачи — проверенный production-паттерн команды MAX

---

## 4. Мультиплатформенный подход: что сделали другие

### obabot (Python, Habr апрель 2026)
«Один код — Telegram и MAX»: aiogram-совместимый API, адаптерный слой транслирует
события MAX в aiogram-объекты. `message.platform` = 'telegram'|'max'. FSM/клавиатуры/
фильтры идентичны.

**Перенос паттерна на TS**: мы НЕ берём obabot (Python), но берём его архитектуру:
- **Единый контракт событий** (наш `BotEvent`) с полем `platform`
- **Два тонких адаптера**: telegramBot.ts (уже есть) и maxBot.ts (новый)
- Оба пишут в общее ядро (taskService и т.д.) — ядро не знает о платформах

### max-telegram-bridge-bot (BEARlogin)
Мост TG↔MAX: пересылка сообщений/медиа/редактирований между связанными чатами.
Не наш кейс (у нас не мост, а одно ядро), но подтверждает зрелость API для
двустороннего трафика.

### BotHelp / wamm.chat — SaaS уже поддерживают MAX как канал
Значит интеграция стабильна на уровне индустрии, не только у нас.

---

## 5. Платёжные интеграции в MAX (изучено)

- **ЮKassa имеет ОФИЦИАЛЬНОГО бота для выставления счетов в MAX**
  (yookassa.ru/docs/.../max-bot): счёт создаётся в чате, оплата по ссылке,
  чеки 54-ФЗ автоматом. Значит связка MAX+ЮKassa — первый класс платформы
- **Prodamus**: готовое мини-приложение платежей в MAX (подключение 10к₽ разово)
- **API-путь (наш)**: создаём платёж через ЮKassa API (redirect confirmation,
  save_payment_method для рекуррентности) → вебхук `payment.succeeded`
  (HTTPS, TLS 1.2+, регистрация через ЛК или API) → активация Pro

Кейсы ритейла в MAX (РБК): бот формирует заказ и принимает оплату — паттерн
«мини-приложение = магазин» официально рекомендован платформой.

---

## 6. Мини-приложения MAX: экосистема и требования (сводка)

- Работают **только внутри чат-ботов** (не автономно) — открываются кнопкой open_app
- HTTPS обязателен; хостинг любой (VK Cloud даёт спец-инфраструктуру, но нам
  хватает Cloudflare Pages)
- **HMAC-SHA256 валидация initData обязательна** для модерации
- Диплинки: `https://max.ru/<bot>?startapp=<payload>` (≤512 симв., [A-Za-z0-9_-]);
  `initDataUnsafe.start_param` читается во фронте
- `:share` диплинк — системный шеринг-экран (iOS/Android/веб)
- MAX UI (`@maxhub/max-ui`): React-компоненты, авто-тема light/dark, полиморфные
  asChild-компоненты. Берём выборочно только если модерация потребует нативности
- VK Cloud — спонсированный хостинг мини-приложений MAX (рассмотреть как
  бесплатную альтернативу Pages при близости к VK-экосистеме)

---

## 7. Чего в экосистеме MAX НЕТ (честно)

- Встроенных платежей типа Stars — только внешние агрегаторы (ЮKassa/Prodamus)
- Официального шаблона мини-приложения на React/Vite (только Go-демо todolist)
- 广告ной сети в мини-приложениях (реклама только канальная, бета)
- Каталога мини-приложений с рейтинговыми механиками (вкладка есть, метрик нет)

Это значит: наш MiniApp-фронт — самоделка на 100%, но и конкурентов-шаблонов нет.

---

## 8. Итог исследования → решение по архитектуре

1. **SDK**: `@maxhub/max-bot-api` — берём, grammy-паттерн знаком
2. **Webhook**: `bot.webhookCallback()` на нашем Express + `bot.api.subscribe()`
   при старте (аналог нашего webhookRegistration.ts для Telegram)
3. **Валидация**: схема = Telegram, реализуем общий `validateWebAppData` +
   два middleware (tma / max)
4. **Платежи**: ЮKassa API (redirect + save_payment_method + webhook), общий
   сервис payments/yookassaPayments.ts для обеих платформ
5. **Фронт**: один Vite-билд, bootstrap-детект хоста, MAX Bridge script грузится
   условно; MAX UI не используем в v1
6. **Идентификация**: миграция users.platform + platform_user_id (уникальный индекс)
7. **Образец архитектуры**: официальный todolist-демо подтверждает разделение
   «команды в чате / логика в мини-апп»

Новая сессия разработки стартует с этого документа как карты.
