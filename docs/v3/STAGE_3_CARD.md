# Family Life RPG V3 — ограниченная карточка этапа 3.1

Дата: 2026-09-09. Статус: **проект следующего отдельного поручения**. Текущее «делай» разрешило этап 2: контракты и offline-симуляцию. Оно не запускает эту карточку, остальные подэтапы 3 или исторический legacy/target техплан.

Основа: [PRODUCT_CONTRACT_V01](PRODUCT_CONTRACT_V01.md), [COMMAND_CONTRACT_V01](COMMAND_CONTRACT_V01.md), [STAGED_PLAN](STAGED_PLAN.md). Взрослые-игроки, взрослые самоотметки, взрослая проверка детских результатов и реальные награды только детям приняты. Конкретная структура сервера и технические механизмы ниже — проект.

## 1. Единственная цель 3.1

Доказать в **отдельной синтетической БД**, что V3 может хранить Player у взрослого и ребёнка, сохранять семейные границы и проверять актуальные capabilities независимо от игрового/административного статуса. Предоставить исполняемые contract tests без настоящего Telegram-входа, без семейных игровых эффектов и без подключения UI к серверу.

Это фундамент для последующего основного цикла. На выходе 3.1 нельзя объявлять готовыми дела, начисления, кошелёк, покупку, резерв, выдачу реальной награды или публичную авторизацию.

## 2. Изоляция и предполагаемая структура

Все изменения только в worktree `family-life-v3`, ветка `codex/family-life-v3`. Основной `main`, Folio, действующий бот, меню бота, `.env`, существующие `demo_worlds` и `rpg`-таблицы не затрагиваются.

Предлагаемые новые места — согласовать в начале реализации, а не автоматически создать сейчас:

```text
src/v3-server/contracts/       # закрытые DTO, ID/quantity/role/capability validation
src/v3-server/foundation/      # Family, Member, Player; dependency-injected handlers
src/v3-server/access/          # authorizer и интерфейс VerifiedActor/IdentityAdapter
src/v3-server/db/              # отдельный client factory, schema, explicit migrator
migrations/v3/                # только отдельный V3 foundation
tests/v3-server/               # contract и synthetic PostgreSQL integration tests
scripts/v3/verify-foundation.ts # явный test harness; без startup migration/seed/cron
docs/v3/STAGE_3_1_RESULT.md    # фактический scope, evidence, ограничения
```

Ни один `src/v3-server` файл не импортируется browser entry. Новый серверный код не импортирует глобальный legacy DB/config, `src/demo/store`, общий app bootstrap, bot/cron или существующий target child-only Player parser. Низкоуровневый проверенный parser допустимо вынести/переиспользовать лишь после проверки зависимости и одинаковой семантики; переписывать старый контракт на месте нельзя.

Синтетический `FixtureIdentityAdapter` явно помечен `syntheticOnly:true`, доступен только тестовому harness и не экспортируется production HTTP route. Переданная им VerifiedActor не является доказательством Telegram-подписи. Никакого fallback «auth не работает → fixture семья».

## 3. Минимальный объём реализации

| Часть | Конкретный результат 3.1 | За пределами |
|---|---|---|
| Примитивы | Строгие ID/revision/date/quantity, закрытые payload, typed errors и версия `family_life_v3.commands/0.1`. | Новые численные правила баланса и произвольный content scripting. |
| Foundation | Синтетические Account, Family, MemberProfile, Player. Player любой familyRole; один Player данного Member в семье. | Кошельки/XP, task occurrence, питомцы, покупки. |
| Capabilities | Закрытые grants со scope, revision, статусом. Игровые self-права отдельно от family/review/delivery. | Неутверждённая иерархия Parent Owner и права произвольных гостей. |
| Actor contract | Внутренний VerifiedActor; adapter port; проверка family/member/player/session binding и текущей capability revision. | Реальный Telegram exchange, PIN, recovery, приглашения и управление на общем устройстве. |
| БД | Отдельная V3 schema внутри отдельной временной тестовой БД; нужные unique/composite FK/check constraints; explicit migration manifest. | Изменение existing target/legacy schema и импорт реальных данных. |
| Транзакционный guard | Проверка авторизации и актуальности в одной транзакционной границе с тестовым нейтральным probe; revoke/guard race имеет один разрешённый порядок. | Гарантия settlement/ledger/платежной атомарности. |
| Тестовый runner | Запуск на явно разрешённой синтетической БД, ограничения destination, собственные fixture IDs, отчёт и точная очистка созданного. | Авто-migrate при обычном запуске приложения, общий DROP schema/database, долгоживущие сервисы. |

Для проверки TOCTOU допустим **только тестовый** нейтральный probe/write marker внутри собственной fixture области: он доказывает, что revoke и authorize выполняются согласованно. Он не является игровой командой, не выдаёт наград и не добавляется в публичный registry/HTTP.

## 4. Constraints, которые нужно доказать в БД

1. `Player.familyId/memberId` ссылается на Member той же семьи. Adult и child допустимы; у Player нет duplicated role, навязывающей child-only.
2. Уникальность `(familyId, memberId)` для Player; повторное создание не создаёт второй игровой субъект.
3. Grant/session binding не может ссылаться на Member/Player другой семьи даже прямой синтетической SQL-вставкой.
4. Capability — закрытый поддержанный ключ; scope соответствует типу. `completion.review_child` не становится `family.manage`; `shop.purchase_self` не разрешает самовольно выбрать family ownership. Пауза игрового Player сама по себе не отзывает у взрослого отдельные административные grants.
5. Отсутствующий, revoked, paused, left, archived или несогласованный actor context не проходит guard в том состоянии, которое запрещает команду. Отдельно различить возможность читать собственную разрешённую историю и создавать новый эффект.
6. `VerifiedActor` с подменённым family/member/player/capability revision отклоняется. Из body команды невозможно повысить capabilities.
7. После commit revoke старая сессия/привязка не может пройти новую guarded operation; конкурентное действие либо авторизовано до revoke, либо отклонено после него. Нет решения на одном устаревшем UI snapshot.
8. Validation/permission failure не создаёт частичный Foundation record или test probe. Schema migration failure оставляет проверенный исходный manifest version; recovery не считает неуспех применённым.

Конкретный механизм — row lock/CAS либо эквивалент — выбрать и документировать до реализации. Проверять две независимые транзакции/соединения, а не последовательные вызовы одного JavaScript объекта.

## 5. Приёмочная матрица 3.1

Все статусы ниже **не выполнялись** на этапе 2.

| ID | Проверка | Доказательство при завершении 3.1 |
|---|---|---|
| F31-01 | Новый V3 import graph | Нет runtime-зависимости от demo/legacy DB, bot/cron/telemetry и target child-only Player. |
| F31-02 | Adult и child Player | Оба сохраняются и читаются через один контракт; взрослый получает Player без административного bypass. |
| F31-03 | Роль отдельно от прав | Adult без review grant не принимает child probe; child со self-game grant может выполнить self probe. |
| F31-04 | Запрет privilege injection | actor/capabilities/reward fields в клиентском command payload отклоняются как неизвестные; не просто игнорируются. |
| F31-05 | Family scope | Запрос семейного объекта другой семьи возвращает безопасный отказ без её имени/ID состояния. |
| F31-06 | Composite FK | Прямые fixture SQL-записи cross-family member/player/grant/session отклоняются. |
| F31-07 | Два Player одного Member | DB uniqueness выдерживает конкурентную попытку создания. |
| F31-08 | Inactive actor | Revoked/left/archived/paused контексты обрабатываются согласно явно записанной policy; новые игровые probes запрещены. |
| F31-09 | Self-review policy | Ручной own-beneficiary review запрещён; trusted adult self-policy имеет отдельный зарегистрированный decision kind, не client flag. Пока без settlement. |
| F31-10 | Детская реальная награда | Contract eligibility отвергает adult beneficiary независимо от наличия Player/Gold/capability. Пока без order/reserve. |
| F31-11 | Семья с одним взрослым | Доступ/child review не требуют вымышленного второго взрослого; отсутствие взрослого self-review не мешает trusted-self policy. |
| F31-12 | Revoke/authorize race | На двух соединениях проверены оба допустимых порядка, после commit revoke новый probe не появляется. |
| F31-13 | Revoked result access | Старый actor не получает персональный результат/projection под видом retry. Тест не объявляет ledger receipt готовым. |
| F31-14 | Неверные IDs/revisions/количества | Границы integer, decimal/exponent/negative zero, неизвестная схема и дополнительные поля отвергнуты до SQL. |
| F31-15 | Миграция/rollback | Миграция применяется только в собственной синтетической БД; искусственный отказ проверяет manifest и отсутствие частичного нового фундамента. |
| F31-16 | Isolation runner | Не читает project `.env`, не выбирает DB по legacy defaults, явно отвергает неразрешённый destination. |
| F31-17 | Cleanup | Удалены только собственные fixture IDs/созданный самим runner временный контур; соседние контрольные sentinel-данные сохранены. |
| F31-18 | Browser boundary | Сборка UI не содержит server/DB/auth imports и остаётся asset-free. Никакого подключения UI к будущему API. |
| F31-19 | Общие проверки | `npm run lint`, узкие новые unit/PG tests и V3 regression PASS; новые тесты измеряют инварианты, не копируют код implementation. |
| F31-20 | Честный результат | Отчёт разделяет unit/synthetic DB/реальный auth; отсутствие реального Telegram/PIN/recovery/наград явно указано. |

Принятие 3.1 закрывает только эту матрицу. Оно не является приёмкой старых DBT01–DBT20 целиком, уровней G03/G04/G07 или всех следующих пунктов STAGED_PLAN.

## 6. Открытые решения и где они блокируют

| ID | Решение | До какого шага требуется |
|---|---|---|
| Q31-DB | Конкретный независимый local test database/run directory, доступный PostgreSQL runtime и точный безопасный cleanup. | До любого запуска 3.1 с БД. Не использовать реальную семейную БД ради удобства. |
| Q31-SCHEMA | Имя V3 schema/manifest и правило версий; предлагается новый `rpg_v3` только в собственной тестовой БД. | До DDL. Не расширять child-only таблицу `rpg.players` на месте. |
| Q31-GUARD | Lock/CAS, порядок блокировок и policy inactive actors/history reads. | До concurrency tests F31-08/12. |
| Q31-AUTH | Какая часть существующих чистых auth primitives пригодна повторно; как fixture adapter исключается из публичного runtime. | До сборки/экспорта нового access модуля. Реальная identity flow отдельным этапом. |
| Q31-RETENTION | Только явно synthetic retention для тестов; production-сроки/полномочия и обработка данных ещё не утверждены. | Не мешает чистым fixture tests. Обязательное решение до реальных данных/публичного доступа. |
| Q32-CALENDAR | Допустимые performedOn/late submission, переход family zone без повторного period, границы окна. | До 3.2 occurrences; не блокирует Foundation+Capabilities 3.1. |
| Q33-CORRECTION | Ограниченная компенсация spent Gold, waived, восстановление и неизменность прав. | До correction commands 3.3; наличие описанного проекта не считается готовой реализацией. |
| Q33-PET | Техническая реализация согласованного рабочего PetXpDestination: none → effective PetXP0, starter choice, новые работы после выбора; сроки материализации в симуляции. | До включения pet effects; offline projection не разрешает recipient fallback или ретроначисление. |
| Q35-REWARD | Reserve до delivery, порядок отмены после одобрения, ложная отметка delivery и возврат как отдельная correction. | До 3.5 реальных обещаний. Child-only eligibility уже принято. |
| Q34-CATALOG | Личная оплата взрослым семейного декора и точные права owner/purchaser. | До соответствующей покупки; не задаётся картинкой мебели. |
| Q-PRODUCTION | Реальный вход, устройство/возраст/регион выпуска, политика данных, миграционный/import plan, hosting и bot menu. | До любого публичного runtime/реальных данных. Не включается в карточку 3.1. |

Эти зависимости не возвращают на обсуждение уже принятых взрослых-игроков и child-only реальных наград. Каждая блокирует только указанный зависимый шаг; наличие открытых Q32/Q34/Q35 не повод автоматически расширить или остановить независимую 3.1.

## 7. После 3.1 — отдельные ограниченные карточки

- **3.2:** recurrence/occurrence snapshots, explicit shares, submit/return/resubmit, trusted adult self-acceptance policy и child review. При отмене с pending — отказ без частичного изменения. Никаких притворных начислений до работающего settlement.
- **3.3:** atomic settlement, личные reward ledger/progress и permanent claim uniqueness; duplicate/new-request-ID, две проверки, потерянный ответ и коррекции. Разрешение на 3.1 не создаёт кошельки автоматически.
- **3.4:** виртуальные покупки и ownership, бесплатный стартовый выбор, известные питомцы и уголок; получение и применение различимы. Quotes и concurrent spend требуют собственной матрицы.
- **3.5:** child-only real reward order/reservation/delivery и одна общая цель. Транзакции, отмена/выдача, исходный вклад и однократное достижение проверяются отдельно.
- **3.6:** реальный вход и испытания устройств, потерянный ответ и восстановление сессии по отдельной карточке. Подключение UI к проверенным командам выполняется в соответствующих подэтапах. Графика, сезоны и платежи сохраняют этапы 5–7; публикация требует собственного готового результата.

Каждая карточка должна назвать точный объём изменения, исходный commit, собственную тестовую область, команды проверки и фактические доказательства. Ни утверждение DTO, ни зелёный тест parser, ни offline-simulation не заменяют проверку реализованного перехода в своей транзакционной и пользовательской среде.
