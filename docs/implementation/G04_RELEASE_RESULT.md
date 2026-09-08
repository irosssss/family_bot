# G04-C — результат локальной публикации и активации

Версия 1.0, 2026-09-08. Выполнена [карточка W14](G04_RELEASE_CARD.md) для
синтетических plain_text пакетов. Это локальный adapter, не production release.

## Поведение

`compiler.ts` экспортирует единый библиотечный вход: freeze/compile, локальное
хранилище и `createLocalReleaseService`. Импорт не открывает БД/порты и не создаёт
каталоги. Сервис получает уже открытый target Drizzle, ArtifactStore и доверенный
реестр полномочий `authorize(actor, action)` от host-кода.

- `review` выдаёт процессный opaque token на конкретный неизменный compiler result.
  Копия JSON, другой freeze и семейная роль не дают допуска. Default expiry — 10 минут,
  configurable 1ms–1h только для синтетических проверок. Reviewer повторно проверяется
  при публикации, включая момент после ожидания DB-lock. Это отдельное действие
  разрешённого fixture reviewer, а не преобразование source `status: reviewed` в approval.
- `publish` сохраняет весь граф, перечитывает digest/размер каждого объекта, затем одной
  транзакцией регистрирует releases, exact dependency/localization/artifact refs и evidence.
  Manifest/fingerprint привязаны к одобрению. Тот же package/version/digest не создаёт
  новый release; другой digest конфликтует. Тот же operation ID повторяет один результат,
  изменённый запрос с ним отвергается. Новый operation ID оставляет отдельную audit receipt
  даже для ранее опубликованных bytes.
  Уточнение после ревью: сохранённый receipt проверяется до approval/staging и ещё раз
  под publication lock. Для его возврата нужны действующие полномочия publisher и тот же
  request digest; срок прежнего approval и доступность storage не влияют на уже совершённую
  операцию. Новая операция по-прежнему требует действующего approval до и после staging.
- Сбой storage или транзакции сохраняет прежний head. Уже записанные orphan bytes остаются
  в хранилище; cleanup/GC здесь отсутствует. Повтор может безопасно завершить регистрацию.
- `activate` принимает полный набор exact refs, operation ID, reason key и expected revision.
  Проверяет публикацию/evidence, поддерживаемую схему/capability/profile, зависимости и
  чтение всех runtime files. Snapshot, его нормализованные пакеты, change, head и
  `release_activations` записываются одним commit. Две операции с одной ожидаемой ревизией
  не могут обе переключить head.
- Повтор прежней успешной активации возвращает её receipt, даже если head уже продвинулся;
  это не возврат head назад. Явное восстановление требует новой операции и текущей ревизии.
  Пустой набор допускает остановку текущей активации с сохранением опубликованных файлов.
- `readHead(tx)` читает один снимок под SHARE-lock в существующей транзакции. Будущая
  семейная команда вызывает его **после family lock** и удерживает до своего commit.
  Activation получает только UPDATE-lock head; семейные строки не захватывает.

## Хранение и схема

Миграция `0007_content_release.sql` добавляет 11 таблиц `content`, generated Drizzle DDL,
explicit immutable-history triggers и начальный `global` head с revision 0.
Прежние миграции и их checksums сохранены. Исторические migration rollback-тесты
теперь считают остаток из manifest, сохраняя точные проверки отката своей миграции.

`localization_revisions` запрещает замену semantic/public digest у того же
bundle/revision/locale между разными опубликованными пакетами. PackageRelease хранится
неизменным; exact composite FK защищают зависимости и snapshot refs.

Локальное хранилище создаёт приватный каталог. Допустимы только
`manifests/<sha256>.json` и `localizations/<sha256>.json`; временный файл синхронизируется,
прикрепляется без overwrite и перечитывается; каталог назначения синхронизируется.
Пути, symbolic/hard links, размер и digest проверяются. Источником доверия остаётся
владелец каталога: hostile concurrent writers/administrative DB tampering не входят
в гарантию локального адаптера. Доступные SQL-owner полномочия не объявляются production RBAC.

Полномочия и schema CHECK допускают только `fixture:*`, mode `synthetic_local_only`.
В БД нет имён/Telegram IDs/family IDs/секретов; operator refs — фиксированные
синтетические ключи. Это не выбор production retention policy для реальных операторов.
Истёкший review token запрещает новую публикацию; уже зарегистрированное release evidence
не истекает вместе с токеном. Production withdrawal/rights revocation — отдельная политика.

## Проверки

Повтор после исправлений ревью 2026-09-08: **499 target PASS**, 21 файл,
PostgreSQL18.6, run `54d7a33df6d5543d9aa8a1fb4e67f509`, удаление созданного контейнера
по exact ID PASS. Добавлены 2 сценария replay публикации и 9 входных проверок ID/emoji/обычного
текста. Regression253PASS/9opt-in PG skip; lint, target:typecheck, target:build и compiled
ESM freeze/compile/write PASS. UI не менялся; браузерный smoke по прежнему Quick Tunnel
не выполнен из-за DNS error. Приведённые ниже 488 тестов и verification.json — историческое
состояние до ревью, включая прежние хеши входных схем. Актуальные результаты и хеши
исправлений: `work/g04-c/review-verification.json`; полная legacy production-сборка
также прошла перед коммитом (остаётся предупреждение размера бандла).

Все **488 target-тестов** прошли на собственной PostgreSQL18.6; 21 файл тестов,
в том числе 32 новых: 10 storage и 22 PostgreSQL release/activation сценария.
Созданный контейнер удалён с проверкой exact ID. Машиночитаемый итог:
`work/g04-c/verification.json`.

`npm run lint`, `target:typecheck`, `target:build`, compiled ESM exports/storage smoke
и import-isolation прошли. Регрессия `npm test`:251PASS/9opt-in PostgreSQL skip.
Первый sandbox-прогон HTTP-тестов получил listen EPERM; повтор с разрешённым local
listen прошёл. Первый target-прогон выявил только старые fixed migration counts;
после исправления полный повтор прошёл без ошибок.

Действующий HTTPS preview проверен браузером: оболочка загружается, без Telegram
initData показывает ожидаемое предложение открыть бота. Изменений UI здесь нет;
новая phone/WebView/VQA-матрица этим результатом не заявляется.

## Остаток

Закрывается локальная часть CPT13–CPT15 и отказ неподдерживаемой схемы CPT19.
Восстановление проверено для текстов без приобретений; CPT16/CPT17, acquired refs,
wallets, миграции игровых данных, rights/visual approvals, production registry/storage/
RBAC/CI/CD, выдача публичных URL, GC и эксплуатационная crash-recovery остаются впереди.
Сервис не подключён к текущей Telegram demo или покупкам.

Следующий самостоятельный блок — **G04-D / W15**: preview конкретного compiler candidate
с exact manifest/report и проверкой несовместимого контракта. Финальные art/VQA не
заменяются preview текстового fixture.
