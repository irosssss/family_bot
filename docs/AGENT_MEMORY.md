# Family Chores RPG — память агента

Последнее обновление: 2026-09-08

- После ревью G04 исправлены replay завершённой публикации до approval/storage (с повторной проверкой receipt под lock), тип `bundle_id` только `namespace:localization/name` и пропуск flags/keycaps/modifiers проверкой emoji. Новые 11 сценариев: полный target499PASS на отдельной PG18.6, cleanup exact ID PASS; regression253PASS/9opt-in skip, lint/typecheck/build/compiled ESM PASS. Схема входа изменилась, старые fingerprint evidence относятся к прежней сборке. Браузерная проверка этой backend-правки ограничена: текущий Quick Tunnel URL вернул DNS error, localhost:3000 не слушает; ссылка не восстанавливалась в рамках исправлений.

## Временный запуск на телефоне (2026-09-08)

- Ручная проверка: основные цепочки дел/общих наград/возврата/боя/одежды/питомцев/комнаты прошли; отчёт `docs/implementation/BROWSER_FUNCTIONAL_QA_2026_09_08.md`. Недоступные формы каталога публичной демо скрыты через `allowCatalogEditing=false`; участники/дела сохранены. Повторная проверка 375 px, lint и 253 теста PASS (9 opt-in PG skip). Реальный Telegram WebView этим не покрыт.

- Пользователь отдельно попросил текущую игру в обычном браузере. `src/preview/browserDemo.ts` + injected transport/namespace в DemoApp открывают отдельный in-memory мир без API; reset при reload, namespace pending/profile отделён. При непустом initData остаётся подписанный server transport без fallback по401. Lint/buildPASS;253regressionPASS/9optinPGskip;HTTPS/home screenshot375PASS. Это существующая demo, G04-D/W15 ещё не начат.
- Последняя временная ссылка `https://italic-net-appliances-seo.trycloudflare.com/`: при первоначальном запуске bot menu verified, после ревью DNS error. Конфигурация сервера3211 (`PREVIEW_PORT=3211`), tunnelна3211. ПрежнийURL неразрешалсяDNS; старый3210сервер/семьи были сохранены, auto-review отклонил его остановку со сбросом памяти, поэтому создан независимый экземпляр. НовыйTelegrampreview имеет отдельные тестовыесемьи; текущая доступность процессов не гарантирована.
- Пользователь поручил подключить тестовую HTTPS-версию к существующему боту и явно исключил Google Cloud. Старый адрес в меню отвечал404; заменён на проверенный Cloudflare Quick Tunnel.
- `src/preview/` + `scripts/{build-telegram-preview,telegram-preview}.ts`: отдельный сервер127.0.0.1:3210, production-сборка demo UI, signed Telegram initData + exact Host/Origin. Мир в памяти отдельно для каждого проверенного subject; максимум32мира, данные до перезапуска. Без основной БД/legacyAPI/cron/webhook и без целевого onboarding. Каталог редактируется только локально.
- В envskill инъецируется только BOT_TOKEN. setChatMenuButton «Играть» и read-back подтверждены. Туннель и сервер зависят от бодрствующего Mac; адрес меняется при новом туннеле. Подробности и команды: `docs/implementation/TELEGRAM_DEVICE_PREVIEW.md`.
- Build/lintPASS, синтетический HTTP тест изоляции/подписи/идемпотентностиPASS, HTTPS healthPASS, браузер+скриншот гостевого экранаPASS. Пользователь подтвердил «да все работает» на телефоне и разрешил идти дальше по плану. Это подтверждение demo preview, не приёмка целевого onboarding/PIN/recovery и не полная матрица375px/WebView.

Этот файл — короткий continuity-layer для следующих рабочих сессий. Он дополняет
`AGENTS.md`, но не заменяет его. Здесь хранятся только факты, решения и проверенные
команды; секреты из `.env` сюда не попадают.

## Продуктовое проектирование — 2026-09-07

- Все существующие игровые ассеты — демо. Основные персонажи, питомцы, вещи, дом/окружение/UI будут позже; текущие ULPC-размеры, слои и ассортимент не задают production-стандарт. Демо сохраняет runtime-зависимости; удаление/генерация/замена этим этапом не разрешены.
- Пользователь принял продуктовый этап 02, ARCH01–ARCH08, DAT01–DAT08, физический проект PDB01–PDB08 с открытыми зависимостями, затем ART01–ART08 как спецификацию ответом «да, дальше». Затем пользователь принял PIPE01–PIPE08 ответом «да, продолжай» и разрешил подготовить единый план реализации. Затем принят IMP/G01 и разрешён G02-A сообщением «делай», затем G02-A принят и разрешён G02-B ответом «да, продолжай»; затем «дальше давай» принят G02-B и разрешена спецификация G03-A; выполненный объём описан ниже. Остальная реализация, реальные миграции, создание/генерация графики и публикация не разрешены; историческое ночное поручение ниже не расширяет текущую задачу.
- Оба способа детского входа сразу в MVP подтверждены отдельно. Личные кошельки, реальные награды, базовые уголки каждого питомца и семейные цели — MVP; дружба/кормление, косметика питомцев и боссы — 1.1. Общая копилка и числа прежнего demo не являются целевой экономикой.
- PRODUCT_CONTRACT v1.25, PRODUCT_ROADMAP v1.21; DOMAIN_MODEL/DOMAIN_REVIEW и DAT v1.0 приняты, RUNTIME_DICTIONARY v1.1 уточняет принятый PDB импорт (OwnedPet origin egg/approved_import, stack_key расходников). PHYSICAL_SCHEMA v1.1 и CONTENT_DICTIONARY v1.1 отражают принятую PIPE06-активацию набора; TRANSACTIONS/MIGRATION_MAP v1.0 приняты как проект. Проверены исходники legacy/demo_worlds, не реальные БД. QDB01, O01/O09/O12/O13 и конкретные import mappings открыты; DBT01–DBT20 — будущие тесты.
- docs/art/{ASSET_BIBLE,ASSET_COMPONENTS,UX_CONTRACT,ART_PRODUCTION}.md v1.0 приняты как спецификация. Hero64×80/pet48×48/icon24×24/home+corner320×240, палитра, навигация, раскладка четырёх видимых участников с группами/списком — кандидаты до visual QA, не финальный art. VQA01–VQA20 не выполнялись; генерации/прототипа не было. A1 concept/A4 prototype требуют отдельного разрешения.
- docs/content/{CONTENT_PIPELINE,AUTHORING_CONTRACTS,RELEASE_OPERATIONS}.md v1.0 — PIPE01–PIPE08 приняты как проект. Приняты точные SemVer-зависимости MVP, закрытые authoring DTO, frozen lock, отдельные semantic/public digests, детерминированная сборка, preview exact candidate, публикация отдельно от активации, сохранение приобретений при откате и reachability GC. ActivationSnapshot/Head/Change приняты как уточнение PDB; ReleaseActivation — согласованная проекция, head управляет набором. Две JSON Schema в документации, VAL01–VAL15 и будущие CPT01–CPT20 не являются реализованным конвейером. docs/IMPLEMENTATION_PLAN.md и IMPLEMENTATION_BACKLOG.md v1.9: IMP01–IMP08/G01 приняты, W01–W03 завершены. Аудит READINESS_REVIEW подтверждает startup migrations/seed/cron, глобальный DB/config, shared demo wallet и неполную legacy-модель реальных наград; реальные БД не проверялись. В G03-A синтетический независимый пример подтвердил расхождение legacy auth canonicalization: raw URL-encoded пары вместо разобранных значений; подробности ниже. Проверки реального Telegram ещё нет. Fetch credentials без origin-boundary не доказывает утечку. Полный MVP сохранён; art-цепочка и техническое ядро имеют отдельные зависимости. Сроки не выдуманы, O-ID/QDB01 блокируют только зависимое.

## Целевая техническая основа — 2026-09-07

- По следующему поручению пользователя G04-B принят, G04-C/W14 выполнен: localStorage + localRelease экспортируются единым compiler bundle; private immutable files/readback, opaque exact review token, fixture operator actions, graph publication отдельно от activation snapshot/head CAS. Миграция0007 добавляет11content-таблиц/immutable guards; ранее опубликованные localization revisions не переписываются. Сервис только synthetic_local_only/fixture, без HTTP/production/семейных данных. Старые releases/files сохраняются; acquired rollback/GC впереди. Отчёт `docs/implementation/G04_RELEASE_RESULT.md`; следующий блок G04-D/W15 — exact candidate preview.
- G04-C:488targetPASS (456+32новых),21файл, собственнаяPG18.6/exactcleanupPASS;251legacy+previewPASS/9opt-inPGskip;lint/type/build/compiledESM-storage/importPASS. Failure/readback/DB rollback/replay/expiry/namespace/version/revision rewrite/closure/unknownschema/CAS/SHARE-lock проверены. Existing migration rollback-тесты считают остаток по manifest, сохраняя точный отказ своей миграции. HTTPS guest browserPASS. `work/g04-c/verification.json`; план/backlogv1.11. Полный G04 ещё открыт.
- По следующему «дальше» G04-A принят, G04-B/W13 выполнен для plain_text/local candidates: freeze/exact resolver/JCS/semantic+public hashes/lock/manifest/private report/CLI. Схемы закрыты; fixture compatibility profile/config и версии Node/ICU/Unicode закреплены. Нет production PublishedDependency/activation/новых игровых типов. Отчёт `docs/implementation/G04_COMPILER_RESULT.md`, fixture `tests/fixtures/content/g04-b`, evidence `work/g04-b/verification.json`. Следующий блок G04-C/W14 — локальный release/activation adapter.
- G04-B:456targetPASS (410+45compiler+1regression), собственнаяPG18.6/exactcleanupPASS;251legacy+previewPASS/9opt-inPGskip;lint/type/build/importPASS. SourceCLI/compiledCLI/единыйcompiledlibrary создали одинаковые runtime bytes,2пакета/4артефакта. Старый lock отвергает изменённый исходник до записи; иной порядок JSON/sets не меняет fingerprint. Private metadata вне runtime. БраузерHTTPS загружается; текущий бот/основнаяБД/art не менялись.
- Runtime-урок G04-B: Ajv8.20.0 standard uniqueItems → fast-deep-equal вызывает valueOf у null-prototype objects G04-A. Пакет с двумя object dependencies падал TypeError. `schemaValidator.ts` заменяет uniqueItems семантически эквивалентным безопасным canonical JSON comparison; не возвращать builtin без регрессии null-prototype/valueOf/constructor. Source schema registry frozen; compiler bundle экспортирует freeze/compile/write вместе (provenance WeakMap/WeakSet локальны модулю).

- 2026-09-08 после «да все работает, идем дальше по плану» G03-G принят продолжением; G04-A реализован как первый блок W12. `src/target/content/{json,schemas,input}.ts` + `scripts/target/content-validate.ts`: bounded JSON, duplicate keys/Unicode/точные integers, JSON Schema2020-12 через прямой ajv8.20.0, explicit path/case/no-symlink/no-hardlink, namespaces, raw digests. Поддержаны PackageInput v1 и LocalizationInput v1 plain_text, fixture в tests/fixtures/content/g04-a. Limits синтетические, root стабильный без hostile concurrent writers. CLI structural-only/production_ready:false; W13 resolver/lock/compiler и W14/W15 впереди. Остальные схемы/ICU/графика не реализованы. Отчёт `docs/implementation/G04_AUTHORING_INPUT_RESULT.md`.
- G04-A: 410targetPASS (352+58новых) на собственной PG18.6, exact cleanupPASS; 251legacy+previewPASS/9opt-inPGskip; lint/type/build/ESM import/compiledCLIPASS. Тест preview переведён на общий Vitest runner (раньше отдельный node:test). Текущая HTTPS-игра загружается; реальные данные/основная БД/бот-меню этим этапом не менялись. Следующий самостоятельный блок G04-B/W13.

- Пользователь принял G01 и разрешил F01–F08 G02-A сообщением «делай». G02-A реализован: src/target, scripts/target, migrations/target, tests/target; явная конфигурация/factory, UUIDv7/точные bigint-строки/закрытые Ref и payload dispatcher, manifest/checksum/journal/lock, изолированные health/readiness. Новых dependencies нет; старые runtime/БД/ассеты не менялись этим этапом.
- G02_FOUNDATION_RESULT v1.0: 36 target-тестов прошли на собственной PG18.6, lint/target:typecheck прошли, старая регрессия 218 passed/9 opt-in PG skipped. Временные контейнеры удалены с проверкой exact ID. CUA заблокировал preview net::ERR_BLOCKED_BY_CLIENT; браузерная проверка не PASS, автоматические HTTP-тесты прошли.
- Runtime-урок: postgres.js 3.4.9 ReservedSql типизирует begin(), но runtime reserve() его не предоставляет. Target runner использует явные BEGIN/COMMIT/ROLLBACK на reserved-сессии и проверяет backend PID, удерживающий advisory lock. Не переносить этот вывод на другие версии без проверки.
- G02-A принят пользователем, G02-B разрешён ответом «да, продолжай» и выполнен. W04–W07 реализованы/проверены в базовом объёме G02. G02_DOMAIN_SCHEMA_RESULT v1.0: пять таблиц accounts/families/member_profiles/players/retention_policy_revisions, полный I/M/F/R согласно сущностям, composite child/family FK, NO ACTION, закрытые records. Drizzle использует собственный проверенный клиент; raw JSON serializer другого клиента не меняется. Реальных данных/production-политик/API нет.
- Итог G02-B: target 48 passed на собственной PG18.6; lint/target:typecheck/target:build PASS, импорт ESM bundles без startup PASS; прежняя регрессия 218 passed/9 opt-in PG skipped. Тестовые и preview контейнеры удалены; список owner-метки пуст. CUA снова ERR_BLOCKED_BY_CLIENT; браузер не PASS, HTTP-тест прошёл. Доказательства work/g02-b.
- Исправление G02-A: Int обязан иметь симметричный PDB-диапазон ±9223372036854775807; SQL minimum −9223372036854775808 теперь отвергается. Для стабильного DDL используется явный foundationSchema, а не порядок module exports (Node/Vitest различался). Не переписывать применённые миграции; новые изменения — следующая версия.
- G02-B принят и G03-A разрешён ответом «дальше давай». G3A01–G3A08 оформлены в docs/security/{ACCESS_PROTOCOL,ACCESS_VALIDATION}.md v0.1: оба входа, PIN/recovery/revoke, SP01–SP17, будущие GAT01–GAT24. Это предложения к приёмке; runtime не менялся, GAT не запускались. Затем G03-B разрешён и реализован; текущий результат и следующий шаг указаны в разделе G03-B ниже. O01/O09/QDB01 остаются открыты; реальные security/retention политики не заменены fixtures. FK не заменяют права чтения/команд; CAS, production DB-роли и защита опубликованных retention-версий — до реального использования в соответствующих сервисах. Полные DBT/CPT/VQA не закрыты.

- G03-A: work/g03-a/canonicalization-probe.json содержит только результаты синтетической проверки: decoded reference rejected by legacy, encoded legacy shape accepted. Проверены Telegram docs и исходники сторонней init-data-golang; библиотека не установлена. Затем по прямому поручению пользователя legacy helper исправлен; результаты следующего пункта заменяют статус открытого дефекта. Реальный bot test не выполнен.
- На приёмку предложены отдельные сроки семейной сессии и adult grant, одноразовый identity exchange, opaque bearer только в памяти, отдельное состояние verifier от родительской lineage. SP — кандидаты, не production-настройки. O01/O09 и live Telegram остаются зависимыми этапами.

## Исправление Telegram-валидатора — 2026-09-07

- Пользователь прямо разрешил исправить найденную ошибку. src/utils/telegramAuth.ts теперь проверяет HMAC декодированных query-значений (все поля кроме hash, включая signature), без повторного декодирования/пересериализации JSON. Общий parser подписи/user отвергает дубли/повреждённые escape/UTF-8/разделители; user ID — положительный safe integer. Verify middleware отвергает malformed user. Окно24ч/допуск60с сохранены; одноразовость не реализована.
- Исправлены оба тестовых signer; добавлен независимый Python-vector с искусственным публичным тестовым ключом. До исправления16новых проверок падали; после npm test250passed/9opt-inPGskipped, lint0. HTTP verify/отказ регистрации доБД/защищённые запросы и Socket.IO проверены с synthetic identity. Sandbox listen EPERM устранён разрешённым запуском тестов; новые зависимости/реальные данные не использованы. Отчёт docs/security/TELEGRAM_AUTH_FIX.md, логи work/auth-fix. G03-B и параметрыSP остаются на согласование.
- CUA успешно открыл http://localhost:3000/: «Семейный дом — локальная демо», дерево UI доступно. Smoke-проверка подтверждена; реальная Telegram-авторизация и visual QA этим не доказаны.

## G03-B — 2026-09-07

- После проверки BOT_TOKEN пользователь согласился оставить demo без токена и сказал «хорошо, тогда продолжим»: разрешён G03-B. Реализован src/target/access/telegram, строгий query/duplicate-JSON/числовой ID, HMAC, явные policy/clock/expected bot, закрытая frozen identity и внутренний replay fingerprint. Нет семейных прав, env/DB/network, новых dependencies и подключения к legacy UI. Параметры SP остаются кандидатами для зависимых сервисов.
- Проверки: 77 adapter/RFC cases, target113passed/12PGskipped; legacy250passed/9PGskipped; lint/target:typecheck/build PASS, собранный ESM принимает независимый Python-vector, import guard3passed. PG/schema не менялись. CUA вновь загрузил localhost:3000 «Семейный дом — локальная демо»; это smoke, не Telegram e2e. Логи work/g03-b; результат docs/implementation/G03_IDENTITY_ADAPTER_RESULT.md.
- Важные границы: environment — доверенная конфигурация, а не утверждение из HMAC; real test/prod keys/deployment ещё не проверены. Повторный вызов pure verifier разрешён: одноразовость обеспечивает будущий receipt. Новый тест поймал замену lone UTF-16 surrogate; добавлен явный отказ. GAT01–03/05 покрыты pureadapter, GAT04частично, GAT06–24будущие.
- На момент завершения G03-B следующий этап на разрешение был docs/implementation/G03_IDENTITY_EXCHANGE_CARD.md: external identity/одноразовый exchange/AccessLaunch на собственной временной PG, без API/реальных пользователей. G03-B готов к приёмке. При расширении freshness нельзя оживить уже использованный вход после cleanup receipt; нужен отдельный policy cutover.
- Сохранённый BOT_TOKEN проверен getMe в предыдущем поручении (200, ok/is_bot). Локальный /api/auth/verify сообщил missing token; пользователь решил не перезапускать с токеном сейчас. Реальное значение не выводилось и не сохранено в репозитории; G03-B его не использовал.

## G03-C — 2026-09-07

- G03-B принят, G03-C разрешён «делай» и выполнен. src/target/access/identityExchange.ts + contracts/access.ts + db/schema/access.ts: ExternalIdentity/Launch/Receipt и служебный identity_exchange_policy; 0003 добавлена в manifest, 0001/0002 неизменны. Экспорт общих schema helpers не меняет foundationSchema/DDL; Drizzle использует полный targetSchema.
- Обмен принимает raw initData и сам вызывает G03-B, ещё раз после lock. Account/Identity/Launch/Receipt атомарны; U(provider,subject), unique fingerprint/verifier, composite identity/account FK, полный I/M/R по сущностям. В БД только verifier; bearer non-enumerable и возвращается после commit. Resolver не выдаёт семейных прав. Ошибки — allowlist ключей, никакого произвольного текста зависимости.
- Policy-head нужен после cleanup: явная CAS activation, monotone auth_date_floor, digest включает ключ без сохранения plaintext и канонические настройки. Старые процессы/другая среда блокируются. Cleanup удаляет строго после горизонта и сохраняет watermark времени в той же транзакции, clock rollback не оживляет receipt. Exchange policy shared → subject advisory → identity update → account share; policy activation/cleanup exclusive. Будущие revoke handlers учитывают порядок.
- Итог: target147passed на собственной PG18.6 (6 новых contract +16 PG), legacy250passed/9opt-inPGskipped, lint/typecheck/build/ESM import PASS. Контейнеры каждого прогона удалены exact ID (targetCleanup в work/g03-c/target-tests.log). Проверены гонки двух пулов, entropy/receipt failure rollback, verifier collision, disabled/revoked, expiry, policy widening/clock rollback/rotation, DDL/catalog и rollback0003. CUA загрузил localhost:3000, только smoke демо.
- G03-C принят ответом «да», G03-D разрешён и выполнен; его результат ниже. Историческая карточка G03-D: docs/implementation/G03_FAMILY_ACCESS_CARD.md, binding/session/token verifier/own_child и family guards; adult/managed выдача закрыта до PIN. GAT06 закрыт service/DB; GAT07 только ограниченный launch, остальное будущее. Настоящие DB/BOT_TOKEN/пользователи/API не использованы. Cleanup launch/identity, production retention/roles/rate limits — будущие зависимые работы.

## G03-D — 2026-09-07

- Пользователь принял G03-C и разрешил G03-D ответом «да». G3D01–G3D06 выполнены; docs/implementation/G03_FAMILY_ACCESS_RESULT.md принят перед G03-E. Следующий G03-E затем разрешён и выполнен; текущий результат ниже. W09/W10 частичны, W11 и весь G03 не закрыты.
- Новые db/schema/familyAccess.ts, contracts/familyAccess.ts, access/{familySession,familyAuthorization}.ts; append-only0004, старые0001–0003/checksum не менялись. db/database.ts использует полный familyAccess.targetSchema; access.targetSchema сохраняет baseline0003 для DDL-проверки. Три таблицы I/M/F/R: access_bindings/session_contexts/session_token_verifiers; composite family/account/profile/role/manager/parent FK, partial active uniqueness.
- Own-child issuer принимает только launch + существующую binding + Player. Внутренний exchange.lockLaunch используется в общей транзакции; unique origin_launch_id потребляет launch даже при гонке между семьями. Не создаёт профиль/игрока/подарки. Cleanup контекстов не должен преждевременно убирать доказательство потребления. Invitation origin пока SQL/DTO NULL-only, до настоящей invitation-таблицы/FK.
- Family bearer32bytes, domain-separated SHA256, non-enumerable output после commit. Resolver выводит actor из живых источников; withFamilyAccess держит family lock и DB callback в одной транзакции. Сеть/KDF не помещать в callback. Запрет child→чужой profile/family/adult action; adult→child.play. Погашение verifier отдельно от отзыва lineage; parent grant expiry не завершает managed, parent revoke/protection revision — завершает. CAS отзыв session/child binding сохраняет независимые способы доступа/прогресс.
- Adult/managed выдачи нет. Protection hooks default-deny; разрешающие реализации только в синтетических tests. PIN/fresh proof/A15 quota/audit/policy activation — G03-E до включения взрослых методов. Общий revokeBinding отвергает adult_membership: выход/исключение требуют отдельного A14/A16/last-adult lifecycle. Family policy digest проверяет конфигурацию текущего процесса, но не заменяет будущий согласованный policy head.
- Итог: target193passed (21 contract+25 PG новых), legacy250passed/9opt-inPGskipped; lint/typecheck/build/ESM import PASS. work/g03-d/{target-pg-final,legacy-tests,lint,typecheck,build,import}.log. DDL/catalog/SQL violations, rollback0004, issue rollback и гонки двух пулов, mutation/revoke сериализация, own/adult/managed negatives проверены. Оба собственных контейнера удалены exact ID, targetCleanup=passed. Реальные DB/BOT_TOKEN/семьи не использованы.
- Браузер G03-D: localhost:3000 НЕ доступен, CUA ERR_CONNECTION_REFUSED и отдельный curl health HTTP000/exit7. Это отличается от прежнего ERR_BLOCKED_BY_CLIENT. Сервер этим блоком не запускался; прежние записи о PID/доступном3000 исторические. UI/ассеты G03-D не менял. Для восстановления демо сначала проверить listener и использовать согласованный envskill scope без BOT_TOKEN; не запускать второй сервер.

## G03-E — 2026-09-07

- G03-D принят, G03-E разрешён «делай», G3E01–07 выполнены. Результат G03-E принят переходом к G03-F. Текущий результат и следующий этап — в разделе G03-F ниже. Полный G03/W09/W10/W11 не закрыт.
- Native Node crypto.argon2, target требует Node24.7+, проверен24.16.0 darwin-x64. Argon2id19MiB/t2/p1/tag32, соль16байт, отдельный pepper32байта только через конфигурацию. argon2@0.45.1 проверен и удалён: tarball без darwin-x64 prebuild; nativeaddon не добавлен. @types/node24.13.3, отдельный target CI Node24 (удалённо не запущен). Локальный benchmark median44ms/p9548ms/pair55ms, не production capacity.
- Девять auth-таблиц, closed records и append-only0005;0001–4 неизменны. adultProtection.targetSchema — полный; исторические snapshots сохранены. adultScopeIndexes явно добавляют четыре candidate-key индекса перед generated DDL для составных FK.
- Setup10мин из verifiedlaunch+adultbinding; двойной PIN, recovery160бит Base32/checksum/locator, код только при создании, CAS-ротация неподтверждённого, активация после предъявления кода. Active/revoked protection не допускает повторный setup. На этапе G03-E полного recovery ещё не было.
- login/switch/fresh используют DB-reservation до KDF,5ошибок/15мин→пауза15мин,20/24ч; успех историю не сбрасывает, source10/10мин. Два KDF-слота advisory между процессами, без family lock во время вычисления. Shared policy→family→источник→attempt/proof, повторная проверка после KDF; policy/key смена блокирует старые factory.
- Adult idle5мин/absolute30мин, семейный контекст8ч; PIN-переход атомарно гасит bearer и выдаёт fresh adult/managed lineage без создания Player. Managed не зависит от короткого grant, но зависит от живых identity/binding/parent/protection. Fresh proof2мин связан с actor/token/context/credential/action/target/revision/operation. Revoke+proof+dedupe+audit+pair5мин атомарны. Activity меняет contextrevision и консервативно инвалидирует прежний proof.
- 238 target passed (24 новых crypto/contract + 21 PG),250legacy/9opt-inPGskip,lint/type/build/ESM importPASS. Два pool, concurrency/pending-limit, KDFbusy/familylockfree, stale policy/binding/target, rollback switch/migration, composite SQL guards. Cleanup exactIDpassed. Браузер3000ERR_CONNECTION_REFUSED иcurl также; demo не запускался. Нет реальных данных/ключей/API/UI/bot/ассетов.

## G03-F — 2026-09-07

- После вопроса о следующем этапе пользователь разрешил G03-F сообщением «делай». G3F01–G3F07 выполнены: docs/implementation/G03_RECOVERY_LIFECYCLE_RESULT.md на приёмку. Следующая карточка G03_TRANSPORT_CARD.md (G03-G) — на разрешение. Полный G03/W11, реальные Telegram/HTTP/UI и production-параметры не закрыты.
- Новый accessLifecycle service: recovery по коду/другому взрослому, неизменный verified candidate, новый binding прежнего parent profile, атомарный отзыв старой семейной ветви, ограниченный setup с тем же заранее выданным bearer. Потерянный ответ — getSetup/rotatePendingRecovery; обычный beginSetup не обходит recovery setup. Старые identity/Account и другие семьи не переназначаются.
- Приглашение: issue→claim→approve→consume; approved не даёт прав. Одобрить точного кандидата может любой действующий взрослый семьи, issuer и approver проверяются при commit. Child сохраняет Player, adult получает один parent profile и отдельную настройку PIN. Уникальный result_binding_id и consumption event фиксируют происхождение без изменения закрытого origin_invitation_id G03-D.
- Leave/exclusion требуют другого eligible adult; target лично подтверждает исключение PIN. Закрываются credentials, managed descendants и незавершённые процессы взрослого; independent child сохраняется. revokeAdultSessions отзывает всю ветвь с общей квотой G03-E; membership сохраняется. Receipt после выхода читается новым verified launch того же Account.
- accessLifecycle.targetSchema теперь полный: две новые таблицы lifecycle_requests/lifecycle_events, закрытые варианты records, append-only0006, два candidate-key индекса на прежних таблицах. Старые0001–0005 не переписаны. Security digest содержит g03_f_lifecycle_v1: переход старого G03-E head требует явной следующей family policy revision; никакого silent cutover.
- 289 target passed (30 новых PG + 21 records),250legacy/9opt-inPGskip,lint/type/build/importPASS. Catalog/SQLnegative/rollback0006, два pool, разные кандидаты/взрослые, stale source/policy/approval, потерянный ответ, ротация pepper, command/leave проверены. Браузер3000 и health недоступны; UI не менялся. Реальных данных/ключей/бота/API/deploy нет.
- Runtime-урок: полный target suite с повторными миграциями заполнил tmpfs256MiB через pg_wal; подтверждён PostgreSQL PANIC No space left on device. Только disposable harness изменён на512MiB и min/max_wal_size32/64MB; fsync/synchronous_commit не отключались. Ошибки классифицируются без сырых SQL/параметров. После исправления полный прогон и exact-ID cleanup прошли.

## G03-G — 2026-09-08

- Пользователь подтвердил восстановление G03-F и явно разрешил полный G03-G по G03_TRANSPORT_CARD. RTK.md для этого проекта не нужен: внешний файл Claude Code, по прямому уточнению пользователя. G3G01–G3G06 выполнены; результат docs/implementation/G03_TRANSPORT_RESULT.md на приёмку. Полный G03/W11 не закрыт.
- src/target/transport/{contracts,routes,http}.ts: 31 явный сервисный POST endpoint и закрытый family/bootstrap. Строгие request DTO/UTF-8/duplicate JSON/UUID/PIN, явные response projections/non-enumerable secrets после commit. Нет клиентского actorId, generic method dispatch или вывода internal/verifier records. Контракт docs/security/ACCESS_HTTP_CONTRACT.md.
- HTTP factory принимает существующие service instances и обязательный closed gate O01/O09; startup только127.0.0.1, случайный порт, точные Host/Origin, X-RPG-Credential+Bearer. Нет cookie/proxy/query/compression, body24KiB/header8KiB/timeouts, no-store/no ETag. Audit только fixed route/status. Ошибки lifecycle остаются общим403, включая rollback; неизвестные transport ошибки503 без подробностей. Импорт/старый target:dev не запускают новый transport.
- Bootstrap остаётся закрыт до решений O01/O09; synthetic family/profile/binding создаются только напрямую тестовыми fixtures. HTTP не принимает consent/synthetic flags и не открывает создание настоящей семьи. UI выбора семьи/home/игровых команд нет.
- Проверки:352target passed (289прежних+45boundary+18HTTP/PG),250legacy/9opt-inPGskip,lint/type/build/ESM importPASS. Два pool/HTTP сервера, новый factory после committed state, оба child доступа к одному Player, PIN лимит/пауза, lost response/recovery/invite/expiry/withdraw/revoke/leave, CAS/replay и rollback проверены. Миграции0001–0006 и G03-E/F source сохранены; новых dependencies нет. Логи и verification work/g03-g.
- Урок проверки HTTP: Node fetch заменяет вручную заданный Host; для теста чужого Host использовать node:http. Общий pair limit запрещает последовательный revoke session→binding с429; тест обязан проверять паузу, а не ослаблять сервис. Первый прогон выявил эти две неверные предпосылки тестов, итоговый прошёл.
- Browser probe отдельного синтетического HTTP endpoint: CUA ERR_BLOCKED_BY_CLIENT, неPASS; curl подтвердил403 transport.boundary_denied/no-store без Origin. Тестовые и preview PG18.6контейнеры удалены exact ID. Реальные Telegram/keys/data/UI/art/deploy и remote CI не использованы. GAT23частичный HTTP;GAT12/24device и production onboarding ещё впереди, среда/бот/аккаунты требуют отдельного выбора.

## Диагностика browser preview — 2026-09-07

- Пользователь отдельно попросил восстановить browser preview. Повторный собственный preview отвечает curl /health = {status:ok}, но CUA возвращает ERR_BLOCKED_BY_CLIENT; about:blank доступен. Переподключение CUA не помогло. В локальном browser/config.toml разрешения/запреты для localhost/127.0.0.1 не найдены; это не исключает другие политики. Точная причина не установлена, восстановление не подтверждено. Нативный UI настроек недоступен агенту. Пользователь уточнил: игра открыта на http://localhost:3000/, а 3101 был только временной health/readiness-пробой G02. Не просить разрешить 3101 ради игры и не переносить его блокировку на 3000; восстановление интерфейса на 3000 этой диагностикой не проверялось. Не расширять разрешения глобально и не отключать защиту. Проверка внешнего learn.chatgpt.com через браузер отклонена auto-review как выход за локальный запрос; не повторять без отдельного основания/разрешения. Код приложения и настройки браузера не менялись.

## Текущее состояние реализации — история на 2026-09-05

- Дом v5 подключён в runtime: `home-evening-v5.png`1672×941; `AuthoredRoom.tsx` + `homeScenes.ts` + `home-scene.css`, единая проекция и совместная раскладка. Обновляется только точный штатный fireplace art; custom background не подменяется, старые ассеты/данные сохранены. Родительские питомцы теперь тоже видны только owned+selected; декор проверяет владение/slot. Для6детей во второй группе добавлены childSeated и отдельный childStandingContact, иначе задние дети перекрывались передними. CSS-урок: не ставить `inset:auto` после вычисленных left/top — shorthand сбрасывает проекцию; используются right/bottom:auto.
- Проверка v5: lint0, tests218passed/9opt-inPGskipped, buildPASS (старое предупреждение большого legacy bundle). Реальный дом375×812/390×844/1280×720, 4кнопки людей открывают правильные диалоги; изолированные fixtures0/1/2/4/6/8/13, группы2/3, один родитель,6custom children+6owned pets, тапы по6лицам. Screenshots в `work/overnight/qa/home-final-*.png`, `fixture-children-group2-fixed-375.png`, `fixture-custom-pets-375.png`; `observed-wardrobe-web-1280.png` НЕ доказательство дома. Известный art-остаток: передние дети стоят, не сидят на ковре какv4; камин вне mobilecrop. Проверка всех вариантов декора ещё не закрыта, H3частичный; библиотека/сад в этот проход не менялись. Не называть демо целиком завершённой.
- По последнему «запусти локально» проверен уже работающий сервер PID35488 на3000, /api/health OK; второй сервер не запускался. Запуск через envskill без BOT_TOKEN. Default-world мутации не выполнялись. Запрос открыть localhost в Codex поставлен в очередь интерфейса.

- Новейшее распоряжение: пользователь ушёл спать и просит закончить самостоятельно, не беспокоить. Локальные промежуточные дизайн-решения принимаются координатором; порядок дом→проверка→остальные экраны сохраняется, но ожидание пользовательского ответа между ними заменено независимой внутренней сверкой. Это НЕ означает пользовательскую приёмкуv4 и НЕ разрешает обход прежних блокировок SpriteCook/реальных платежей/default-world QA. Текущий автономный план и разделение работ: work/overnight/ROADMAP.md.

- Приоритетная коррекция пользователя после v2: основной дом визуально НЕ принят. Нельзя считать технически работающий хаб соответствующим референсу. Сохранять согласованные композицию, наполненность, стиль и чёткость графики, а не предлагать пустую альтернативную комнату. Единственный активный этап — основной дом; следующие комнаты, карта и гардероб не продвигаются до сравнения референс/реальный экран, устранения расхождений и одобрения пользователя. Готовый ранее код не удалять. Проверки кода не заменяют визуальную приёмку. Не переключаться на мелкие дефекты оружия вместо дома.
- После принятия дома все дальнейшие страницы должны наследовать один визуальный стиль с проработкой каждого элемента. Дом становится эталоном материалов/палитры/графики/пропорций/контролов; это не разрешение менять все страницы параллельно. Для текущего этапа выделены независимые визуальный ревьюер и инженер слоёв; отчёты/границы в work/home-reference-recovery/.
- Пользователь выбрал вечерний дом: единственный эталон — первый экран слева work/references/visual-v2/05-main-flow-directions.png (точный дубликат asset test/16_04_28). Дневной 01 не смешивать с ним. Это утверждение исходника, не приёмка текущего приложения. Полезная ширина сцены в исходном листе около245px; более крупные похожие файлы — другие комнаты. Сохранять композицию вечернего оригинала при восстановлении скрытых участков/слоёв. Текущий prompt ошибочно задавал нижние45% под свободный пол; Room отдельно перераскладывает детей после выделения сидячих родителей. Эти причины нельзя устранить только перекраской интерфейса.
- Коррекция пользователя после вечерних кандидатов: «выглядит ужасно, мало пространства». v1/v2 отклонены; дальнейшее сжатие кадра и огромные диван/очаг не подходят. Вечерний стиль05 остаётся, но нужен более общий план, меньшая доля мебели и видимое место вокруг близкой семьи; не возвращать45% пустого пола или разнос поколений. Следующий пространственный кандидат показывать сразу с2взрослыми+2детьми, без питомцев, как концепт для проверки вместимости; не выдавать за модульные ассеты или runtime. Статус: work/home-reference-recovery/evening-progress.md.
- Последующий прямой запрос: сгенерировать НОВЫЙ дом под мобильный иweb. Получен evening-responsive-master-v4.png (1672×941, work/home-reference-recovery/), семья2+2по центру, камин сбоку, обзор комнаты шире. Реальный CUA preview проверен375×812/390×844/1280×840: на телефоне область сцены3:4 (375×500/390×520), desktop16:9 (1280×720), один PNG object-fit:cover, все люди видны, overflow нет. Полноэкранный9:16сохраняет людей, но срезает края дивана; для мобильного хаба предпочли3:4, оставляя место UI. Новая геометрия/окно — предложенный новый вариант по последнему запросу, не побайтовое восстановление05. Согласие пользователя наv4ещё не получено. Это flattened preview, НЕ runtime и не готовые слои. Локальная страница/PNG/промпт: work/home-reference-recovery/responsive-result.md. Figma, SpriteCook upload, default world и остальной UI не менялись.
- Техническая основа вечернего этапа2: homeSceneProjection.ts (единый contain/cover для всех слоёв) без подключения к HomeScreen. Lint0, full tests168passed/9opt-inPGskipped после разрешения loopback-портов;21новый тест проекции. Новые фон/персонажи в runtime не подключались. Для SpriteCook всё ещё нет прямого согласия на передачу референса05; баланс80 проверен, загрузок/расходов не было. Художественное решение сначала исправить по отзыву о тесноте, не переключать разговор на обработку отвергнутого фона.
- Добавлена изолированная локальная демо `src/demo/`, migration0018 → `demo_worlds/local-family-v1`; прежний код/таблицы/ассеты сохраняются. DEV открывает демо, `?legacy=1` — прежний интерфейс. Production остаётся legacy, `/api/demo` не монтируется даже с DEMO_MODE.
- Авторизация demo-профиля не является реальной identity; loopback/Host/Origin guard, все изменения с requestId, транзакция SELECT FOR UPDATE. Drizzle меняет shared postgres.js JSON serializers: сохранять `JSON.stringify(state)::jsonb`, а не `client.json(object)` (подтверждённый runtime fix).
- Figma отменена пользователем. Новая семья использует единый Character с отдельными слоями/позами; custom body/weapon требуют alphaPNG256×320 layerArt. Сидячие родители включаются только для трёх проверенных штатных фонов; произвольные фоны до визуальной проверки используют стоячую раскладку.
- Визуальная v2 по пяти новым референсам: тёмно-синяя RPG-оболочка, пергаментные карточки, крупная примерка и семейные профили; контракт в DEMO_VISUAL_V2. Мир: карта/битва/книга; пять регионов — только представление прежнего каталога, не новая экономика. Референсы и точные промпты хранятся в work/, не runtime.
- Runtime-ассеты демо: 217 файлов, включая 49 боссов, 28 питомцев, 3 дома/арену и новую world-map-v2.webp. Точные пути/размеры в ASSET_MANIFEST; provenance в DEMO_ART_INVENTORY и DEMO_CHARACTER_ART. Старые Previews не удалять.
- Gates v2 2026-09-05: lint 0, 147/147 обычных тестов, build PASS, HTTP 217/217. 9 opt-in PostgreSQL-тестов в этом проходе пропущены; ранее отдельно 9/9, временные integration-записи очищены без изменения default world. Legacy bundle остаётся большим (предупреждение Vite).
- Ручная приёмка НЕ завершена: доказательства/остаток в DEMO_QA.md. Auto-review заблокировал equipPet и требует прямого разрешения пользователя здесь; не обходить через API/другую задачу/агента. Сохранена revision14 (QA-прогресс), reset не делать без разрешения. Read-only v2: все пять разделов, home/wardrobe 375/390/desktop, фильтры карты/дел, preview/cancel внешности и библиотеки; реальные PNG в work/visual-v2-qa/.
- Runtime-урок v2: не стилизовать `.demo-arena-party span` фоном/отступами — это также внутренние слои Character. Для подписи используется только `.demo-world-party-name`; исправление подтверждено реальным скриншотом.
- Открытый art-дефект v2: starter/rare rogue bow содержит белый непрозрачный клин внутри дуги. Четыре результата встроенного imagegen отклонены как RGB без alpha/со смещением. Runtime не заменён; точные ограничения, промпты и кандидаты в work/visual-v2-bow-fix/. Не повторять те же генерации и не принимать нарисованную шахматку за прозрачность; следующий этап — согласовать extraction-метод и обновить оба слоя/превью/исходный pipeline.
- SpriteCook 2026-09-05: пользователь явно выбрал плагин; MCP отвечает, get_credit_balance показал 80 (40 subscription + 40 topup), concurrent_jobs=1, проектов пока нет. Прочитаны workflow/upload skills. Создан только временный upload slot для starter-rogue-weapon.png; PUT локального файла отклонён auto-review из-за отсутствия явного одобрения передачи этого PNG внешнему получателю. Байты не отправлены, owned asset_id не получен, remove_background не запускался. Не обходить через inline import, shell, другой инструмент/агента; сначала прямое согласие пользователя на загрузку двух конкретных слоёв в SpriteCook. Служебные URL/токены в файлы не записывать.
- Локальный запуск: Docker Desktop + PG18healthy, `npm run dev:demo` через narrow envskill без BOT_TOKEN. Сейчас запущен один `tsx server.ts` без watch после устранения двух конфликтующих watcher-процессов; не запускать второй сервер на3000. `sbx` отсутствует: Intel Mac не удовлетворяет официальному требованию Apple silicon для Docker Sandboxes; проекту sbx не нужен.

- Проект: Telegram Mini App «Family Chores RPG».
- Стек: React 18 + Vite + Tailwind; Node/Express + Drizzle + PostgreSQL.
- Рабочая база для аудита: репозиторий был проверен на `ac9d2dc8`; HTML-аудит описывает
  состояние на `42f56f0`, поэтому выводы аудита нужно сверять с текущим кодом.
- Рабочее дерево содержит незакоммиченные исправления B-01/B-03, B-02 и C-01.
  Не откатывать их и не смешивать с чужими изменениями.

## Запуск и проверка

1. Локальная PostgreSQL: `docker compose up -d postgres`; проверка — `docker compose ps`.
   Для образа PostgreSQL 18 том должен монтироваться в `/var/lib/postgresql`, а не в
   устаревший `/var/lib/postgresql/data`.
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

- **Промпты под задачу:** координатор вручную составляет короткие задания по
  `docs/AGENT_PROMPTS.md`: результат, область записи, инварианты, доказательства и передача;
  автоматический генератор не установлен, отклонённые действия не обходить делегированием.
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
