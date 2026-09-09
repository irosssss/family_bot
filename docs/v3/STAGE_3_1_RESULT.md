# Этап 3.1 — данные и доступ V3

Дата: 2026-09-09. **Завершена ограниченная карточка 3.1.** Основание: отдельное «Продолжай», исходный commit `adfd2421`, ветка `codex/family-life-v3`. Реализация и проверки относятся только к синтетическому фундаменту V3.

Взрослый и ребёнок сохраняются через один Player-контракт. Семейные границы защищены составными внешними ключами, права — отдельными grants. Проверка актуальности actor и нейтральная тестовая запись выполняются в одной транзакции. Оба порядка гонки с отзывом доступа проверены на PostgreSQL.

## Реализованный объём

- `src/v3-server/contracts`: строгий сырой JSON, закрытые версионированные envelope/payload, UUIDv7, revisions, настоящие даты/UTC timestamps, канонические bigint-строки и безопасные typed errors. Повторяющиеся JSON-ключи, включая escaped aliases, отвергаются до потери их исходного представления. Public command registry пуст: тестовая команда не экспортирована как игровая.
- `migrations/v3/0001_foundation.sql`: отдельная schema `rpg_v3`, Account/Family/MemberProfile/Player, grants, bindings и sessions. Роль хранится у Member; Player доступен обоим типам участников. Один Member семьи имеет не более одного Player.
- `foundation/service.ts`: защищённые создание Member с необязательным Player, создание Player существующего Member и чтение roster своей семьи. Account/Family bootstrap находится только в synthetic fixtures. Никакого автоматического назначения grants новому игроку.
- `access/service.ts`: доверенный IdentityAdapter port, выданный конкретным экземпляром сервиса неизменяемый VerifiedActor, повторное чтение canonical context, закрытый реестр проверок, CAS-отзыв binding/session/grant и защищённая собственная projection. Копия actor и поля из команды не дают полномочий.
- Explicit мигратор проверяет manifest/checksum и identity БД. Все pending DDL и migration history применяются одной транзакцией под advisory lock. Обычный импорт и запуск UI не создают таблиц.
- Изолированный runner создаёт собственный PostgreSQL 18.6, передаёт только разрешённое окружение, проверяет соседние контрольные данные и удаляет только свой контейнер после сверки точного ID и двух labels.

Механизм, порядок блокировок и ограничения зафиксированы в [решениях реализации](STAGE_3_1_DESIGN.md). Каждая операция берёт family row lock, затем актуальные записи actor. Ресурс и capability проверяются до callback в той же транзакции. Входные объекты копируются в закрытый frozen payload до первого ожидания.

## Policy, которую проверяет фундамент

| Состояние / операция | Результат |
|---|---|
| Account/Family/Member/Binding/Session не active, Session истекла | Отказ для нового действия и чтения собственного результата, включая старый actor/retry. |
| Player active | Собственные действия разрешены только с соответствующим self grant. |
| Player paused | Нет новых собственных игровых действий; собственная разрешённая projection доступна с `family.read`. |
| Player left/archived | Нет self-effect и self-history. Сохранение записи не предоставляет доступ бывшему игроку. |
| Взрослый active Member с отдельным admin/review grant | Может управлять/проверять даже без Player либо при его паузе/left/archived. |
| Покупка семейного предмета из личного Gold | Eligibility требует взрослого, отдельного grant и active личного Player. Самой покупки/Gold пока нет. |
| Child с ошибочно назначенным adult grant | Детский mode всё равно не проходит adult administration/review. |
| Собственная взрослая отметка | Сервер выбирает decision kind `adult_self_trusted`; это не ручной review и не settlement. |
| Ручной review собственной доли | `SELF_REVIEW_FORBIDDEN` по совпадению Member или Player. |
| Review исторического детского результата | Требует текущего взрослого с grant; не требует второго взрослого или active состояния исторического beneficiary. |
| Запрос реальной награды взрослым | `CHILD_ONLY` даже при наличии Player и self capability. |
| `managed_child` | Не поддержан в 3.1, отвергается без fallback. Реальный вход/общее устройство — этап 3.6. |

## Приёмочная матрица

| ID | Результат и доказательство |
|---|---|
| F31-01 | PASS — AST import audit: 11 серверных TS-модулей, 26 связей; только собственные V3-модули, postgres и нужные Node builtins. Нет legacy/demo/target/bot/cron/telemetry/env bootstrap. |
| F31-02 | PASS — PG создание и чтение adult/child через одинаковые DTO; новый Player не получает grants автоматически. |
| F31-03 | PASS — adult без review grant получает отказ; child self probe проходит; детский режим не наследует adult administration. |
| F31-04 | PASS — лишние actor/capabilities/reward fields и поддельный VerifiedActor отвергаются. Contract tests проверяют отказ до SQL boundary. |
| F31-05 | PASS — другая семья и чужой Player не дают roster/private projection; отказ не содержит данные соседей. |
| F31-06 | PASS — прямой SQL отклоняет cross-family Player/grant/binding/session, включая binding с null Player. |
| F31-07 | PASS — две независимые транзакции создают ровно одного Player; через разные backend PID и `pg_blocking_pids` подтверждено ожидание незавершённой первой вставки, затем вторая получает unique violation. |
| F31-08 | PASS — inactive/expired/mismatched context, active/paused/left/archived Player и отдельные взрослые grants проверены по таблице выше. |
| F31-09 | PASS — собственный manual review запрещён, adult trusted-self и child pending policy имеют разные server decision kinds. |
| F31-10 | PASS — adult real-reward eligibility отвергнута при наличии self grant; child допускается. Без order/reserve. |
| F31-11 | PASS — семья с одним взрослым: child review и adult trusted-self не требуют второго взрослого. |
| F31-12 | PASS — оба порядка guard/revoke на разных PostgreSQL backend PID с наблюдением `pg_blocking_pids`; после commit revoke новых probes нет. Callback failure откатывает marker. |
| F31-13 | PASS — после отзыва binding/session/grant старый actor не получает private projection. Это не ledger receipt/idempotency implementation. |
| F31-14 | PASS — строгие ID/revision/quantity/date/envelope до SQL; validation/permission failure и намеренный unique failure не оставляют частичный Member/Player. |
| F31-15 | PASS — rollback первой миграции на пустой схеме, rollback двух pending migrations, неизменный manifest после failure, два concurrent migrator и checksum/history drift. |
| F31-16 | PASS — explicit config, проверка database/user/cluster/PG, отказ legacy destination; child env без SQL/PG/app secrets, dotenv и NODE_OPTIONS. |
| F31-17 | PASS — точный fixture cleanup сохраняет соседнюю семью; public sentinel неизменен; own container удалён после ID/labels validation. |
| F31-18 | PASS — UI graph только V3/React/lucide, production output ровно HTML/JS/CSS, без server/API/игровой графики; существующее browser-превью проверено на 375 px. |
| F31-19 | PASS — lint, оба V3 typecheck, V3 server build/compiled import smoke, UI build, 26 V3 regression и общий suite. Числа ниже. |
| F31-20 | PASS — отчёт отделяет unit, synthetic PG и отсутствующий реальный auth; следующая игровая реализация не объявлена готовой. |

## Команды и фактические результаты

Из V3 worktree:

```bash
npm run lint
npm run v3:typecheck
npm run v3:server:typecheck
npm run v3:test
npm run v3:server:test
npm run v3:server:test:pg
npm run v3:build
npm run v3:server:build
npm test
```

- Полный V3 foundation suite на PostgreSQL: **177/177 PASS**, три файла: contracts 136, database 12, access 29. Из них 140 unit, 37 opt-in PG. Обычный `v3:server:test` без config пропускает PG; это не эквивалент полного runner.
- Runner сверх suite: первичная migration failure/rollback, concurrent migrators и public sentinel PASS.
- V3 UI/model regression: **26/26 PASS**. Общий `npm test`: **419 PASS, 46 opt-in skipped** (140 новых unit + 26 V3 + 253 прежних теста; пропущены 37 V3 PG и 9 старых opt-in PG).
- Первый общий запуск в песочнице получил `listen EPERM` у существующих HTTP/Socket.IO тестов. Повтор с разрешением локальных портов прошёл; исходники старых тестов не менялись.
- Серверная сборка: четыре ESM entry. Импорт под запретом сети, listen, subprocess, timers, secrets/env и чтения `.env` дал **0 попыток и 0 новых handles**. Compiled `loadV3Migrations()` прочитал упакованный SQL с верным SHA-256, не открывая БД. Сборка копирует проверенные SQL bytes рядом с compiled migrator.
- UI build: только HTML, JS и CSS. AST graph 16 TS/TSX + CSS, 48 связей. Browser-проверка текущего экрана на 375 px: scrollWidth 375, images 0, кнопок/select ниже 44 px нет. UI-код не менялся; полный повтор 15 состояний и настоящий Telegram WebView в 3.1 не выполнялись.

Финальный синтетический запуск после усиления uniqueness regression: run `b6a4d988d3c9c20720b04ecc3904663e`, PostgreSQL `180006`, container `74550ae5af4320acef6be62f1a47796ce5923d0a72dbb12b94d7f74b880a46ab`. Образ закреплён digest в runner; фактический image ID `sha256:b07129cc272f688c98f5b343138a0a52fa45b3d82f50d7a53ff441330624cd2e`. Все 177 тестов, migration checks, sentinel и cleanup PASS. Пароли не записывались в отчёт или файлы.

Локальные вспомогательные evidence: `work/v3-import-audit/evidence.json`, `work/v3-stage31/browser-current.png` (текущая панель 430 px; измерение 375 px выполнено отдельно); сборка `work/v3-server-build`. Эти выходы игнорируются git и воспроизводятся отдельно; config/секреты там не сохраняются.

## Найдено ревью и исправлено

1. Изменение живого input во время ожидания могло перенаправить revoke из авторизованной семьи в другую. Теперь DTO фиксируется до await; PG regression меняет input во время настоящей блокировки и проверяет чужой sentinel.
2. Семейная покупка проходила как administration без active личного Player. Теперь eligibility требует такого Player; paused/absent regression проходят.

Независимое финальное статическое ревью access/foundation — PASS. Оно не подменяет отдельный PG-прогон.

## Чего здесь нет и что дальше

Нет реального Telegram-входа, PIN/recovery, managed-child flow, HTTP API, игровых команд, wallet/XP/ledger, task occurrences, покупок, наград, семейной цели и подключения UI к БД. Fixture credentials не подтверждают личность Telegram. Нейтральные test markers не доказывают settlement, платежи или идемпотентность.

Исходный main `64f16a31` и Folio `a28535ab` сохранены; бот, меню, реальные базы, `.env` и игровые ассеты не менялись. Production retention/вход/import/hosting остаются открытыми до реальных данных.

Следующий отдельный объём — **3.2: occurrences, явные доли, submit/return/resubmit, adult self-policy и child review**, после фиксации календарного окна. Начисления и защита ledger от повторов относятся к 3.3. Графика, сезон и платежи остаются этапами 5–7.
