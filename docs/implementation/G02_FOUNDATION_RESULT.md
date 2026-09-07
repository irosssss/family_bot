# G02-A — результат реализации технической основы

Версия 1.0, 2026-09-07. **G02-A реализован и проверен в согласованном объёме, готов к приёмке.** Пользователь разрешил [F01–F08](G02_FOUNDATION_CARD.md) сообщением «делай». G02 целиком не завершён: доменные таблицы и составные семейные ограничения остаются в [G02-B](G02_DOMAIN_SCHEMA_CARD.md). Готовность этого каркаса не означает готовность MVP или доступов G03.

Актуализация после этого отчёта: пользователь принял G02-A и разрешил G02-B. [G02-B выполнен](G02_DOMAIN_SCHEMA_RESULT.md), включая исправление симметричной границы Int по PDB. Ниже сохранено доказательство первоначального объёма G02-A; его 36 тестов не являются текущим числом target suite.

## 1. Изменённое поведение

Новый target запускается независимо от старого приложения. Импорт модулей не создаёт DB-клиент, не запускает миграции/seed/бота/cron. HTTP factory обслуживает только `/health` и `/ready`, прочие пути возвращают 404. `/ready` проверяет доступность и идентичность своей временной БД, не полноту будущей игровой схемы.

| Результат | Файлы | Практическая граница |
|---|---|---|
| Явная конфигурация/DB factory | [config](../../src/target/config.ts), [client](../../src/target/db/client.ts) | Только loopback, task run ID, строгое имя БД/роль и server marker. Нет fallback на SQL_* или чтения dotenv. |
| Точные примитивы | [ID](../../src/target/contracts/ids.ts), [числа](../../src/target/contracts/numbers.ts), [ссылки](../../src/target/contracts/references.ts), [ошибки](../../src/target/contracts/errors.ts) | UUIDv7, ContentId, Revision, UInt/Int в пределах signed bigint, закрытые Ref и ключи ошибок с указателем поля. |
| Реестр payload | [payload](../../src/target/contracts/payload.ts) | Явный список обработчиков пары contract_id/schema_version; встроенных игровых handlers нет. Тестовый тип существует только в тестах. |
| Контролируемые миграции | [migrator](../../src/target/db/migrator.ts), [manifest](../../migrations/target/manifest.json), [bootstrap](../../migrations/target/0001_bootstrap.sql) | Полный manifest/checksum перед DB, фиксированное соединение, advisory lock, journal + SQL одной транзакцией на миграцию. Созданы только служебный журнал и схемы rpg/content в disposable DB. |
| Изолированный HTTP | [app](../../src/target/app.ts), [dev CLI](../../scripts/target/dev.ts) | Только минимальные ответы без семейных данных, no-store, loopback; ошибки зависимости не раскрывают детали. |
| Временная среда | [harness](../../scripts/target/test-environment.ts), [preview](../../scripts/target/preview.ts) | Новый контейнер на каждый run; PG data в tmpfs, случайный loopback-порт, свежий пароль только в памяти/окружениях дочерних процессов. Cleanup проверяет exact ID и labels. |
| Отдельные проверки | [Vitest config](../../vitest.target.config.ts), [target tsconfig](../../tsconfig.target.json), [тесты](../../tests/target) | Target suite отделён от старого npm test; typecheck включает scripts/tests. Старый tsconfig их не покрывал. |

Новые зависимости не добавлены; package-lock не менялся этим этапом. Реализация UUIDv7 — небольшой серверный генератор на Node crypto по [RFC 9562 §5.7](https://www.rfc-editor.org/rfc/rfc9562.html#section-5.7), проверенный независимым примером из Appendix A.6. Он не обещает строгого порядка нескольких ID в одной миллисекунде; unique constraints остаются обязательными для будущих таблиц.

## 2. Фактические проверки

| Проверка | Результат | Предел доказательства |
|---|---|---|
| `npm run lint` | PASS, 0 ошибок | Проверка существующего src/server.ts и нового src/target; не исполнение приложения. |
| `npm run target:typecheck` | PASS, 0 ошибок | Дополнительно target scripts/tests/config. |
| `npm run target:test:pg` | **36 passed**: 26 contracts, 3 isolation, 1 HTTP, 6 PostgreSQL | Реальная отдельная PG18, не mocked транзакции. Полные DBT/CPT/VQA будущих этапов этим не закрыты. |
| Существующий `npm test` в минимальном окружении с DEMO_REAL_PG=0 | **218 passed, 9 skipped** | Старые opt-in demo PG-тесты сознательно не подключались к существующей БД. |
| `git diff --check` | PASS | Проверка форматирования tracked diff; новые файлы проверяются также target typecheck/тестами. |
| HTTP preview | Сервер поднят на отдельной PG18; auto-cleanup выполнен, контейнер удалён | CUA не открыл URL из-за `net::ERR_BLOCKED_BY_CLIENT`. Browser PASS/скриншот не заявляются; UI не изменялся. |

Последний полный PG-прогон: run `61dbe31e63c17fddf6a5d366045196c9`, PostgreSQL **18.6**, образ `postgres@sha256:d3e1620b530c944afa6e887d22eb899824da68e19c52024bf98f5220c88a65b2`, локальный image ID `sha256:b07129cc272f688c98f5b343138a0a52fa45b3d82f50d7a53ff441330624cd2e`. Контейнер `0904db51c80e0e0366fb5d22b657189f94e12549dd4cae721630cd9d1107b667` удалён harness; после удаления проверено отсутствие exact ID. Настоящие семейные данные не использовались.

## 3. Соответствие FT01–FT12

Сохранён [лог итогового target-прогона](../../work/g02-a/target-tests.log). После него список контейнеров с меткой владельца G02 пуст. Лог содержит идентификаторы одноразовой среды и результаты проверок, без учётных данных.

| ID | Фактическое доказательство | Статус |
|---|---|---|
| FT01 | Импорт app/client/migrator/CLI при запрещённой фабрике postgres; фабрика не вызвана, транзитивные imports проверены отдельно. | PASS |
| FT02 | Legacy-only/missing config, invalid host/port/user/run/password отвергнуты до подключения. | PASS |
| FT03 | Database marker mismatch блокирует миграции; неверные owner/run/container ID блокируют cleanup. | PASS |
| FT04 | Signed bigint min/max, отрицательные дельты, недопустимые балансы, дроби, экспоненты, overflow, JSON roundtrip. | PASS |
| FT05 | RFC UUID vector, wrong version/variant, ContentId/revision, закрытые Ref, неизвестная пара payload, лишние/missing/accessor поля. | PASS |
| FT06 | Два отдельных клиента одновременно применяют один manifest: результаты 1 и 0, строка эффекта одна. | PASS |
| FT07 | Повтор bootstrap возвращает 0; journal не удваивается. | PASS |
| FT08 | Изменённые байты дают checksum mismatch; переписанный manifest применённой истории даёт history mismatch до следующего SQL. | PASS |
| FT09 | SQL делит на ноль после CREATE/INSERT: новая таблица отсутствует, предыдущая миграция и journal сохранены; lock освобождён. | PASS |
| FT10 | Клиенты закрыты; контейнер удалён и exact ID отсутствует как после успешного, так и после неудачного прогона. | PASS в проверенных завершениях; SIGKILL/отказ Docker не гарантируют cleanup. |
| FT11 | Реальные HTTP-запросы: health 200, ready 200/503, отсутствие game routes, ошибки без private detail. | PASS автоматический; браузер заблокирован инструментом. |
| FT12 | Target typecheck и AST-аудит локальных import/re-export/dynamic import не допускают выхода в legacy/бота/state. | PASS |

## 4. Найденная и исправленная runtime-проблема

Первый PG-прогон дал `connection.begin is not a function`: установленные types postgres.js 3.4.9 объявляют begin() у ReservedSql, а runtime reserve() возвращает объект без него. Проверено в node_modules/postgres/src/index.js и реальным исполнением. Target migrator теперь явно выполняет BEGIN/COMMIT/ROLLBACK на одном reserved-соединении; перед SQL сверяет backend PID с сессией, получившей runner lock. Последующие PG-проверки прошли.

Документация [Postgres.js reserved connections](https://github.com/porsager/postgres#reserving-connections) подтверждает назначение reserve/release; конкретное расхождение типов с runtime установлено по локальной версии. Зависимость не обновлялась ради обхода проблемы, legacy migrator не менялся.

## 5. Как повторить

| Команда | Назначение |
|---|---|
| `npm run target:typecheck` | Проверить target-код, scripts и tests. |
| `npm run target:test` | Target unit/HTTP suite; шесть PG-тестов без RPG_TARGET_PG_TESTS не выполняются. Для HTTP нужен разрешённый loopback. |
| `npm run target:test:pg` | Создать свою временную PG, выполнить весь target suite и удалить собственный контейнер. Требует Docker и локального закреплённого образа. |
| `npm run target:preview` | Временные `/health` и `/ready` на 127.0.0.1:3101; автоматическое закрытие через 90 секунд. Порт должен быть свободен. |
| `npm run target:dev` | Явный запуск с уже заданным RPG_TARGET_* для собственной временной среды; сам не применяет миграции и не создаёт контейнер. |

Harness использует уже установленный закреплённый образ; не скачивает иной образ молча. При отсутствии образа/доступа к Docker — явный отказ, не подключение к другой БД. Учётные данные генерируются внутри процесса, поэтому существующие секреты из envskill не требуются и не читались; правила envskill по неразглашению соблюдены. Значения не пишутся в командные аргументы, Git или отчёт.

## 6. Ограничения и следующий этап

Это локальная инженерная среда: роль rpg_test управляет собственной disposable DB и не является production-ролью приложения. Нет реальной авторизации, миграции семейств, money ledger, каталога, ассетов, пользовательского UI или deployment. Readiness не заменяет проверку миграций. Полный production security проект остаётся O09/G03.

Статусы: F01–F07 реализованы и проверены в указанном объёме; F08 — этот отчёт и карточка G02-B. W04/W05 закрыты в базовом объёме G02-A, W06/W07 частично — служебный runner и test harness. G02 не закрыт до базовой семейной схемы/ограничений; G02-B требует отдельного разрешения по [карточке](G02_DOMAIN_SCHEMA_CARD.md).
