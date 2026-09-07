# G03-F — результат восстановления и семейного lifecycle

Версия 1.0, 2026-09-07. **Разрешён сообщением «делай». G3F01–G3F07 выполнены
в серверной синтетической среде; результат на приёмку.** Основа — [карточка G03-F](G03_RECOVERY_LIFECYCLE_CARD.md)
и [матрица переходов](../security/RECOVERY_LIFECYCLE_TRANSITIONS.md).

## Реализованный объём

| Область | Результат |
|---|---|
| Recovery | Verified launch фиксирует Account/identity кандидата. Подтверждение — конкретный действующий recovery credential или другой взрослый с новым PIN. Новый PIN вводится дважды; KDF вне family lock, затем повторная проверка всех оснований. |
| Область восстановления | Создаётся новая adult binding того же parent profile. Старые записи Account/ExternalIdentity/binding и история действий не переписываются. Старые семейные сеансы, managed descendants, PIN и код отзываются; самостоятельный вход ребёнка и другие семьи сохраняются. |
| Ответ после commit | Заранее выданный request bearer становится ограниченным setup bearer. getSetup сообщает новую binding; потерянный код заменяется rotatePendingRecovery. После подтверждения нового кода — обычный login. beginSetup по одному Telegram не обходит ограничение recovery setup. |
| Приглашения | Выдача и одобрение точного verified candidate требуют нового PIN. Одобрить может любой действующий взрослый семьи; issuer также повторно проверяется. Секрет приглашения сам не даёт членства. Один candidate, approval и consumption с CAS; existing child получает own_child binding, adult_join — один parent profile и binding без игровых сущностей. |
| Потерянный claim | Тот же verified Account/identity может получить новый candidate bearer; прежний bearer гасится. Candidate Account/identity и первоначальный launch остаются неизменными. Старое expected revision нельзя использовать для одобрения. |
| Управление составом | Самостоятельный выход и исключение с новым PIN самого target дают одинаковый результат. Нужен другой active adult с завершённой защитой и действующим Account. Pending/disabled преемник не подходит. |
| Незавершённые процессы | Выход и recovery закрывают незавершённые запросы, приглашения и одобрения затронутой binding. Одобрение можно явно отозвать. Истечение проверяется при каждом запросе. |
| Сеансы другого взрослого | revokeAdultSessions закрывает все его adult contexts и descendants, сохраняя membership. Общая квота пары с индивидуальным отзывом G03-E предотвращает обход лимита сменой команды. |
| Идемпотентность и аудит | Operation UUID, intent digest, actor binding и immutable события. Повтор consumption не создаёт профиль повторно. После выхода отозванный bearer не оживает; результат своей операции можно проверить новым verified launch. |
| Политика | Security digest включает версию протокола G03-F. При переходе с G03-E требуется явная активация следующей family policy revision; несовместимые процессы не делят полномочия после cutover. Никакой автоматической активации на настоящей БД. |

Код: [accessLifecycle.ts](../../src/target/access/accessLifecycle.ts),
[storage](../../src/target/db/schema/accessLifecycle.ts),
[closed records](../../src/target/contracts/accessLifecycle.ts).

## Отображение принятого PDB на реализацию

Реализованы две выделенные таблицы чувствительного контура вместо отдельных
однотипных таблиц под каждое состояние процесса:

- `lifecycle_requests` содержит закрытые варианты `recovery`, `invite_child`,
  `invite_adult`, `exclusion`; SQL CHECK определяет допустимые источники, роли,
  candidate, основание и результат каждого варианта. Это storage-представление
  FamilyInvitation/RecoveryRequest, не универсальный исполняемый workflow.
- `lifecycle_events` хранит отдельные неизменяемые решения/события: actor binding,
  candidate Account, серверное время, action/outcome, operation UUID и digest.
  `approve` и `exclude` — проверяемые Decision этих процессов; общая таблица решений
  будущих игровых модулей этим не реализована.
- Происхождение новой binding фиксируется уникальным `result_binding_id` запроса
  и событием consumption. Зарезервированное поле `origin_invitation_id` схемы G03-D
  остаётся закрытым для записи; обратная связь даёт проверяемый источник без
  изменения уже принятой миграции. Для completed recovery/invite operation ID
  равен ID запроса; API-проекция возвращает его явно.
- `claimed/approved/consumed` соответствуют pending/authorized/completed recovery.
  `revoked` закрывает отмену/выход; expired — вычисляемое условие `now >= expires_at`,
  не зависимость от cron. Контракты домена сохраняют смысл этих состояний.

Миграция `0006_access_lifecycle.sql` добавляет таблицы, индексы и composite FK.
Миграции 0001–0005 не переписываются. Candidate/issuer/target и код связаны с
конкретной семьёй; SQL NULL-переходы не заменяют обязательные доказательства.

## Ограничения и проверка

Числа берутся из versioned security config G03-E: setupSeconds и отдельные
sourceWindowSeconds/sourceAttemptMax. Ошибки recovery-кода учитываются по candidate
в семье независимо от PIN-лимитера. Перед KDF сохраняется событие `prepare`
(разрешение начать вычисление); оно ограничивает повторные попытки даже при rollback
финального commit. Нативный KDF по-прежнему ограничен двумя работами на процесс/БД.

Проверены рекомендации [OWASP Forgot Password](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html):
случайные одноразовые секреты, отдельное ограниченное восстановление, двойной ввод
нового секрета, обычный вход после смены и инвалидирование прежних сеансов.
Согласие второго взрослого и исключение по согласию — правила продукта A10–A16.

| Проверка | Фактический результат |
|---|---|
| Полная target-регрессия | 289 passed, 15 файлов; собственная PostgreSQL 18.6. |
| Новые проверки G03-F | 30 PostgreSQL-сценариев и 21 проверка закрытых records. |
| Прежняя регрессия | 250 passed, 9 opt-in PostgreSQL skipped. |
| lint / target:typecheck / target:build | PASS. |
| Импорт ESM | PASS; без запуска сервера или подключения к БД. |
| Миграции | 0001–0004 совпадают с HEAD; 0005 совпадает с прежним generated DDL; все checksum manifest верны. 0006/catalog/negative SQL/rollback проверены. |
| Cleanup | Exact-ID удаление временного контейнера подтверждено harness. |
| Браузер / health | localhost:3000 недоступен, CUA ERR_CONNECTION_REFUSED и curl connection refused. UI этим этапом не проверен. |
| Удалённый CI | Настроенный target job включает новый build и общий harness; удалённо не запускался. |

Проверены два pool, конкурирующие кандидаты и взрослые, повтор после создания
нового service, rollback setup/profile/audit, stale identity/profile/approval/policy,
общий лимит отзывов, disabled/pending successor, смена pepper без старого PIN-ключа,
конкуренция команды и выхода. Доказательства — [work/g03-f](../../work/g03-f/verification.json).
Новых зависимостей в G03-F нет; требование target Node 24.7+ унаследовано от G03-E.

Полные ранние прогоны выявили инфраструктурный дефект harness: `pg_wal` заполнил
tmpfs 256 MiB и PostgreSQL завершился с `No space left on device`. Подтверждено
логом точного тестового контейнера, не предположением о бизнес-коде. Harness
получил tmpfs 512 MiB, `min_wal_size=32MB` / `max_wal_size=64MB` и безопасную
классификацию ошибок без вывода SQL/параметров. Параметры checkpoint описаны в
[PostgreSQL 18 WAL](https://www.postgresql.org/docs/18/runtime-config-wal.html).
Durability-настройки не отключались. После исправления полный прогон прошёл;
после заключительной проверки равноправного approval — повторно 289 passed.

Нет HTTP endpoints, UI, bot messaging, настоящих семей, реальных ключей, миграции
данных или deploy. Кошелёк, подарки и покупки ещё не реализованы в target; доказано
сохранение существующего Player и отсутствие повторного создания игровых сущностей,
а не проверка будущих экономических сервисов. Производственные consent/retention,
O01/O09/QDB01/O13 и live Telegram остаются открытыми зависимостями.

Следующий этап — [G03-G: transport и синтетические сквозные проверки](G03_TRANSPORT_CARD.md),
по отдельному разрешению. Полный G03/W11 этим этапом не закрывается.
