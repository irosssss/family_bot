# Family Chores RPG — проект физической модели PostgreSQL

Версия 1.1, 2026-09-07. **PDB01–PDB08 приняты пользователем как проектная основа с открытыми зависимостями.** DAT01–DAT08 и логические словари приняты пользователем. Этот пакет уточняет физическое хранение; семейный SQL/Drizzle-срез реализован в G02-B, остальные таблицы остаются проектом. Основа: [форматы](DATA_CONTRACT.md), [runtime-поля](RUNTIME_DICTIONARY.md), [контент](CONTENT_DICTIONARY.md). Дополнения: [транзакции](TRANSACTIONS.md), [карта переноса](MIGRATION_MAP.md). [Asset Bible ART01–ART08](../art/ASSET_BIBLE.md) принята как спецификация. [PIPE01–PIPE08](../content/CONTENT_PIPELINE.md) приняты, включая уточнение согласованной активации набора пакетов. Версия 1.1 отражает это в разделе 5. [План IMP01–IMP08](../IMPLEMENTATION_PLAN.md) принят; [G02-A](../implementation/G02_FOUNDATION_RESULT.md) реализован и проверен в служебном объёме; базовые семейные таблицы [G02-B](../implementation/G02_DOMAIN_SCHEMA_RESULT.md) реализованы и проверены, готовы к приёмке.

## 1. Независимая оценка и решения

| ID | Предложение | Последствие / цена сопровождения |
|---|---|---|
| PDB01 | Одна PostgreSQL, новые SQL-схемы `rpg` и `content`, существующие public-таблицы сохраняются на время перехода. | Явная граница legacy/целевой модели; один набор транзакций. Две схемы не являются двумя БД или доказательством изоляции доступа. |
| PDB02 | Runtime UUIDv7, content text-ID; семейные связи через составные FK; состояния text + CHECK, суммы bigint с явными границами. | Ошибочный FK в другую семью отклоняется БД; полномочия чтения/действий проверяются отдельно. Новое состояние требует миграции CHECK, не бесконтрольного текста. |
| PDB03 | Связи, суммы, статусы и ключи уникальности — колонки/дочерние таблицы; закрытые снимки и редко фильтруемые параметры — JSONB. | Не переносить целый demo_worlds.state в production. JSONB не заменяет FK, денежный журнал или проверку схемы. |
| PDB04 | MVP сериализует мутации одной семьи блокировкой её строки; бизнес-уникальность и журналы защищают эффекты дополнительно. | Проще согласовать отзыв доступа, дела, квоты и BEN. Параллельные семьи работают независимо; очереди одной большой семьи измеряются, перед дроблением блокировок нужен новый аудит. |
| PDB05 | Кошелёк и XP имеют проверяемые проекции; эффекты/компенсации записываются отдельно. Постоянная уникальность источника переживает очистку транспортных квитанций. | Есть пересчёт и диагностика расхождений; полноценный event sourcing всего приложения не требуется. |
| PDB06 | Перенос по схеме «инвентаризация → staging → сверка → ограниченный cutover» с одним источником записи на семью. | Нельзя одновременно награждать в legacy и целевой модели. После новых целевых операций простой откат на старый баланс запрещён. |
| PDB07 | Подтверждённый импорт получает собственное происхождение; неполные данные изолируются до решения. Для старого питомца не выдумывается яйцо. | Предлагаемое расширение DAT: origin для импортированного питомца и отдельные записи начального остатка/истории. Не разрешение автоматически переносить имущество или суммы. |
| PDB08 | Ассеты сейчас только демо; новые каталоги и production-файлы выпускаются отдельно, соответствия принимаются явно. | Старый PNG/slug не становится production-ID; техническая совместимость не означает художественную приёмку. |

Проверено чтением исходников: существующая Drizzle-схема смешивает пользователя, Telegram ID, роль и баланс в `users`; отдельная локальная демо хранит мир JSONB. Не проверены фактическая подключённая БД, её строки, версия сервера и применённые миграции. Поэтому таблицы ниже — целевой проект, не описание уже работающей production-БД.

## 2. Правило вывода колонок из словаря

Скалярное поле из принятых словарей становится одноимённой колонкой по следующей таблице, если разделы 3–5 не задают нормализацию/проекцию. Общие группы I/M/F/P/E/R разворачиваются по DATA_CONTRACT. `!` → NOT NULL, `?` → nullable SQL-колонка; полный DTO всё равно содержит явный null. Поля, вынесенные в дочерние таблицы, не дублируются одновременно изменяемым JSON-массивом.

| Логический тип | SQL / Drizzle-представление | Ограничения |
|---|---|---|
| EntityId, Ref runtime | `uuid`; Drizzle uuid | Сервер генерирует UUIDv7 до вставки; не используем serial и не требуем серверной функции генерации. UUID-тип сам не ограничивает версию: формат v7 валидируется адаптером/согласованным CHECK в DDL. |
| ContentId, Key, TextKey | `text`; text | CHECK формата + FK в соответствующий реестр там, где это ссылка. Идентификаторы сравниваются без языкового преобразования/смены регистра; collation для технических ключей C. |
| UInt | `bigint`; bigint mode bigint внутри сервера | 0…9223372036854775807; JSON decimal string. Клиентская схема отвергает дроби/экспоненту до приведения SQL-типа. |
| Int (дельта) | `bigint`; bigint mode bigint | Симметричный диапазон −9223372036854775807…9223372036854775807, чтобы отрицание было определено; запись эффекта ненулевая. Суммы проверяются на переполнение до присваивания кеша. |
| Revision, SchemaVersion | `integer`; integer | 1…2147483647. Это технический предел формата, не игровой баланс; исчерпание требует контролируемой миграции, не wraparound. |
| SmallInt | `integer`; integer | Название логического типа не означает SQL smallint; CHECK конкретного поля: пиксели >0, ISO-день 1–7, индекс ≥0. |
| Instant | `timestamptz(3)`; timestamp withTimezone, mode string | UTC на wire. Значения нормализуются до миллисекунд до хранения. Сроки включают начало и исключают конец. |
| LocalDate | `date`; date mode string | Семейный день не выводится из timezone SQL-соединения. |
| ZoneId | `text` | Проверяется актуальным выбранным timezone-адаптером; сохранённые starts/ends остаются историческими фактами. |
| Boolean / Enum | `boolean` / `text` | NOT NULL при !; enum через именованный CHECK с закрытым набором значений конкретной версии. |
| Text / PackageVersion | `text` | Текстовые лимиты и SemVer-парсер перед DDL/API; UGC не индексировать целиком по умолчанию. |
| Digest | `<prefix>_algorithm text`, `<prefix>_value text` | Обе null либо обе ненулевые; sha256 требует длины/алфавита. Хеш не заменяет проверку прав на ресурс. |
| ContentRef | `<prefix>_definition_id text`, `<prefix>_content_revision integer` | Составной FK → content.revisions; optional-пара через MATCH FULL либо CHECK «оба null/оба not null». |
| AssetRef / RegistryRef | Пара text-ID + integer revision | Составной FK → assets / registry_revisions. Для RegistryRef ID столбца registry_id. |
| TypedPayload | `<field> jsonb` | Конверт contract_id/schema_version/value, JSON-object CHECK + закрытая схема в редакторе/сервере. `$type<T>` в TypeScript сам JSON не проверяет. |

BIGINT выбран как конечная техническая ёмкость, не обещание бесконечных накоплений. Масштабирование срока жизни обеспечивается миграциями типов/форматов. Для расчёта сверки SUM(bigint) может возвращать numeric: результат нельзя автоматически превращать в Number. SQL и wire-типы проверяются отдельными boundary-тестами.

Семейная таблица имеет `UNIQUE(family_id,id)` в дополнение к PK(id), чтобы внешний ключ мог включить семейную область. Таблицы личного игрового владения также публикуют `UNIQUE(family_id,owner_profile_id,id)` для FK предмета/питомца в выборе. Избыточные индексы возникают намеренно для FK и пересматриваются после измерений, не удаляются как «дубли» без проверки зависимостей.

Временные поля не получают `now()` там, где это исторический момент переноса. У новых записей created_at задаётся сервером; у импортированных отдельно фиксируются migrated_at и известное source_created_at. Неизвестное исходное время не заменяется «сейчас» под видом исторического факта.

## 3. Таблицы runtime

Во всех строках поля полностью наследуются из одноимённой сущности RUNTIME_DICTIONARY по правилу раздела 2. Здесь заданы физические имена, PK/FK, уникальности и исключения хранения. `U(...)` = именованная UNIQUE, `PU(...) where ...` = частичный уникальный индекс, `F` = family_id, `P` = owner_profile_id. PK(id uuid) по умолчанию. FK на родителя по умолчанию NO ACTION; автоматического CASCADE от удаления семьи на всю историю нет.

Группа E физически разносится между effect_records и subtype-таблицей с тем же id: cause/operation/source находятся в effect_records, дельта и предметные поля — в subtype. В DTO это один логический эффект. ActorContext хранится закрытым snapshot с проверенными ссылками, а не входным клиентским JSON. CalendarSnapshot и QuantitySet разворачиваются в колонки; копия в неизменных terms служит снимком и проверяется на совпадение при записи. Произвольное расхождение двух представлений не допускается.

| Сущность → таблица `rpg.*` | Ключи и ссылки | Физические уточнения |
|---|---|---|
| Account → accounts | PK(id) | Без F; минимальное состояние входа. |
| ExternalIdentity → external_identities | account_id → accounts; U(provider,subject) | Повторное использование отозванной идентичности только отдельной проверенной привязкой той же устойчивой записи, не второй активной копией. |
| Family → families | PK(id) | calendar_revision, membership_revision, state_revision независимы; строка — точка блокировки семейных мутаций. |
| MemberProfile → member_profiles | F → families; U(F,id); U(F,id,family_role) | Роль parent/child. Name не уникальный вход; left/archived не удаляет запись. |
| AccessBinding → access_bindings | FK(F,profile_id) → member_profiles; account_id → accounts; manager_binding_id → access_bindings | PU(F,profile_id) where active and kind=own_child; PU(F,profile_id) where active and kind=adult_membership; PU(F,profile_id,account_id) where active and kind=managed_child. Manager той же семьи/Account проверяется командой. |
| SessionContext → sessions | FK(F,binding_id) → access_bindings; parent_session_id → sessions | Account/profile проверяются составными доступными ключами привязки и командой; никаких токенов в projections. Секретный реестр отдельно. |
| FamilyInvitation → family_invitations | FK(F,issuer_profile_id), FK(F,target_profile_id); candidate_account_id → accounts | Token verifier lookup уникален в закрытом контуре; финальное потребление однократно. Decision вынесен в decisions. |
| AdultAccessProtection → adult_access_protections | FK(F,adult_profile_id), FK(F,adult_binding_id); PU(F,adult_profile_id) where active | Защищённые verification данные не в обычном семейном SELECT. |
| RecoveryCredential → recovery_credentials | FK(F,protection_id), FK(F,adult_profile_id) | PU(protection_id) where active; secret verifier в закрытом хранилище. |
| RecoveryRequest → recovery_requests | FK(F,adult_profile_id), candidate_account_id → accounts; credential_id → recovery_credentials | Отдельная запись проверенного кандидата; authorized не обычная сессия. |
| TaskDefinition → task_definitions | FK(F); current_revision FK(F,id,current_revision) → task_definition_revisions | Циклический указатель ревизии проверяется DEFERRABLE FK при коммите создания. |
| TaskDefinitionRevision → task_definition_revisions | U(F,definition_id,revision); FK(F,definition_id) | Terms snapshot jsonb; исходные назначения и расписание также нормализованы для генератора. |
| TaskOccurrence → task_occurrences | FK(F,definition_id,definition_revision); U(F,definition_id,local_date) | Calendar в колонки, terms jsonb, GoalBinding в явные колонки. Ревизия задания не входит в уникальность дня. |
| ParticipantAllocation → participant_allocations | FK(F,occurrence_id); U(occurrence_id,share_index); U(occurrence_id,original_profile_id) | Original/current profile отдельные FK; coins/xp/contribution в bigint-колонках. Current_profile не unique: BEN допускает разные реальные доли одному ребёнку. |
| CompletionAttempt → completion_attempts | FK(F,allocation_id); U(allocation_id,attempt_number) | PU(allocation_id) where status=submitted. Неизменные snapshots + ссылка на decision; другие attempts сохраняются. |
| CompletionSettlement → completion_settlements | U(allocation_id); FK(F,allocation_id), FK(F,accepted_attempt_id), FK(F,beneficiary_profile_id) | Effect_links — дочерние effect_links, не изменяемый массив. Попытка должна принадлежать этой allocation. |
| Wallet → wallets | U(F,P,currency_key); FK(F,P) → players | CHECK(posted_balance≥reserved_balance≥0); available вычисляется, не хранится отдельно. |
| WalletEntry → wallet_entries | FK(F,wallet_id); original_entry_id → wallet_entries | Effect ID связан с общим effect_records; delta ≠0. Runtime-роль не UPDATE/DELETE сумм. |
| Reservation → reservations | U(reward_order_id); FK(F,wallet_id), FK(F,reward_order_id) | Amount не меняется после создания; capture_entry_id уникален при наличии; CHECK согласования status/finished_at. |
| ProgressGrant → progress_grants | FK(F,P) → players; original_grant_id → progress_grants | effect_kind + xp_delta bigint nullable / unlock ContentRef nullable, CHECK ровно нужного варианта; wire TypedPayload собирается из колонок. |
| StarterPetChoice → starter_pet_choices | U(F,P); FK(F,eligible_settlement_id); FK(F,egg_acquisition_id) | Options — starter_choice_options; selected option FK внутри списка этого выбора. |
| ShopOffer → shop_offers | PK(id); F nullable только global | scope_kind + F CHECK; global quote проверяется командой без фиктивной семьи. |
| ShopOfferRevision → shop_offer_revisions | U(offer_id,revision); offer_id → shop_offers | price bigint, content FK; eligibility jsonb; условия immutable. |
| Purchase → purchases | FK(F,P) → players; FK(offer_id,offer_revision) → shop_offer_revisions | Только виртуальные предметы; реальные обещания — reward_orders. Права/яйцо через дочерние purchase_grants и FK. |
| RewardOffer → reward_offers | FK(F); current_revision FK → reward_offer_revisions | Только семейное предложение, взрослый — автор команды. |
| RewardOfferRevision → reward_offer_revisions | U(F,offer_id,revision) | price/mode колонки, terms jsonb; recipients/limits вынесены для FK и квот. |
| RewardOrder → reward_orders | FK(F,P) → players; FK(F,offer_id,offer_revision); PU(F,P,offer_id) where status in requested,purchased,scheduled | reservation/debit/fulfillment FK могут быть отложены до коммита общего перехода. Исходные price/mode обязательны независимо от текущего предложения. |
| RewardQuotaBucket → reward_quota_buckets | U NULLS NOT DISTINCT(F,offer_id,rule_key,scope_profile_id,period_key) | Null profile обозначает family scope; не допускает несколько семейных buckets с null. Границы периода неизменны. |
| RewardQuotaClaim → reward_quota_claims | U(bucket_id,order_id); FK(F,bucket_id), FK(F,order_id) | Held/consumed/released и limit_snapshot; баланс квоты проверяется под семейной блокировкой. |
| RewardFulfillment → reward_fulfillments | U(order_id); FK(F,order_id) | Decisions в отдельной истории; mark_reversed не создаёт денежный эффект. |
| CorrectionCase → correction_cases | FK(F); typed source → operation_sources | Adjustments в correction_adjustments, ссылки на реальные эффекты; source_revision и reason обязательны. |
| BeneficiaryCorrection → beneficiary_corrections | U(allocation_id); FK(F,allocation_id/from_profile_id/to_profile_id) | Один case на источник MVP; отклонённая подготовка не расходует право применения, повтор подготовки переиспользует case с новой ревизией. Undo фиксируется отдельной операцией. |
| OwnedEntitlement → owned_entitlements | U(F,P,ownership_key); FK(F,P) → players; content FK | Сохранённая ревизия права; несколько уголков используют одну строку. |
| ConsumableBalance → consumable_balances | U(F,P,stack_key); FK(F,P) → players | 1.1; stack_key ContentId из типа, content revision для поведения отдельно. Остаток/история не умножаются при выпуске новой картинки. |
| EggAcquisition → egg_acquisitions | U(collection_claim_id); FK(F,P,collection_claim_id) | Одна строка удержания коллекционной позиции, до/после вылупления. |
| OwnedPet → owned_pets | U(collection_claim_id); FK(F,P,collection_claim_id); U(egg_acquisition_id) при наличии | Единственный питомец ключа; импортный origin PDB07 ниже, не поддельное яйцо. |
| AppearanceSelection → appearance_selections | FK(F,P) → member_profiles; PU(F,P) where target_kind=hero; PU(F,pet_id) where target_kind=pet | Pet FK включает владельца; slots в appearance_slots. Parent не получает player/кошелёк ради рендера базового образа. Дополнительные права редактирования не вводятся. |
| PetCorner → pet_corners | U(pet_id); FK(F,P,pet_id) → owned_pets | Base ContentRef + corner_slots; создаётся с питомцем. |
| ActiveCompanion → active_companions | U(F,P); FK(F,P,pet_id) → owned_pets | Nullable pet_id означает отсутствие спутника; не набор флагов is_active по всем питомцам. |
| FamilyGoal → family_goals | PU(F) where status=active | current_amount проекция; content/reward exact FK; target >0; unlock остаётся после коррекции. |
| GoalContribution → goal_contributions | FK(F,allocation_id), FK(F,beneficiary_profile_id), FK(F,goal_id) nullable | delta bigint; explicit binding_state; original FK и operation FK. Парные BEN-эффекты не увеличивают итог. |
| HouseUnlock → house_unlocks | U(F,unlock_key); FK(F,goal_id) nullable; content FK | Сохраняется после исправления начисления. |
| HouseConfiguration → house_configurations | U(F) | Base FK + house_slots; люди собираются из разрешённой проекции, не копируются JSON-семьёй в дом. |
| FamilyLifecycleRequest → family_lifecycle_requests | FK(F); PU(F) where status in pending,approved | consents и взрослые snapshot в дочерних таблицах; membership_revision обязателен. |
| DataExportRequest → data_export_requests | FK(F); profile scope FK при наличии | Process steps, artifact refs/TTL; файл не хранится в jsonb запроса. |
| DataErasureRequest → data_erasure_requests | FK(F); profile scope FK при наличии | Versioned plan jsonb + steps; не CASCADE по одному запросу с клиента. |
| OperationReceipt → operation_receipts | FK(F,operation_id) → operations; U(F,principal_key,command_key,idempotency_key) | id=operation_id; wire result собирается из ограниченных ссылок. Очистка receipt не удаляет operation/effect uniqueness. |

## 4. Служебные и дочерние таблицы runtime

Эти таблицы реализуют уже нужные связи/инварианты. Не все являются отдельными игровыми сущностями или отдельными API. Relation-строка использует естественный составной PK; новые самостоятельные сущности получают UUID. У всех персональных строк явная принадлежность политике хранения; для дочерних допускается однозначное наследование R родителя, не самостоятельный бессрочный срок.

| Таблица | Минимальные колонки / ключи | Назначение |
|---|---|---|
| players | id uuid PK, F uuid, profile_id uuid, role text CHECK child; U(F,profile_id); FK(F,profile_id,role) → member_profiles | Детская игровая область; owner_profile_id FK направлен на (F,profile_id). Не новый персонаж/дублирование Account. |
| player_progress | F, P, xp bigint CHECK≥0, state_revision integer; PK(F,P), FK → players | Проверяемый XP-cache; уровень вычисляется по принятой версии правила. |
| operations | id uuid PK, F uuid, command_key text, actor_kind text, actor refs, outcome text committed/rejected, recorded_at timestamptz, R | Долговечный минимальный результат операции, без тела HTTP и секретов. У rejected нет effects; это проверяется вместе с subtype-целостностью. |
| operation_sources | id uuid PK, F uuid, source_kind text; U(F,id,source_kind) | FK-реестр источников вместо неподконтрольного source_type/source_id. Поддерживаемые таблицы связывают свой id с записью источника; соответствие subtype контролируется командой/constraint trigger. |
| effect_records | id uuid PK, F, operation_id, source_id, source_kind, effect_kind, effect_key; U(source_id,effect_key) | Базовая запись эффекта и тип; денежный/progress/goal subtype FK(id,F,effect_kind). Type-specific delta хранится в subtype. |
| effect_links | F, source_id, effect_id, relation_kind; PK(source_id,effect_id,relation_kind) | Состав результатов settlement/correction; effect_id FK на реальный реестр, без ложного polymorphic FK. |
| correction_adjustments | id uuid PK, F, case_source_id, phase text, original_effect_id, result_effect_id nullable, requested/applied/waived bigint | CHECK requested=applied+waived без переполнения через numeric при сравнении; case/phase/original уникальны, ссылки семейные. |
| decisions | id uuid PK, F, source_id, operation_id, outcome, reason nullable, decided_at, actor snapshot, R | История решений; родитель хранит ID актуального решения, прошлые не переписываются. |
| task_revision_shares | F, definition_id, revision, profile_id, coins/xp/contribution bigint; PK(definition_id,revision,profile_id) | Назначения для будущих открытий; при открытии копируются в allocations. |
| task_revision_weekdays | definition_id, revision, iso_weekday integer; PK всех трёх | Weekly schedule с несколькими выбранными днями, CHECK 1–7. |
| starter_choice_options | choice_id, definition_id, content_revision; PK всех трёх | Проверяемая конкретная опция выбора. |
| reward_offer_recipients / reward_offer_limits | F, offer_id, revision + profile_id / rule_key, scope, period, maximum | Составные PK на ревизию и получателя/правило; оригинальное обещание не теряется после edit. |
| purchase_grants | F, purchase_id, entitlement_id nullable, egg_acquisition_id nullable; PK(purchase_id,grant_index) | grant_index integer≥0; CHECK ровно одна FK; входной тип товара ограничивает число и тип выходов. |
| pet_collection_claims | id uuid PK, F, P, collection_key text, created_at, R; U(F,P,collection_key) | Общая уникальность для яйца и питомца, которую нельзя обеспечить двумя независимыми UNIQUE в разных таблицах. |
| appearance_slots / corner_slots / house_slots | parent_id, F, P где лично, slot_key, entitlement_id / unlock_id | PK(parent_id,slot_key); FK на родителя, owner и право; только одна соответствующая разновидность права. Совместимость сверяется по pinned revision. |
| lifecycle_voters / lifecycle_consents | request_id, request_revision, F, adult_profile_id + решение/время/protection_revision/operation_id | PK(request_id,request_revision,adult_profile_id); FK consent → voter. Старые согласия остаются историей, не считаются для нового состава. |
| process_steps | id uuid PK, F, request_source_id, step_key, attempt, state, times, error_code, evidence_ref, R | U(request_source_id,step_key,attempt); повтор воспроизводим, evidence без экспортируемой личности. |
| consumable_entries | id uuid PK/F/P/effect ID, balance_id, delta bigint≠0, original_entry_id nullable | 1.1, история расхода/поступления. |
| secret_verifiers | id uuid PK, F nullable при глобальном входе, kind, protected_verifier, credential_revision, lifecycle timestamps, policy reference | Закрытая storage-модель verifier_ref; параметры защиты/ограничения перебора ещё security-этап. Runtime API не возвращает эти поля. |
| retention_policy_revisions | policy_id text, revision integer, purpose/category/trigger, policy_payload jsonb, schema_version; PK(policy_id,revision) | Неопределённый срок не превращается в бессрочную production-политику. |

Операции до создания семьи имеют отдельный access receipt/operation scope с account или проверенным challenge вместо F. Конкретный протокол остаётся зависимостью O09; фиктивная семья или ID ребёнка вместо подтверждения личности запрещены.

## 5. Контентные таблицы `content.*`

| Сущность → таблица | PK / колонки связей | Особенности хранения |
|---|---|---|
| ContentDefinition → definitions | PK(id text) | Kind/status/current_published_revision; ссылка current FK на revisions с отложенной проверкой при публикации. |
| ContentRevision → revisions | PK(definition_id,content_revision) | Все scalar-поля словаря + properties jsonb; опубликованные UPDATE/DELETE запрещены runtime-ролью и publication-правилом. |
| AssetRevision → asset_revisions | PK(asset_id,asset_revision) | Геометрия jsonb с закрытой схемой, width/height/byte_size/digest отдельными колонками; уникальность storage_key версии. Runtime binary вне PostgreSQL. |
| ContentPackage → packages | PK(id text) | Purpose/status, без семьи. |
| PackageRelease → package_releases | PK(package_id,package_version) | Manifest jsonb с digest; точные ссылки дополнительно в release members для FK. |
| ReleaseActivation → release_activations | PK(id uuid); U(scope_key,package_id) | Проекция текущего пакета внутри согласованного snapshot; не независимый переключатель. История переходов в activation_changes. |
| ActivationSnapshot → activation_snapshots | PK(snapshot_id uuid), scope_key, schema_version, compatibility_ref, snapshot_digest, created_at, operation_id | Неизменный полный набор; exact package refs/digests дополнительно в snapshot_packages для FK. Принято PIPE06. |
| ActivationHead → activation_heads | PK(scope_key), snapshot_id FK, state_revision | Единственная управляющая ссылка текущего набора; CAS по expected revision, MVP global scope. |
| ActivationChange → activation_changes | operation_id PK, previous_snapshot_id FK nullable для первого включения, next_snapshot_id FK, reason, actor_ref, activated_at | Управляющая история; не эффекты личных кошельков. |
| RegistryRef targets → registry_revisions | PK(registry_id,revision), schema_version, registry_kind, payload jsonb, published_at | Общий конверт версий visual/profile/type/compatibility/palette/rights; kind проверяется при каждой конкретной ссылке. |
| TaxonomyNode → taxonomy_nodes | PK(registry_id,revision,node_id); parent FK на тот же snapshot | Циклы проверяются валидатором выпуска, не строковым CHECK. |
| TagDefinition → tag_definitions | PK(registry_id,revision,tag_id) | Content tags вынесены в revision_tags с FK. |
| ContentTypeRegistry / CompatibilityRule / SlotDefinition / VisualProfile | registry_revisions + registry_slots(profile_id,revision,slot_key PK, target_kind,required,layer_order) | Полный payload хранит спецификацию; slots вынесены для поиска/проверки. Не создаём столбец под каждую новую причёску. |
| LocalizationKey → localization_keys | PK(text_key), namespace, meaning, context, argument_spec jsonb, deprecated | Эволюция смысла несовместимого ключа требует нового ключа. |
| LocalizationBundle → localization_bundles | PK(bundle_id,revision,locale), schema_version,fallback_locale,digest | Опубликованный snapshot, без UGC семьи. |
| LocalizedMessage → localized_messages | PK(bundle_id,revision,locale,text_key); FK key и bundle | Text/message/syntax/status; проверка placeholders до публикации. |
| SourceCredit / RightsRecord → registry_revisions kinds source_credit/rights_record | PK(registry_id,revision) | Published snapshot, evidence refs закрыты; обязательная атрибуция в публичном манифесте отдельно. |

Связующие таблицы: `revision_visual_bindings` (definition_id,content_revision,role_key,variant_key PK + asset FK), `revision_dependencies` (owner revision, edge_index PK, kind + ровно одна target FK), `revision_tags`, `revision_compatibility`, `asset_credits`, `release_contents`, `release_assets`, `release_registries`, `release_localizations`, `release_dependencies`. Все перечисленные связи ссылаются на точные ревизии. Manifest JSONB должен совпасть с нормализованными ссылками при публикации; одна публикационная транзакция обновляет их вместе.

PIPE06 уточняет ранее принятую модель: `snapshot_packages` имеет PK(snapshot_id,package_id), package_version и manifest_digest, FK на точный PackageRelease; один package version на ID внутри snapshot. Переключение head и обновление проекции release_activations выполняются одной транзакцией. Приложение читает набор через head/snapshot, а не несколько независимых current pointers. Порядок family lock → head SHARE и активации head UPDATE без обратной семейной блокировки задан в [RELEASE_OPERATIONS](../content/RELEASE_OPERATIONS.md). Локальный fixture-срез реализован миграцией0007 в [G04-C](../implementation/G04_RELEASE_RESULT.md); production-схема и остальные content-типы остаются проектом. В этом срезе release_activations — производная таблица с естественным PK(scope_key,package_id), без отдельного EntityId; compatibility_ref и полный descriptor находятся в JSONB snapshot. Добавлены publication_operations, release_artifacts и localization_revisions для exact evidence/readback/revision checks. Эти решения относятся только к plain_text fixture adapter; production расширяется новой миграцией.

AssetGeometry/Derivation, PixelRect/Point, NamedAnchor/NineSlice, MessageArgument и ToolVersion — закрытые вложенные документы, а не отдельная SQL-таблица на каждую координату. SourceCredit/RightsRecord используют общий RegistryRef, но kind должен совпадать: ссылка на palette не может выдать себя за лицензию.

## 6. CHECK, FK и неизменные снимки

| Узел | Реализация ограничения |
|---|---|
| Семейная ссылка | FK(F,target_id) → target(F,id), при личном выборе дополнительно owner; не ограничиваться глобальным UUID FK. |
| GoalBinding | Колонки binding_state, goal_id, bound_at: unbound → оба null; bound_without_goal → goal null/time not null; bound_to_goal → оба not null и семейный FK. Effects не допускают unbound. |
| CalendarSnapshot | zone/date/revision/start/end колонки, CHECK start<end; запись immutable после открытия. Невозможная date отклоняется типом, смысл периода — календарным сервисом. |
| Amount snapshots | coins/xp/contribution/price bigint с CHECK≥0; «нужна положительная цена» определяется принятым балансом до интерфейса создания. Ненулевые эффекты не записываются для нулевой суммы. |
| Сумма shared-долей | Deferred constraint trigger на финальное состояние occurrence + команда под семейной блокировкой: Σ shares = исходному бюджету каждого ресурса; не межтабличный CHECK. |
| Сохранение эффекта | Effect source/key уникален, строка delta не UPDATE. Для нового восстановления отдельный effect_key и original FK. Роль приложения не имеет общего инструмента правки ledger. |
| Ровно один subtype effect | Отложенная проверка существования корректного subtype для каждой effect_records, не только FK в одну сторону. |
| Pet → corner / starter egg | Создаются одним commit; deferred проверка обязательных связей, без фиктивного nullable-уголка навсегда. |
| PDB07 импорт питомца | Принятое расширение: origin_kind=egg/approved_import; egg_acquisition_id либо import_record_id, CHECK ровно одного по kind. Отражено в RUNTIME_DICTIONARY v1.1; конкретные импортируемые записи ещё не выбраны. |
| Самостоятельная ревизия | UPDATE по id + expected state_revision; 0 affected → конфликт; каждое значимое изменение увеличивает revision. History/revision rows не «обновляются на последнюю». |

Ретенция и удаление проектируются как обход графа с отдельной ролью и проверками. NO ACTION не означает запрет удаления навсегда: план должен явно очистить/минимизировать зависимые данные, обработать артефакты/бэкапы и исключить повторный импорт удалённых сведений. Сохранённый UUID может оставаться персональным псевдонимом; его нельзя автоматически назвать анонимизацией. Точный допустимый остаток зависит от O01/O09.

## 7. Индексы под чтение

PK/UNIQUE из разделов 3–5 уже создают индексы. Для FK и чтения добавляются только необходимые покрытия; не индексировать каждое поле/JSON по умолчанию.

| Сценарий | Предлагаемый B-tree индекс / чтение |
|---|---|
| Семейный дом | member_profiles(F,status,id), appearances(F,P), active_companions(F,P); проекция без чужих кошельков ребёнку. |
| Дела на день | task_occurrences(F,local_date,id), participant_allocations(F,current_profile_id,occurrence_id), completion_attempts(allocation_id,attempt_number desc). |
| Очередь взрослого | completion_attempts(F,status,submitted_at,id) partial status=submitted; reward_orders(F,status,requested_at,id) по незавершённым. |
| Личный магазин/инвентарь | owned_entitlements(F,P,ownership_key) уже unique; shop_offers(scope_kind,F,status,id) + revision content FK. |
| История кошелька | wallet_entries(F,wallet_id,recorded_at desc,id desc); keyset по паре time/id, без OFFSET по растущему журналу. |
| Питомцы/уголки | owned_pets(F,P,id); pet_corners(pet_id) unique; загружать выбранный уголок, не всю коллекцию полных сцен. |
| Возвраты/сверка | effect_records(F,source_id), correction_adjustments(original_effect_id), reservations(F,wallet_id,status). |
| Отзыв сессий | sessions(F,binding_id,revoked_at), sessions(parent_session_id); expiry cleanup индекс expires_at отдельно. |
| Зависимости пакета | Индексы обратной ссылки на каждую target revision в release/revision relation tables для impact analysis. |
| Процессы данных | data_*_requests(F,status,created_at,id), process_steps(request_source_id,step_key,attempt); разные TTL для файлов и audit. |

Каждый индекс подтверждается EXPLAIN на разрешённом синтетическом объёме до реализации. Партиционирование ledger и шардирование не нужны без измеренной причины. Глобальные многосемейные агрегаты/аналитика не входят в детский state endpoint.

## 8. Основания и граница готовности

SQL-ограничения сверены по [PostgreSQL 18 Constraints](https://www.postgresql.org/docs/18/ddl-constraints.html): CHECK не подходит для суммы строк другой таблицы; семейные FK и частичная уникальность — отдельные механизмы. Диапазоны и точные типы сверены по [Numeric Types](https://www.postgresql.org/docs/18/datatype-numeric.html); отображение типов ORM — по [Drizzle PostgreSQL columns](https://orm.drizzle.team/docs/column-types). Это основания выбора, не доказательство исполнения данного проекта.

Готово для обсуждения: размещение всех сущностей, типы, нормализация, ключевые ограничения и индексы. До исполняемого DDL обязательны: закрытые JSON Schema и текстовые пределы, security storage/процедуры, параметры календарных переходов и квот из TRANSACTIONS, принятая политика импортов, анализ фактической разрешённой БД и executable constraint tests. Новые таблицы/триггеры не существуют от наличия этой документации.
