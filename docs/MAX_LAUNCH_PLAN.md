# План работ: MAX-первый запуск + Telegram (двухканальная архитектура)

Дата: 2 сентября 2026. Решение пользователя: **стартуем с MAX, Telegram подключаем
следом** (или параллельно). Документ фиксирует порядок, объём и технические детали.

---

## 1. Почему порядок «MAX → Telegram» валиден (и где подводный камень)

**Аргументы «за» MAX-первый:**
- ЦА уже в MAX: 23,9 млн школьников+родителей в Сферуме; родительские чаты
  школ переводятся в MAX административно (май 2026)
- Конкуренция мини-приложений ≈ 0 — «золотое окно»
- СБП-платежи (маржа ~97%) без риска «двойной интеграции» на старте
- Платформа молодая: анонс «мы в MAX» даёт органический охват (каталоги, прессы)

**Подводный камень (важно понимать):**
- В MAX **нет встроенных платежей типа Stars** — платёжный рельс (ЮKassa + СБП)
  обязателен с первого дня. Это значит: статус самозанятого/ИП и договор с ЮKassa —
  **блокер старта**, не «потом».
- Telegram наоборот: Stars работают из коробки (у нас уже реализовано и
  протестировано), бот уже написан. Telegram-канал технически готов на 90%.

**Вывод**: технически Telegram готовее, но рыночно MAX даёт больше нового.
Правильная последовательность — **параллельная, с общим ядром**: сначала общие
платежи (ЮKassa — нужны обоим), затем MAX-адаптер (новая работа), Telegram
подключается включением существующего кода. Так делаем ровно один раз каждую работу.

---

## 2. Что уже готово в коде (инвентаризация)

| Компонент | Статус | Переиспользование для MAX |
|---|---|---|
| Игровое ядро (taskService, wallet, boss, streak) | ✅ работает | 100% — платформенно-нейтрально |
| MiniApp-фронт (Vite) | ✅ работает | 100% — нужен bootstrap-детект хоста |
| Auth: `telegramAuth.ts` (HMAC «WebAppData») | ✅ | **~95% кода совпадает с MAX-валидацией** (схема идентична, отличие — источник строки) |
| Роуты API | ✅ | 100% |
| Бот Telegram (webhook + deep-link invite_*) | ✅ | MAX-адаптер зеркалит структуру |
| Платежи Stars | ✅ работает | Остаётся для TG; для MAX — ЮKassa (новое) |
| WebSocket (socket.io) | ✅ | Работает на VPS-варианте для обеих платформ |
| Данные: `users.telegram_id bigint unique` | ⚠️ | **Нужна миграция**: MAX-user ID ≠ Telegram ID. См. §4 |

---

## 3. Миграция идентификации (первый кодовый шаг)

Сейчас `users.telegram_id` — единственный внешний идентификатор (unique NOT NULL).
Для двух платформ меняем на нейтральную схему:

```sql
ALTER TABLE users
  ADD COLUMN platform text NOT NULL DEFAULT 'telegram',
  ADD COLUMN platform_user_id text;
-- telegram_id остаётся для обратной совместимости (заполнен у существующих)
-- platform_user_id = строковый ID платформы (tg: 123456 | max: 67890)
CREATE UNIQUE INDEX uq_users_platform ON users(platform, platform_user_id);
```

- `authRoutes /register` принимает `{ platform, platform_user_id, display_name, ... }`
- Семья связывается через invite-код как сейчас — платформы смешиваются свободно
  (мама в MAX, папа в Telegram — одна семья). Это **фича**, не баг.
- notify-адаптеры смотрят на `platform` юзера.

---

## 4. Компоненты MAX-адаптера (конкретика по SDK)

SDK: `@maxhub/max-bot-api` v0.3.0 (grammy-подобный API). Проверено по примерам
официального репо:

### 4.1 Бот (`src/bot/maxBot.ts`)
```ts
import { Bot, Keyboard } from '@maxhub/max-bot-api';
const maxBot = new Bot(process.env.MAX_BOT_TOKEN!);
// Long polling для дева; в проде: bot.start({ mode: 'webhook', options: { domain, port, secret } })
maxBot.on('bot_started', (ctx) => {           // = /start, ctx.startPayload = invite_XXX
  ctx.reply(welcomeText(ctx.startPayload), { attachments: [startKeyboard] });
});
maxBot.on('message_created', (ctx) => { /* команды-сводки */ });
```
- Кнопка MiniApp: `Keyboard.button.openApp('Играть', WEBAPP_URL, contactId?, payload?)`
  (подтверждено в helpers/buttons.ts SDK)
- Уведомления семье: `maxBot.api.sendMessage(chatId, text)` из общего
  notifications.ts (адаптер платформы по `user.platform`)
- Нюанс MAX: бот не пишет первым — все уведомления идут только тем, кто нажал «Старт»

### 4.2 Валидация initData (`src/utils/maxAuth.ts`)
Схема идентична Telegram (HMAC «WebAppData» → secret; подпись sorted pairs через \n).
Отличия: параметры приходят в `#WebAppData=` URL-фрагмента, есть доп-поля ip/chat.
Выносим общий `validateWebAppData(rawParams, token)` — оба адаптера тонкие.
Middleware: заголовок `Authorization: max <initData>` рядом с `tma <initData>`.

### 4.3 Фронт-детект (`src/main.tsx` / bootstrap)
- Telegram: `window.Telegram?.WebApp` (сейчас)
- MAX: `window.WebApp` (script `st.max.ru/js/max-web-app.js`)
- По хосту: валидационная схема для API-заголовка (tma/max), тема MAX UI
  (опционально `@maxhub/max-ui` для системных компонентов), BackButton адаптер
- Deep-link вход: `https://max.ru/<bot>?startapp=invite_XYZ` — рефералка работает

### 4.4 Платежи (общий платёжный сервис `src/services/payments/`)
- `starsPayments` (Telegram, готово) — остаётся
- `yookassaPayments` (новое): создание платежа (redirect + save_payment_method),
  webhook `/api/webhook/yookassa` → активация `family_pro_until`
- Витрина Pro в Лавке: две кнопки — Stars (TG) / СБП (обе платформы)

---

## 5. Организационные шаги (критический путь)

1. **Статус самозанятого** — регистрация онлайн, 0₽, 15 минут (ЛК ФНС / Госуслуги)
2. **Бот MAX**: business.max.ru/self → верификация (Госуслуги/СберБизнес ID) →
   MasterBot /create → ник `familychores_bot` → токен. Модерация 48ч
3. **ЮKassa для самозанятых**: анкета (паспорт+ИНН), договор онлайн, 1-3 дня
4. Карточка бота: лого 500×500, описание ≤200 симв., ссылки соглашение/ПДн/правообладатель/поддержка
5. Лимиты: самозанятый = 2 бота (хватает), приём платежей ≤500k₽/мес картами (годовой НПД-потолок 2.4M₽)

---

## 6. Порядок работ (последовательность коммитов)

| Этап | Объём | Результат |
|---|---|---|
| **M1. Идентификация** | полдня | platform+platform_user_id в БД, register принимает обе платформы |
| **M2. Валидация** | полдня | общий validateWebAppData + maxAuth middleware |
| **M3. ЮKassa** | 1-2 дня | платёжный сервис + webhook + тесты (песочница ЮKassa) |
| **M4. Витрина Pro** | 1 день | UI в Лавке: Pro-карточка, выбор рельса платежа |
| **M5. MAX-бот** | 1 день | maxBot.ts: /start+invite, сводки, уведомления, openApp-кнопка |
| **M6. Фронт-детект** | полдня | bootstrap Telegram|MAX, тема, BackButton |
| **M7. Модерация+деплой** | 48ч ожидания | публикация бота, VPS/Supabase deploy |
| **M8. TG-включение** | полдня | Telegram-бот уже готов — включаем webhook на том же деплое |

Итого: **~5 дней работы**, из которых 2 дня ожидания внешних верификаций.
Telegram при этом ничего не теряет — он подключается тем же деплоем (M8).

---

## 7. Что НЕ делаем в первой итерации MAX

- Биометрия/SecureStorage (BiometricManager) — v2, для защиты покупок
- Блокировка скриншотов (ScreenCapture) — v2
- MAX UI компоненты — наш пиксель-стиль сильнее бренда платформы; вернуться
  только если модерация придерётся
- Шеринг shareMaxContent — сразу после запуска (реферальный витамин, полдня)
- Канал в MAX + автопостинг — маркетинговая активность, после запуска продукта
