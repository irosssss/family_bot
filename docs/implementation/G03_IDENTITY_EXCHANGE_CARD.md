# G03-C — одноразовый обмен identity и контекст запуска

Версия 1.1, 2026-09-07. **Разрешён сообщением «делай»; реализован, проверен и принят ответом «да» с разрешением G03-D. [Результат](G03_IDENTITY_EXCHANGE_RESULT.md).** Основа — [G03-B](G03_IDENTITY_ADAPTER_RESULT.md), [G03-A](../security/ACCESS_PROTOCOL.md). Ограниченный блок W09: проверка личности становится атомарным серверным запуском. Это ещё не семейная игровая сессия. Для G3C05 добавлен служебный policy-head, сохраняющий границу смены политики после cleanup; основание и проверки описаны в результате.

## 1. Конкретные изменения

| ID | Изменение | Проверка |
|---|---|---|
| G3C01 | Закрытые records/Drizzle для external_identities, identity_exchange_receipts и access_launches; следующая append-only миграция 0003 | I/M/R, ссылки/индексы/состояния, checksum, rollback, одинаковый Drizzle/SQL catalog. Существующие миграции не переписываются. |
| G3C02 | ExternalIdentity provider/subject → один Account; U(provider,subject), revoked не создаёт вторую identity/Account | Конкурентные первые входы создают одного субъекта; disabled/erasure_pending account и revoked identity не получают launch. |
| G3C03 | exchangeTelegramIdentity(raw initData) вызывает G03-B внутри server service; receipt + Account/Identity при необходимости + launch одной транзакцией | GAT06: параллельный повтор на двух соединениях создаёт один launch; перестановки/кодировки не обходят unique fingerprint. Поддельный объект VerifiedIdentity из клиента не принимается. |
| G3C04 | Непрозрачный launch bearer: 32 случайных байта, verifier в БД, отдельный внутренний ID; только ограниченный identity-контекст | Нет семейных данных/прав; истечение/отзыв проверяются сервером. Plaintext выдаётся один раз после commit и не пишется в журнал. |
| G3C05 | Проверки отказов/времени/потери ответа/очистки | Повтор после успешного commit не выдаёт новый bearer; после rollback нет половинной identity/receipt. Потерянный ответ требует нового запуска Telegram, как предложено G03-A. |
| G3C06 | Отчёт и карточка семейных привязок/сессий | Оставшиеся PIN, managed/own_child, приглашения/recovery не объявляются реализованными. |

Предлагаемые файлы: src/target/access/identityExchange.ts, src/target/db/schema/access.ts, src/target/contracts/access.ts, migrations/target/0003_identity_exchange.sql и manifest, tests/target/identity-exchange-{contracts,postgres}.test.ts. Сервис и его resolver вызываются тестами; публичный HTTP endpoint и подключение старого UI сюда не входят.

## 2. Условия исполнения и параметры

Для локальных тестов: SP01 300 секунд + допуск 30, SP02 16 KiB/64 поля, SP04 launch 10 минут. Policy/version/часы/random и fixture retention задаются явно. Это разрешение на синтетический блок, не выбор юридической retention-политики. O01/O09 не подменяются тестовыми значениями.

Receipt содержит fingerprint, ссылку на launch, время обмена, minimum cleanup horizon и verification policy revision, без исходных initData/hash/user JSON. Cleanup не может удалить receipt, пока старый материал ещё принимается любой разрешённой policy. Расширение окна freshness требует отдельного cutover (например, минимальный auth_date для новой policy); простая смена числа не должна оживлять использованный вход. Это обязательный негативный тест.

environment/bot_id берутся только из доверенной конфигурации сервиса. Test и production identity-хранилища разделяются средой/БД; поле environment у результата G03-B не доказывает среду выпуска подписи. Нельзя объединить тестовые Telegram ID с настоящими Account. Ограничения и fixtures проверяются на собственной временной PG18.6 с полной очисткой exact container ID по существующему harness.

## 3. Граница разрешения

Только изолированный target-код, следующая миграция и собственная временная БД. Реальный BOT_TOKEN не нужен; demo на localhost:3000 остаётся в текущем режиме. Не отправляются сообщения, не запускаются webhook/cron/бот, не создаются реальные пользователи. Полный G03 продолжится отдельными карточками: семейные binding/session, PIN и оба входа, invitations/recovery, реальный Telegram integration.
