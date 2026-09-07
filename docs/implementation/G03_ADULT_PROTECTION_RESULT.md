# G03-E — результат защиты взрослого

Версия 1.0, 2026-09-07. **Разрешён сообщением «делай». G3E01–G3E07 выполнены в серверной синтетической среде; принят переходом к G03-F.** Основа — [карточка G03-E](G03_ADULT_PROTECTION_CARD.md). Полный G03 ещё не завершён.

## Реализованный объём

| Область | Проверяемый результат |
|---|---|
| Криптография | PIN — строка из шести ASCII-цифр, начальные нули сохраняются. Argon2id v19, 19456 KiB, t=2, p=1, 32-byte tag, индивидуальный 16-byte salt, отдельный 32-byte pepper. Фиксированный kdf_id; неизвестные версии/параметры закрыты. |
| Хранение | Девять таблиц с закрытыми records, I/M/F/R по назначению, CHECK/unique/FK. Только verifiers; PIN, recovery-код и pepper в БД не записываются. [Схема](../../src/target/db/schema/adultProtection.ts), [контракты](../../src/target/contracts/adultProtection.ts). |
| Setup | Verified launch + существующая adult binding → opaque setup на 10 минут. Два совпадающих PIN → pending protection и однократно возвращаемый recovery-код. До предъявления текущего кода adult/managed выдача закрыта. |
| Recovery setup | 160 случайных бит, Base32, checksum и отдельный UUID locator. Потерянный ответ не раскрывает код повторно: доступна ограниченная CAS-ротация неподтверждённого кода, предыдущий отзывается. Подтверждение не выдаёт сессию. Хранение вне устройства остаётся утверждением человека; сервер этого не доказывает. |
| Попытки | Резервирование перед KDF, общие DB-счётчики login/switch/fresh по взрослой binding. 5 ошибок в 15 минут → пауза 15 минут; 20 за сутки → отказ до выхода ошибок из окна. Успех историю не очищает. Отдельный предел источника — 10 попыток за 10 минут. |
| Выдача и переключение | PIN + живой источник → adult session; adult → managed, managed → другой ребёнок/adult требуют нового PIN. Старый bearer гасится в той же транзакции; новый возвращается после commit. Не создаются Player/profile/кошелёк. |
| Короткое взрослое право | Idle 5 минут, absolute grant 30 минут при family context до 8 часов. Успешная withFamilyAccess-команда обновляет idle в пределах absolute grant. resolveSession сам по себе idle не продлевает. |
| Чувствительный отзыв | Fresh proof до 2 минут связан с bearer verifier, session revision, protection revision, action, target, expected revision и operation UUID. Одноразовое потребление, operation dedupe, audit и квота пары инициатор/цель 5 минут находятся в общей revoke-транзакции. |
| Policy cutover | Явная CAS-активация общего policy head. Digest учитывает настройки, pepper key ID и его fingerprint. Несовместимый старый процесс не продолжает выдачу после активации, включая KDF, начатый до неё. |

Основной сервис — [adultAccess.ts](../../src/target/access/adultAccess.ts), криптографический адаптер — [adultCrypto.ts](../../src/target/access/adultCrypto.ts). Нет HTTP endpoints, UI, bot messaging или подключения к настоящим семьям.

## Выбор KDF и совместимость

Проверены первичные [OWASP Password Storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html), [RFC 9106 §5.3](https://www.rfc-editor.org/rfc/rfc9106.html#section-5.3) и [Node crypto.argon2](https://nodejs.org/docs/latest-v24.x/api/crypto.html#cryptoargon2algorithm-parameters-callback). Выбранный профиль соответствует минимальному варианту OWASP. RFC-вектор с secret/associated data проверен независимо от рабочего профиля.

Первоначально проверен пакет argon2@0.45.1 (MIT): установка без lifecycle scripts, проверка содержимого tarball и runtime. В опубликованном пакете не оказалось darwin-x64 prebuild, хотя README перечислял эту платформу; импорт на локальном Intel Mac завершился отказом. Пакет и добавленные им зависимости удалены. Не добавлялась сборочная цепочка native addon.

Итог — встроенный асинхронный Node crypto.argon2, доступный с Node 24.7.0. Это отдельное требование target-runtime; локально проверен Node 24.16.0 darwin-x64. Node распространяется с MIT и лицензиями включённых компонентов: [LICENSE конкретной версии](https://raw.githubusercontent.com/nodejs/node/v24.16.0/LICENSE). Runtime npm-зависимостей не добавлено; @types/node закреплён на 24.13.3. Legacy Dockerfile/CI Node20 не объявлены совместимыми с adultAccess и не используются для запуска target. Добавлен отдельный CI job на Node24 с загрузкой закреплённого PG image; удалённый CI этим этапом не запускался.

[Синтетическое измерение](../../work/g03-e/kdf-benchmark.json): Intel i7-8569U, 12 последовательных вычислений, median 44 ms, p95 48 ms; пара параллельных вычислений 55 ms; process maxRSS 104880 KiB. MaxRSS относится ко всему benchmark-процессу, не является памятью одного KDF. Это измерение компьютера разработчика, не production capacity test. Команда воспроизведения: npm run target:benchmark:pin.

KDF ограничен двумя одновременными работами на модуль/процесс и двумя advisory-слотами на target DB между процессами. При занятости немедленный отказ, собственной неограниченной очереди нет. На время вычисления удерживается отдельная DB-транзакция со слотом, без family/protection lock; после вычисления источник и policy проверяются заново. Сетевые/global admission лимиты, pool sizing и измерение выбранного сервера остаются обязательными до transport.

## Транзакционные решения

- Lock order: общий security policy → family → источник/защита → attempt/proof. KDF вынесен между резервированием и финальной транзакцией. Pending-попытки учитываются до завершения вычисления; неверный PIN сохраняет denied/audit отдельно от ошибки запроса. После аварии pending консервативно учитывается в окне, а не выдаёт доступ.
- Managed lineage имеет взрослый контекст без доступного bearer; истечение короткого grant родителя ребёнка не отключает. Отзыв контекста, identity, binding или credential revision отключает. Возврат требует PIN и действующего источника; retired взрослый bearer не используется для аутентификации.
- Каждый новый PIN-переход создаёт свежий взрослый контекст. При выходе из managed старый детский контекст и bearer отзываются; прежняя взрослая lineage не удаляется задним числом. Own-child независим.
- Activity обновляет session revision, поэтому ранее выпущенный fresh proof после такой активности становится устаревшим. Это консервативное поведение: transport должен подтвердить и сразу исполнить чувствительную операцию, а не держать proof в очереди.
- Повтор завершённой operation возвращает успех только при том же действующем adult actor, family и request digest. Просроченный/отозванный actor не получает доступ через dedupe. Ошибка target CAS откатывает proof, operation и audit вместе.
- Нельзя перезапустить setup для active или revoked protection. Возврат доступа после отзыва относится к отдельному recovery/lifecycle протоколу.
- Launch потребляется новой durable записью launch_consumptions для own-child, adult login и setup. Проверка учитывает и старые origin_launch_id. Cleanup не вправе удалять доказательство раньше полной непригодности исходного launch.
- [0005](../../migrations/target/0005_adult_protection.sql) добавлена в manifest. 0001–0004 неизменны. Четыре явно описанных additive unique indexes на старых таблицах предшествуют generated DDL, чтобы composite FK связывали setup launch/account/identity, proof verifier/session/family и revoke operation/family. Исторические schema snapshots для 0003/0004 сохранены. Генерация и каталог проверены.
- FK/CHECK ограничивают данные, но не заменяют trusted service, права DB-роли и live revision проверки. Прямые записи в auth-таблицы не являются публичным API. Retention fixtures не утверждают production-сроки.

## Проверки

| Проверка | Результат |
|---|---|
| Полный target-набор, PostgreSQL 18.6 | **238 passed, 13 файлов**: 24 новые crypto/contract проверки и 21 новый PG-сценарий. [Финальный лог](../../work/g03-e/adult-pg-final.log). |
| Межпроцессные границы | Два независимых pool и новые service instances: setup/login race, pending guesses, неизменность лимита при новом launch, KDF busy, activation/binding/target change во время KDF, сохранение исходного bearer при rollback. |
| Схема | Побайтовое соответствие generated 0005 + additive indexes, live columns/constraints/indexes, SQL отрицательные случаи, rollback0005 и повторное применение. |
| Регрессия | **250 passed, 9 opt-in PG skipped**. [Лог](../../work/g03-e/legacy-tests.log). |
| TypeScript/сборка/import | lint, target:typecheck, target:build и ESM import adultAccess без startup — PASS. [Lint](../../work/g03-e/lint.log), [типы](../../work/g03-e/typecheck.log), [сборка](../../work/g03-e/build.log), [импорт](../../work/g03-e/import.log). |
| Cleanup | targetCleanup=passed, exact ID/owner проверены harness; временные БД удалены. |
| localhost:3000 | **Не PASS**: CUA ERR_CONNECTION_REFUSED; curl health также не получил соединение. UI/ассеты не менялись. |

GAT10/11/13/14 и ветви GAT21 подтверждены серверными синтетическими сценариями: PIN, переключение, истечение, лимиты и независимые детские права. GAT12 проверен только серверными сроками, без browser lifecycle. GAT17–20 не закрыты: создан и подтверждён recovery credential, но восстановления утраченного доступа нет. GAT15/16/22/23/24, production-настройки, Telegram e2e и полный W09/W10/W11 сохраняют зависимости.

Следующая карточка — [G03-F: recovery, приглашения и lifecycle](G03_RECOVERY_LIFECYCLE_CARD.md). Её реализация требует следующего разрешения; этот результат не объявляет весь G03 завершённым.
