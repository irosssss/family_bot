# Family Chores RPG — память агента

Последнее обновление: 2026-09-04

Этот файл — короткий continuity-layer для следующих рабочих сессий. Он дополняет
`AGENTS.md`, но не заменяет его. Здесь хранятся только факты, решения и проверенные
команды; секреты из `.env` сюда не попадают.

## Текущее состояние

- Проект: Telegram Mini App «Family Chores RPG».
- Стек: React 18 + Vite + Tailwind; Node/Express + Drizzle + PostgreSQL.
- Рабочая база для аудита: репозиторий был проверен на `ac9d2dc8`; HTML-аудит описывает
  состояние на `42f56f0`, поэтому выводы аудита нужно сверять с текущим кодом.
- Рабочее дерево содержит незакоммиченные исправления B-01/B-03, B-02 и C-01.
  Не откатывать их и не смешивать с чужими изменениями.

## Запуск и проверка

1. Запуск PostgreSQL: открыть `scripts/start-pg.bat` в отдельной реальной консоли.
2. Из корня: `npm run dev`.
3. Healthcheck: `curl http://localhost:3000/api/health`.
4. После правок: `npm run lint`, затем `npm test`, затем ручная проверка через браузер
   на ширине 375px и обычном desktop viewport.

Последний подтверждённый цикл после очистки: lint — 0 ошибок, tests — 46/46, build — успешен;
сервер отвечал на `/api/health` HTTP 200.

Очистка 2026-09-04: удалены неиспользуемые ActivityChart/BossBattle/ChallengeCard/
PlayerCard, useStreak, legacy ULPC renderers, ulpcHairCatalog, старые seed-assets и
schema.sql; удалены неиспользуемые Kenney preview и старые boss sprite/GIF-файлы.
Habitica-каталог, LPC pet assets, Previews и ULPC shop torso assets сохранены, потому
что они имеют runtime-ссылки или нужны для магазина/стартовых данных. Из зависимостей
удалены clsx, tailwind-merge, google-auth-library, recharts и npm-пакет crypto;
`socket.io-client` был ошибочно затронут npm uninstall и восстановлен, затем подтверждён
lint/test/build.

Известные локальные шумы:

- Vite WebSocket error относится к HMR и не блокирует HTTP-приложение.
- Telegram Push возвращал 401, если `BOT_TOKEN` отсутствует или недействителен.
- Первый запуск БД давал transient `ECONNRESET`; повторный запуск миграций/seed прошёл.

## Зафиксированные решения

### Авторизация и гидрация

- Пользователи гидратируются из БД **до** `listen`, поэтому auth guard не зависит от
  демо-памяти после рестарта.
- Production не заливает демо-пользователей.
- Первый реальный пользователь определяется через `count` в БД, создаёт семью и получает
  роль parent/admin. Следующие пользователи требуют invite code.
- `/api/state` всегда синхронизирует `appState.users` с пользователями из БД.
- `toStateUser()` — единая форма преобразования DB user в state user; не обходить её
  вручную, особенно в местах рендера персонажа.

### API-клиент и guards

- Клиентские запросы к собственному API должны идти через `src/utils/apiFetch.ts`: он
  добавляет TMA Authorization и сохраняет явные заголовки/JSON body.
- Все POST/PUT/DELETE `/api/users` требуют `actorId` и admin guard.
- `GET /api/users` остаётся admin-only по контракту проекта.
- Прямые `fetch` допустимы только для внешнего Telegram API, server-side integrations
  и multipart upload, если для него `apiFetch` пока не адаптирован; каждое исключение
  нужно зафиксировать и закрыть отдельной задачей.

### UI и ассеты

- Mobile-first: проверять 375–390px; интерактивные элементы минимум 44px.
- Эмодзи запрещены. Использовать пиксель-арт, lucide-react или игровые ассеты.
- `equipped_body` обязателен в каждом `getUserCharacter()`/render path.
- Не удалять `backgrounds/Previews` и `entities/pets/Previews`: они имеют runtime-ссылки
  и отслеживаются в git.
- ULPC layer order и порядок кадров питомцев см. в `AGENTS.md` и
  `src/utils/ulpcCharacter.ts`.

## Аудит: статус и очередь

Закрыто в текущем working tree:

- B-01: DB hydration выполняется до открытия HTTP-порта.
- B-02: основные App.tsx и user/family/task/shop flows переведены на `apiFetch`.
- B-03: first-user parent определяется по БД, production seed не создаёт fake parents.
- C-01: mutation routes `/api/users` получили actor/admin guard; проверено live 403 для
  запроса без admin actor.

Следующие приоритеты, перед production:

1. Дочистить client raw `fetch`: `ReferralModal.tsx` и `UploadAssets.tsx`; оставить
   документированные внешние/server-side вызовы.
2. Сделать payment dedupe устойчивым к рестарту (DB unique/idempotency, не только memory).
3. Убрать hardcoded `family_id = 1` и довести family isolation до всех маршрутов.
4. Проверить Socket.IO auth, origin/CORS и привязку к family.
5. Добавить Express route/integration tests: текущие 46 тестов не покрывают HTTP-роуты.
6. Повторно прогнать ручной mobile visual pass после backend/client fixes.

## Рабочие паттерны

- **DB-first bootstrap:** migrations → seed/catalog → backfill → user/wallet hydration →
  `listen`; не открывать API до завершения auth-critical hydration.
- **Single transport boundary:** один `apiFetch` для TMA headers, JSON и ошибок; не
  размножать `fetch('/api/...')` по компонентам.
- **Authorization at mutation boundary:** actor identity проверяется на сервере,
  `userId` из body не считается доказательством прав.
- **Pure domain services:** бизнес-правила держать в `src/services`, роуты — тонкие;
  seam-тестировать `taskService`, `streakService`, wallet/payment idempotency.
- **Parallel independent loads:** независимые initial API loads объединять в
  `Promise.all`, но не смешивать с зависимыми auth/hydration шагами.
- **Visual proof:** после UI-изменения проверять реальный браузер, console/network и
  viewport 375px; формулировка «должно работать» без скриншота не считается доказательством.

## Маршрутизация скилов, MCP и плагинов

### Использовать по умолчанию

- `functions.exec_command` — чтение, диагностика, lint/test/build и запуск dev-процессов.
- `apply_patch` — все точечные правки файлов.
- `computer-use:computer-use` / CUA — ручной браузерный проход localhost и визуальная
  проверка; не использовать для чтения исходников, когда достаточно shell.
- `openai-docs` — только вопросы о Codex/OpenAI-продуктах и настройках самого агента.
- `plugin-management` — только если нужна внешняя интеграция/подключение приложения;
  для обычной работы с этим локальным репозиторием плагины не нужны.

### Рекомендованные доменные скилы из AGENTS.md

`vercel-react-best-practices`, `vercel-composition-patterns`, `web-design-guidelines`,
`frontend-design`, `anti-ui-slop`, `tdd`, `diagnosing-bugs`, `grilling`, `handoff`,
`code-review`, `domain-modeling`, `wayfinder`, `teach`, `self-improving-agent`.

На 2026-09-04 эти имена присутствуют как рекомендации Hermes, но не все зарегистрированы
callable в текущем Codex runtime. Перед использованием проверять актуальный каталог, не
тратить время на попытки вызвать отсутствующий skill.

### Что реально найдено локально

- Plugin cache: `openai-api-curated`, `openai-bundled`, `openai-curated-remote`,
  `openai-primary-runtime`, `spritecook`.
- В локальном каталоге system skills есть `imagegen`, `openai-docs`, `plugin-creator`,
  `review-agent`, `skill-creator`, `skill-installer`; наличие папки не гарантирует
  callable-доступность в конкретной сессии.
- Текущий проект не содержит `.openai/hosting.json`, поэтому Sites hosting/building для
  этой локальной задачи не требуется.
- Не устанавливать плагин «на всякий случай». Запрашивать установку только когда есть
  конкретная внешняя система и callable native/MCP-инструмента нет.

## Правила обновления памяти

После каждого существенного шага обновлять только соответствующую строку/секцию:

- что изменилось;
- чем проверено;
- какой следующий риск остался.

Не копировать сюда большие аудиты, логи, исходники или повторяющиеся инструкции из
`AGENTS.md`. Если факт не проверен командой, тестом или браузером — помечать его как
гипотезу либо не записывать.
