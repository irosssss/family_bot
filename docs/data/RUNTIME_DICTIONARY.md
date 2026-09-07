# Family Chores RPG — словарь игровых данных

Версия: 1.1. Дата: 2026-09-07. **Словарь принят в пакете DAT01–DAT08 как логическая основа, не готовые API/SQL-схемы.** Основа: [общий контракт](DATA_CONTRACT.md), [продуктовые правила](../PRODUCT_CONTRACT.md), [доменная модель](../DOMAIN_MODEL.md). Физические уточнения и импортное происхождение питомцев приняты отдельно в [PDB01–PDB08](PHYSICAL_SCHEMA.md); импортные поля уточнены в этой версии. Команды и переходы потребуют отдельных схем.

## 1. Как читать поля

Группы из общего контракта: `I` = Identity, `M` = Mutable, `F` = FamilyScoped, `P` = ProfileOwned, `E` = ImmutableEffect, `R` = Retention. Они включаются целиком. Каждая сущность имеет `I,R`, если явно не указано иначе; таблицы показывают дополнительные поля. `?` означает обязательное свойство с допустимым `null`, а не необязательный ключ. FK всегда проверяет тип, существование и область семьи. `Ref<T>` не предоставляет права чтения T.

Записи истории имеют версии формата, но не редактируемую ревизию эффекта. Персональные данные в истории подчиняются L08: экономическая неизменность не запрещает законное удаление/обезличивание. Сервис записи — доменный модуль, указанный ниже; клиент передаёт намерение, а не готовую запись с балансом, actor или правами.

## 2. Вложенные типы

| Тип | Поля | Ограничения |
|---|---|---|
| `EventActor` | `kind:Enum(member,service)!`; для member `context:ActorContext!`; для service `service_key:Key!`, `operation_id:EntityId!` | Различимое объединение: поля другого варианта запрещены. ActorContext фиксирует проверенную привязку и режим на момент действия; не содержит токен. |
| `Decision` | `outcome:Key!`, `actor:EventActor!`, `decided_at:Instant!`, `reason:Text?`, `operation_id:EntityId!` | Значения outcome задаёт конкретный процесс; причина обязательна для исправления/возврата на доработку. |
| `CalendarSnapshot` | `zone_id:ZoneId!`, `calendar_revision:Revision!`, `local_date:LocalDate!`, `starts_at:Instant!`, `ends_at:Instant!` | Сохранённые границы семейного дня, вычисленные для этой зоны и даты; сутки не предполагаются равными 24 часам. |
| `Schedule` | `kind:Enum(once,daily,weekly)!`, `starts_on:LocalDate!`, `ends_on:LocalDate?`; weekly также `weekdays:Set<SmallInt>!` | ISO-дни 1–7; weekly непустой. Once задаёт единственную дату, без weekdays; ends_on не раньше starts_on. Дополнительные дедлайны по времени суток не вводятся этим пакетом. |
| `TaskTerms` | `title:Text!`, `description:Text?`, `review_mode:Enum(adult_review,trusted)!`, `schedule:Schedule!`, `assignment:Assignment!`, `total_reward:QuantitySet!` | Это пользовательский текст и условия, не живые ссылки на текущий шаблон. |
| `Assignment` | `kind:Enum(individual,shared)!`, `shares:List<ShareTerms>!` | Individual содержит одного ребёнка; shared — непустой уникальный список исходных детей, без родителей; сумма долей равна total_reward по каждой величине. |
| `ShareTerms` | `profile_id:Ref<MemberProfile>!`, `reward:QuantitySet!` | Целые распределения и остаток подтверждены до открытия. После BEN действующий получатель может отличаться от этого исходного профиля. |
| `TaskRevisionRef` | `definition_id:Ref<TaskDefinition>!`, `revision:Revision!` | Ссылка на неизменный TaskDefinitionRevision; одинаковая ревизия не может обозначать два набора условий. |
| `LimitRule` | `rule_key:Key!`, `scope:Enum(family,child)!`, `period:Enum(total,day,week)!`, `maximum:UInt!` | Maximum > 0; конкретный ассортимент/лимиты устанавливает взрослый. Неизвестные виды лимитов требуют нового контракта. |
| `RewardTerms` | `title:Text!`, `description:Text?`, `delivery_terms:Text!`, `mode:Enum(guaranteed,approval_required)!`, `price_coins:UInt!`, `eligible_profile_ids:Set<Ref<MemberProfile>>!`, `limits:List<LimitRule>!` | Явный список детей; пустой не означает «все». Отсутствие лимитов = пустой список, не null. Значение цены и разрешение нулевой цены — баланс O12 до API. |
| `ShopTerms` | `content:ContentRef!`, `price_coins:UInt!`, `eligibility_rule:TypedPayload!`, `availability_start:Instant?`, `availability_end:Instant?` | Правила доступности исполняются только зарегистрированным обработчиком; исходная ревизия контента фиксируется. |
| `EffectLink` | `effect_type:Enum(wallet_entry,progress_grant,goal_contribution)!`, `effect_id:EntityId!` | Тип определяет таблицу/реестр; проверяются семья и источник. Это не произвольная ссылка на любую сущность. |
| `EffectAdjustment` | `original_effect:EffectLink!`, `requested:UInt!`, `applied:UInt!`, `waived:UInt!`, `result_effect:EffectLink?` | Requested = applied + waived; result_effect обязателен при applied > 0. Waived — окончательно не взыскиваемая часть, не долг. |
| `SlotSelection` | `slot_key:Key!`, `entitlement_id:Ref<OwnedEntitlement>!` | Уникальный слот в наборе; право принадлежит владельцу, подходит цели/слоту; контент берётся из закреплённого права. |
| `Consent` | `adult_profile_id:Ref<MemberProfile>!`, `decision:Enum(approve,reject)!`, `decided_at:Instant!`, `protection_revision:Revision!`, `operation_id:EntityId!` | Свежесть PIN проверяется сервером в момент согласия; номер ревизии сам не доказательство. Отдельная запись на взрослого и ревизию запроса. |
| `ProcessStep` | `step_key:Key!`, `state:Enum(pending,running,succeeded,failed)!`, `attempt:SmallInt!`, `started_at:Instant?`, `finished_at:Instant?`, `error_code:Key?`, `evidence_ref:Text?` | Ссылка на ограниченное техническое доказательство, без токенов и экспортируемого содержимого. Удаление/экспорт имеют собственные наборы шагов. |

Следующие вспомогательные записи уточняют хранение уже принятых правил: TaskDefinitionRevision, OfferRevision, RewardQuotaBucket/Claim, ProcessStep и Consent. Это не новые пользовательские механики. В SQL они могут стать отдельными таблицами или закрытыми вложенными структурами с эквивалентными ограничениями.

## 3. Доступ и семья

### Account — контур доступа; I,M,R

| Поле | Тип | Условие |
|---|---|---|
| `status` | `Enum(active,disabled,erasure_pending)!` | Account не хранит семейную роль или игровой кошелёк. |
| `disabled_at` | `Instant?` | Null у active. Сохранение остаточной записи после удаления определяется процессом L08, а не вечным статусом deleted. |

### ExternalIdentity — адаптер идентичности; I,M,R

| Поле | Тип | Условие |
|---|---|---|
| `account_id` | `Ref<Account>!` | Одна действующая связь проверенного внешнего субъекта. |
| `provider`, `subject` | `Key!`, `Text!` | Пара уникальна среди действующих идентичностей; Telegram ID строкой, не username. |
| `verified_at`, `revoked_at` | `Instant!`, `Instant?` | Серверная проверка; сырой материал входа не копируется в объект/аудит. |

### Family — модуль семьи; I,M,R

| Поле | Тип | Условие |
|---|---|---|
| `display_name` | `Text!` | Пользовательский текст. |
| `status` | `Enum(active,archived)!` | Удаление ведётся отдельным запросом и ограничением доступа. |
| `zone_id`, `calendar_revision` | `ZoneId!`, `Revision!` | Начало дня — полночь; уже открытые периоды не пересчитываются. |
| `membership_revision` | `Revision!` | Меняется при изменении состава взрослых; независим от переименования семьи, используется при согласовании архива. |
| `recurrence_paused`, `recurrence_paused_at` | `boolean!`, `Instant?` | At обязателен при true; пауза не запрещает магазин/питомцев. |
| `archived_at`, `last_resumed_at` | `Instant?`, `Instant?` | Архивный статус требует archived_at. Полная история — LifecycleRequest. |

### MemberProfile — модуль семьи; I,M,F,R

| Поле | Тип | Условие |
|---|---|---|
| `display_name` | `Text!` | Не уникален глобально; не средство входа. |
| `family_role` | `Enum(parent,child)!` | Parent не получает детские кошелёк, XP и игровые действия. |
| `status` | `Enum(active,archived,left)!` | Архив профиля не равен удалению; left применяется к завершённому участию. |
| `archived_at`, `left_at` | `Instant?`, `Instant?` | Соответствуют состоянию; история/права обрабатываются отдельно. |

### AccessBinding — модуль доступа; I,M,F,R

| Поле | Тип | Условие |
|---|---|---|
| `account_id`, `profile_id` | `Ref<Account>!`, `Ref<MemberProfile>!` | Profile из этой семьи. |
| `kind` | `Enum(adult_membership,own_child,managed_child)!` | Не смешивать роль профиля со способом доступа. |
| `manager_binding_id` | `Ref<AccessBinding>?` | Обязателен только managed_child; указывает действующую adult_membership того же Account/семьи. |
| `status`, `revoked_at` | `Enum(active,revoked)!`, `Instant?` | Revoked требует время. Один own_child аккаунт на профиль MVP; управлять могут несколько взрослых. |
| `origin_invitation_id` | `Ref<FamilyInvitation>?` | Null для первичного создания/проверенного внутреннего назначения; источник всё равно есть в операции. |

### SessionContext — модуль доступа; I,M,F,R, серверное состояние

| Поле | Тип | Условие |
|---|---|---|
| `account_id`, `binding_id`, `profile_id` | `Ref<Account>!`, `Ref<AccessBinding>!`, `Ref<MemberProfile>!` | Один проверенный контекст, все ссылки согласованы. |
| `mode` | `Enum(adult,own_child,managed_child)!` | Полномочия вычисляет сервер из режима и актуального состояния. |
| `parent_session_id` | `Ref<SessionContext>?` | Managed_child содержит источник взрослой сессии; отзыв каскадирует по источнику. |
| `token_verifier_ref` | `Text!` | Только внутренний защищённый реестр; формат/алгоритм — security-проект. |
| `expires_at`, `revoked_at` | `Instant!`, `Instant?` | Истечение и отзыв проверяются при каждом защищённом запросе. TTL ещё не выбран. |
| `adult_verified_at`, `protection_revision` | `Instant?`, `Revision?` | Только adult; детский режим не наследует разрешение опасных действий. Свежесть — отдельная политика. |

### FamilyInvitation — модуль доступа; I,M,F,R

| Поле | Тип | Условие |
|---|---|---|
| `purpose`, `target_role` | `Enum(adult_join,child_link)!`, `Enum(parent,child)!` | Согласованная пара, назначение неизменно. |
| `target_profile_id`, `issuer_profile_id` | `Ref<MemberProfile>?`, `Ref<MemberProfile>!` | Child_link требует существующий детский профиль; adult_join создаёт участие только при финальном подтверждении. |
| `candidate_account_id` | `Ref<Account>?` | Появляется после проверки кандидата; нельзя заменять без нового приглашения. |
| `token_verifier_ref`, `expires_at` | `Text!`, `Instant!` | Одноразовый секрет в защищённом реестре, не в клиентском списке. |
| `status` | `Enum(issued,claimed,approved,consumed,revoked,expired)!` | Потребление и создание/активация привязки атомарны; approved не даёт доступа само. |
| `approval`, `consumed_at` | `Decision?`, `Instant?` | Финальное согласие взрослого обязательно; consumed_at только после фактического использования. |

### AdultAccessProtection — модуль доступа; I,M,F,R

| Поле | Тип | Условие |
|---|---|---|
| `adult_profile_id`, `adult_binding_id` | `Ref<MemberProfile>!`, `Ref<AccessBinding>!` | Один действующий комплект на взрослого участника семьи; не общий семейный PIN. |
| `verifier_ref`, `security_policy_id` | `Text!`, `Key!` | Проверочное значение шестизначного PIN и параметры в закрытом контуре, не открытый PIN. |
| `credential_revision`, `rotated_at` | `Revision!`, `Instant!` | Ротация инвалидирует прежние подтверждения этой семейной области. |
| `status` | `Enum(active,revoked)!` | Rate limit/блокировки — отдельное эфемерное хранилище security-проекта, не счётчик только на клиенте. |

### RecoveryCredential — модуль доступа; I,M,F,R

| Поле | Тип | Условие |
|---|---|---|
| `adult_profile_id`, `protection_id` | `Ref<MemberProfile>!`, `Ref<AdultAccessProtection>!` | Область одного взрослого в одной семье. |
| `verifier_ref`, `credential_revision` | `Text!`, `Revision!` | Исходный recovery-key не хранится в обычной записи или журнале. |
| `status`, `consumed_at`, `revoked_at` | `Enum(active,consumed,revoked)!`, `Instant?`, `Instant?` | Успешное восстановление расходует/ротирует прежний материал. |

### RecoveryRequest — модуль доступа; I,M,F,R

| Поле | Тип | Условие |
|---|---|---|
| `adult_profile_id`, `candidate_account_id` | `Ref<MemberProfile>!`, `Ref<Account>!` | Проверенный кандидат ещё не получает обычных прав. |
| `method`, `credential_id` | `Enum(recovery_key,other_adult)!`, `Ref<RecoveryCredential>?` | Credential нужен только recovery_key; other_adult требует согласие другого действующего взрослого. |
| `approval` | `Decision?` | Для other_adult до разрешения восстановления обязательна. |
| `status`, `expires_at` | `Enum(pending,authorized,completed,rejected,expired,cancelled)!`, `Instant!` | authorized даёт только ограниченное действие восстановления. |
| `expected_protection_revision`, `completed_operation_id` | `Revision!`, `EntityId?` | Проверка конкуренции, ротация привязок/секретов/сессий в одной семейной области. |

## 4. Дела и результаты — модуль заданий

### TaskDefinition — I,M,F,R

| Поле | Тип | Условие |
|---|---|---|
| `current_revision` | `Revision!` | Указывает сохранённую TaskDefinitionRevision. |
| `status` | `Enum(active,archived)!` | Архив останавливает будущую генерацию, не стирает открытые результаты. |
| `source_template` | `ContentRef?` | Только происхождение; изменение шаблона не меняет семейный текст. |

### TaskDefinitionRevision — I,F,R, неизменные условия

| Поле | Тип | Условие |
|---|---|---|
| `definition_id`, `revision` | `Ref<TaskDefinition>!`, `Revision!` | Пара уникальна. |
| `terms`, `author`, `effective_from` | `TaskTerms!`, `EventActor!`, `Instant!` | Влияет только на ещё не открытые выполнения. |

### TaskOccurrence — I,M,F,R

| Поле | Тип | Условие |
|---|---|---|
| `task_revision`, `calendar` | `TaskRevisionRef!`, `CalendarSnapshot!` | Одно выполнение на определение/плановую дату MVP, независимо от последующих ревизий. |
| `terms_snapshot`, `opened_at` | `TaskTerms!`, `Instant!` | Замораживание при открытии. Создание долей в той же операции. |
| `goal_binding` | `GoalBinding!` | При первом submit любой доли фиксируется для всего occurrence; bound_without_goal не превращается в будущую цель. |
| `status`, `closed_at`, `close_reason` | `Enum(open,closed)!`, `Instant?`, `Key?` | Закрытие нового приёма не удаляет находящиеся на проверке попытки; судьба каждой доли самостоятельна. |

### ParticipantAllocation — I,M,F,R

| Поле | Тип | Условие |
|---|---|---|
| `occurrence_id`, `original_profile_id`, `current_profile_id` | `Ref<TaskOccurrence>!`, `Ref<MemberProfile>!`, `Ref<MemberProfile>!` | Исходный профиль неизменен; текущий меняется только BEN. |
| `reward_snapshot`, `share_index` | `QuantitySet!`, `SmallInt!` | Индекс ≥0, уникален в occurrence; суммы не перераспределяются после открытия. |
| `status` | `Enum(open,submitted,returned,settled,closed)!` | Единственный действующий расчёт по ID доли, даже если меняется получатель. |
| `beneficiary_correction_id` | `Ref<BeneficiaryCorrection>?` | Не обнуляется после undo: сохраняет запрет второго переноса MVP. |

### CompletionAttempt — I,M,F,R

| Поле | Тип | Условие |
|---|---|---|
| `allocation_id`, `attempt_number` | `Ref<ParticipantAllocation>!`, `Revision!` | Пара уникальна; повтор транспорта не создаёт следующую попытку. |
| `submitted_for_profile_id`, `submitted_by`, `submitted_at` | `Ref<MemberProfile>!`, `EventActor!`, `Instant!` | Исторический отправитель/получатель не переписывается BEN. |
| `task_revision`, `reward_snapshot`, `goal_binding_snapshot` | `TaskRevisionRef!`, `QuantitySet!`, `GoalBinding!` | Согласованы с открытой долей и первым submit; binding уже не unbound. |
| `late_submission`, `note` | `boolean!`, `Text?` | Late вычисляет сервер по сохранённому календарю; требует проверки взрослого даже у trusted. |
| `status`, `decision` | `Enum(submitted,returned,accepted,superseded)!`, `Decision?` | Accepted требует решение, включая допустимое автоматическое принятие; повторная подача создаёт новую попытку. |

### CompletionSettlement — I,M,F,R

| Поле | Тип | Условие |
|---|---|---|
| `allocation_id`, `accepted_attempt_id`, `beneficiary_profile_id` | `Ref<ParticipantAllocation>!`, `Ref<CompletionAttempt>!`, `Ref<MemberProfile>!` | Allocation уникален за всю жизнь; восстановление использует тот же settlement. |
| `promised_reward`, `goal_binding`, `calendar` | `QuantitySet!`, `GoalBinding!`, `CalendarSnapshot!` | Неизменные исходные обещания/период; фактические эффекты могут быть компенсированы. |
| `status` | `Enum(accepted,corrected,restored)!` | Точный текущий итог берётся из связанных эффектов, а не одной строки status. |
| `initial_operation_id`, `effect_links` | `EntityId!`, `List<EffectLink>!` | История добавляется, не заменяет старые начисления. Стартовое право выдаётся атомарно, если впервые заслужено. |

## 5. Экономика и реальные награды

### Wallet — экономика; I,M,F,P,R

| Поле | Тип | Условие |
|---|---|---|
| `currency_key` | `Key!` | Только игровые coins MVP; не реальные деньги. Один кошелёк currency/ребёнок. |
| `posted_balance`, `reserved_balance` | `UInt!`, `UInt!` | Проверяемые проекции записей и активных резервов; available = posted − reserved ≥0. Не отдельный редактируемый available. |

### WalletEntry — экономика; I,F,E,R

| Поле | Тип | Условие |
|---|---|---|
| `wallet_id`, `delta` | `Ref<Wallet>!`, `Int!` | Ненулевое подписанное изменение posted_balance; резервирование само не списание. |
| `entry_kind`, `original_entry_id` | `Enum(grant,purchase,refund,correction,restoration)!`, `Ref<WalletEntry>?` | Коррекция/восстановление связываются с исходным эффектом. |
| `beneficiary_profile_id`, `actor` | `Ref<MemberProfile>!`, `EventActor!` | Получатель совпадает с владельцем кошелька; уникальный cause/effect_key. |

### Reservation — экономика; I,M,F,R

| Поле | Тип | Условие |
|---|---|---|
| `wallet_id`, `reward_order_id`, `amount` | `Ref<Wallet>!`, `Ref<RewardOrder>!`, `UInt!` | Один резерв заказа, исходная сумма неизменна. |
| `status`, `capture_entry_id`, `finished_at` | `Enum(active,captured,released)!`, `Ref<WalletEntry>?`, `Instant?` | Captured требует ровно одно списание; released его не создаёт. Финальный переход однократен. |

### ProgressGrant — прогресс; I,F,P,E,R

| Поле | Тип | Условие |
|---|---|---|
| `effect` | `TypedPayload!` | Закрытые варианты ниже, без произвольных свойств. |
| `original_grant_id`, `rule_revision` | `Ref<ProgressGrant>?`, `ContentRef!` | Правила уровня/награды закреплены; текущий XP суммируется по xp_delta. |

Контракт `progress_xp` v1: `{delta:Int}`, delta ≠0. Контракт `progress_unlock` v1: `{content:ContentRef}` — постоянное право достижения для будущего поддерживаемого типа, не автоматический выпуск достижений MVP. Коррекция XP может снизить уровень, но не удаляет постоянные приобретения. Алгоритм уровней и лимиты O12 ещё должны быть приняты.

### StarterPetChoice — прогресс/питомцы; I,M,F,P,R

| Поле | Тип | Условие |
|---|---|---|
| `eligible_settlement_id`, `eligible_at` | `Ref<CompletionSettlement>!`, `Instant!` | Одна запись на профиль; право после первого одобренного дела сохраняется при коррекции. |
| `choice_options` | `Set<ContentRef>!` | Непустой снимок разрешённых стартовых яиц. |
| `status`, `selected_egg`, `egg_acquisition_id`, `chosen_at` | `Enum(available,chosen)!`, `ContentRef?`, `Ref<EggAcquisition>?`, `Instant?` | Три nullable поля обязательны при chosen; выбор и выдача бесплатного яйца атомарны. |

### ShopOffer — магазин; I,M,R; область различимая

| Поле | Тип | Условие |
|---|---|---|
| `scope` | `ShopScope!` | `{kind:global}` или `{kind:family,family_id:Ref<Family>}`; global не содержит family_id. |
| `current_revision`, `status` | `Revision!`, `Enum(draft,active,retired)!` | Условия в ShopOfferRevision; retired не уничтожает права из покупок. |

### ShopOfferRevision — магазин; I,R, неизменная ревизия

| Поле | Тип | Условие |
|---|---|---|
| `offer_id`, `revision`, `terms` | `Ref<ShopOffer>!`, `Revision!`, `ShopTerms!` | Пара offer/revision уникальна; область наследуется и проверяется. |

### Purchase — магазин; I,F,P,E,R

| Поле | Тип | Условие |
|---|---|---|
| `offer_id`, `offer_revision`, `terms_snapshot` | `Ref<ShopOffer>!`, `Revision!`, `ShopTerms!` | Доступное предложение этой семьи/глобального каталога; проверка цены сервером. |
| `debit_entry_id`, `granted_entitlement_ids`, `egg_acquisition_id` | `Ref<WalletEntry>?`, `Set<Ref<OwnedEntitlement>>!`, `Ref<EggAcquisition>?` | Списание обязательно при цене >0. Выходы соответствуют типу товара; не выдавать одновременно противоречащие права. |

### RewardOffer — семейные награды; I,M,F,R

| Поле | Тип | Условие |
|---|---|---|
| `current_revision`, `status` | `Revision!`, `Enum(draft,active,retired)!` | Владелец записи — взрослый через модуль наград. |

### RewardOfferRevision — награды; I,F,R, неизменные условия

| Поле | Тип | Условие |
|---|---|---|
| `offer_id`, `revision`, `terms`, `author` | `Ref<RewardOffer>!`, `Revision!`, `RewardTerms!`, `EventActor!` | Снимок обещания; смена текста/цены не переписывает заказы. |

### RewardOrder — награды; I,M,F,P,R

| Поле | Тип | Условие |
|---|---|---|
| `offer_id`, `offer_revision`, `terms_snapshot` | `Ref<RewardOffer>!`, `Revision!`, `RewardTerms!` | Условия начала заказа; одна незавершённая покупка/заявка одного предложения на ребёнка. |
| `status` | `Enum(requested,purchased,scheduled,fulfilled,rejected,cancelled,refunded)!` | requested/purchased/scheduled удерживают ограничение незавершённого заказа. Ошибка отметки выдачи возвращает прежний purchased/scheduled. |
| `requested_at`, `purchase_at`, `scheduled_for` | `Instant!`, `Instant?`, `Instant?` | Scheduled_for — согласованное время выдачи, не автоматическая бронь реального места. |
| `reservation_id`, `debit_entry_id`, `decision` | `Ref<Reservation>?`, `Ref<WalletEntry>?`, `Decision?` | Approval_required: резерв при запросе, при принятии capture; guaranteed: непосредственная покупка. |
| `quota_claim_ids`, `refund_entry_ids`, `fulfillment_id` | `Set<Ref<RewardQuotaClaim>>!`, `Set<Ref<WalletEntry>>!`, `Ref<RewardFulfillment>?` | Возврат ≤ невозвращенной суммы; ожидание само не истекает; bought не сгорает. |

### RewardQuotaBucket и RewardQuotaClaim — награды; I,M,F,R

| Запись / поле | Тип | Условие |
|---|---|---|
| Bucket: `offer_id`, `rule_key`, `scope_profile_id` | `Ref<RewardOffer>!`, `Key!`, `Ref<MemberProfile>?` | Scope_profile null только для family-лимита; идентичность лимита не меняется при косметической правке предложения. |
| Bucket: `period`, `period_key`, `calendar_snapshot` | `Enum(total,day,week)!`, `Text!`, `QuotaPeriod?` | Total: фиксированный ключ lifetime, snapshot null. Day/week: исходная зона и реальные границы; неделя с понедельника. |
| Claim: `bucket_id`, `order_id`, `units`, `limit_snapshot` | `Ref<RewardQuotaBucket>!`, `Ref<RewardOrder>!`, `UInt!`, `UInt!` | Units = 1 заказ MVP; bucket/order уникальны. Предел берётся из правил заказа, не из будущей цены. |
| Claim: `state`, `finished_at` | `Enum(held,consumed,released)!`, `Instant?` | Ожидание и купленное обещание held; выдача consumed; отмена/невыдача released один раз. При исправлении ложной выдачи consumed → held в той же операции, без новой квоты. |

`QuotaPeriod`: `zone_id:ZoneId!`, `calendar_revision:Revision!`, `starts_on:LocalDate!`, `ends_before:LocalDate!`, `starts_at:Instant!`, `ends_at:Instant!`. Квота относится к периоду первоначального запроса даже при позднем одобрении. Изменение календаря/лимита не должно создавать вторую доступную квоту внутри прежнего учётного периода: проект физической схемы обязан определить стабильные ключи переходных периодов и сериализацию. Счётчики held/consumed можно кешировать, но проверять по claims; не хранить только текущее `remaining` в RewardOffer.

### RewardFulfillment — награды; I,M,F,R

| Поле | Тип | Условие |
|---|---|---|
| `order_id`, `status` | `Ref<RewardOrder>!`, `Enum(recorded,mark_reversed)!` | Одна текущая запись выдачи на заказ; фактическое получение не отменяется просто кнопкой возврата. |
| `recorded_decision`, `reversed_decision`, `previous_order_status` | `Decision!`, `Decision?`, `Enum(purchased,scheduled)!` | Исправление ошибочной отметки без денежного эффекта; все смены сохраняются в истории операций. |

### CorrectionCase — исправления; I,M,F,R

| Поле | Тип | Условие |
|---|---|---|
| `case_kind`, `source_type`, `source_id` | `Enum(wrong_grant,wrong_debit,wrong_fulfillment)!`, `Key!`, `EntityId!` | Source_type из закрытого реестра источников; same-family; не произвольное редактирование истории. |
| `reason`, `requested_by`, `expected_source_revision` | `Text!`, `EventActor!`, `Revision!` | Preview согласуется с фактическим исполнением; изменившиеся суммы требуют нового расчёта. |
| `status`, `adjustments` | `Enum(prepared,applied,undone,rejected)!`, `List<EffectAdjustment>!` | Prepared не удерживает деньги и ничего не начисляет. Применение ограничено доступными монетами без резервов. |
| `applied_operation_id`, `undo_operation_id` | `EntityId?`, `EntityId?` | Undo восстанавливает только реально снятое; прощённая часть не начисляется заново. |

### BeneficiaryCorrection — исправления; I,M,F,R

| Поле | Тип | Условие |
|---|---|---|
| `allocation_id`, `from_profile_id`, `to_profile_id` | `Ref<ParticipantAllocation>!`, `Ref<MemberProfile>!`, `Ref<MemberProfile>!` | Разные существующие дети этой семьи; одна запись переноса на allocation MVP. |
| `source_state_snapshot`, `expected_source_revision` | `Enum(submitted,settled)!`, `Revision!` | Pending после отмены возвращается на проверку, а не автоматически награждает A. |
| `promised_reward`, `goal_binding`, `calendar` | `QuantitySet!`, `GoalBinding!`, `CalendarSnapshot!` | B получает полный исходный размер; первоначальные цель/дата/бюджет доли неизменны. |
| `reason`, `actor`, `status` | `Text!`, `EventActor!`, `Enum(prepared,applied,undone,rejected)!` | Семья активна; архивный ребёнок допустим, удалённый/другая семья нет. Проверяется отсутствие уже оплаченной копии той же реальной работы. |
| `from_adjustments`, `to_grant_links`, `undo_adjustments`, `restoration_links` | `List<EffectAdjustment>!`, `List<EffectLink>!`, `List<EffectAdjustment>!`, `List<EffectLink>!` | Обе стороны и вклад исполняются атомарно; вклад семьи не удваивается. При undo A возвращается только реально снятое. |
| `applied_operation_id`, `undo_operation_id` | `EntityId?`, `EntityId?` | Ровно одно применение и одна связанная отмена; повторные циклы запрещены. |

## 6. Владение, питомцы и дом

### OwnedEntitlement — инвентарь; I,F,P,E,R

| Поле | Тип | Условие |
|---|---|---|
| `content`, `ownership_key` | `ContentRef!`, `ContentId!` | Namespaced ключ владения из каталога; пара owner/ownership_key уникальна. Типы прав различаются в контенте. |
| `acquired_at` | `Instant!` | Постоянное право, не копия изображения и не аренда; исправление монет его не отбирает. |

### ConsumableBalance — инвентарь, 1.1; I,M,F,P,R

| Поле | Тип | Условие |
|---|---|---|
| `content`, `quantity` | `ContentRef!`, `UInt!` | Закреплённая ревизия поведения расходника и остаток owner/stack_key; точный пересчёт по ConsumableEntry. Не включать корм в MVP этой записью. |
| `stack_key` | `ContentId!` | Уточнение PDB03: устойчивая группа стека из контента; unique owner/stack_key, выпуск новой картинки не создаёт второй независимый остаток. |

`ConsumableEntry` — вспомогательная история I,F,P,E,R: `balance_id:Ref<ConsumableBalance>!`, `delta:Int!` (ненулевой), `original_entry_id:Ref<ConsumableEntry>?`. Приход/кормление/исправление атомарны, остаток неотрицательный. Правила кормления и лимиты — отдельный контракт 1.1.

### EggAcquisition — питомцы; I,M,F,P,R

| Поле | Тип | Условие |
|---|---|---|
| `egg_content`, `pet_result`, `collection_key` | `ContentRef!`, `ContentRef!`, `ContentId!` | Результат известен заранее; namespaced коллекционный ключ из опубликованного определения. |
| `source`, `status`, `hatched_pet_id`, `hatched_at` | `CauseRef!`, `Enum(unhatched,hatched)!`, `Ref<OwnedPet>?`, `Instant?` | Вылупление бесплатно и однократно, с созданием базового уголка. |

### OwnedPet — питомцы; I,M,F,P,R

| Поле | Тип | Условие |
|---|---|---|
| `pet_content`, `collection_key`, `egg_acquisition_id` | `ContentRef!`, `ContentId!`, `Ref<EggAcquisition>?` | Единственный коллекционный экземпляр owner/key; egg_acquisition_id обязателен при origin_kind=egg. Яйцо также удерживает этот ключ до вылупления. |
| `origin_kind`, `import_record_id` | `Enum(egg,approved_import)!`, `Ref<MigrationRecord>?` | Принятое уточнение PDB07: при egg импортная ссылка null; при approved_import яйцо null, import_record_id обязателен. MigrationRecord описан в [карте переноса](MIGRATION_MAP.md); реальный импорт требует отдельной приёмки записей, история яйца не выдумывается. |
| `custom_name` | `Text?` | Null = системное локализованное имя; имя не уникально и не ключ контента. |
| `friendship_state` | `TypedPayload?` | MVP null; только зарегистрированная схема 1.1 после отдельной приёмки. Нет состояния смерти/побега/наказания. |

### AppearanceSelection — внешний вид; I,M,F,P,R

| Поле | Тип | Условие |
|---|---|---|
| `target` | `AppearanceTarget!` | `{kind:hero}` или `{kind:pet,pet_id:Ref<OwnedPet>}`; герой — owner этой записи. |
| `base_content`, `slots` | `ContentRef!`, `List<SlotSelection>!` | Одна конфигурация на цель; базовая внешность доступна этому профилю, не обход магазина. |

### PetCorner — питомцы; I,M,F,P,R

| Поле | Тип | Условие |
|---|---|---|
| `pet_id`, `base_corner_content`, `slots` | `Ref<OwnedPet>!`, `ContentRef!`, `List<SlotSelection>!` | Pet_id уникален; бесплатная база включает необходимые фон/место отдыха. Слоты background/rest/toy описаны каталогом, конкретные размеры — Asset Bible. |

Постоянный декор одного ребёнка может быть выбран одновременно в нескольких совместимых уголках. Нужны ссылки на одно право, а не копии владения. Никакой отдельной комнаты верхнего уровня на питомца: общая страница переключает активный уголок.

### ActiveCompanion — питомцы; I,M,F,P,R

| Поле | Тип | Условие |
|---|---|---|
| `pet_id` | `Ref<OwnedPet>?` | Одна запись на ребёнка, null = без спутника; питомец этого владельца. В общем доме рядом с владельцем только он. |

### FamilyGoal — семейный прогресс; I,M,F,R

| Поле | Тип | Условие |
|---|---|---|
| `goal_content`, `target_amount`, `reward_content` | `ContentRef!`, `UInt!`, `ContentRef!` | Target >0; условия и улучшение фиксируются при создании. |
| `status`, `current_amount`, `activated_at`, `achieved_at` | `Enum(active,achieved,closed)!`, `UInt!`, `Instant!`, `Instant?` | Одна active на семью; current_amount — пересчитываемая сумма, может превышать target. |
| `house_unlock_id` | `Ref<HouseUnlock>?` | При достижении создаётся атомарно. Снижение вклада после коррекции не отнимает unlock и не активирует старую цель повторно. |

### GoalContribution — семейный прогресс; I,F,E,R

| Поле | Тип | Условие |
|---|---|---|
| `allocation_id`, `beneficiary_profile_id`, `goal_binding` | `Ref<ParticipantAllocation>!`, `Ref<MemberProfile>!`, `GoalBinding!` | Binding только bound_to_goal/bound_without_goal; сохраняется при исправлениях. |
| `delta`, `calendar`, `original_contribution_id` | `Int!`, `CalendarSnapshot!`, `Ref<GoalContribution>?` | Ненулевой вклад/компенсация. При BEN уже учтённого вклада парные −A/+B сохраняют общий итог одной транзакцией. |

### HouseUnlock — дом; I,F,E,R

| Поле | Тип | Условие |
|---|---|---|
| `content`, `unlock_key`, `goal_id` | `ContentRef!`, `ContentId!`, `Ref<FamilyGoal>?` | Уникальный family/unlock_key; goal null только для предусмотренного бесплатного/другого зарегистрированного источника. |

### HouseConfiguration — дом; I,M,F,R

| Поле | Тип | Условие |
|---|---|---|
| `base_house_content`, `slots` | `ContentRef!`, `List<HouseSlot>!` | Одна конфигурация семьи. Состав людей не дублируется: проекция MemberProfile/AppearanceSelection/ActiveCompanion. |

`HouseSlot`: `slot_key:Key!`, `unlock_id:Ref<HouseUnlock>!`; слот уникален в конфигурации, unlock этой семьи, совместимость проверяется. Персональная покупка ребёнка не становится автоматически общим семейным правом.

## 7. Жизненный цикл и технические операции

### FamilyLifecycleRequest — модуль семьи; I,M,F,R

| Поле | Тип | Условие |
|---|---|---|
| `action`, `status`, `initiated_by` | `Enum(archive,resume)!`, `Enum(pending,approved,applied,rejected,cancelled,invalidated)!`, `EventActor!` | Пауза расписания проще и не выдаёт себя за семейный архив. |
| `adult_profile_ids`, `membership_revision`, `consents` | `Set<Ref<MemberProfile>>!`, `Revision!`, `List<Consent>!` | Требуется согласие всех актуальных взрослых; при изменении состава пересогласование, не старое большинство. |
| `applied_operation_id`, `applied_at` | `EntityId?`, `Instant?` | Перед архивом повторная проверка незавершённых дел/резервов/наград. Не вводится автоматическое согласие по таймеру. |

Membership_revision — отдельный счётчик состава семьи из Family, увеличиваемый при вступлении/выходе взрослого. Общий state_revision не заменяет его, если согласие не должно сбрасываться от переименования дома.

### DataExportRequest — процессы данных; I,M,F,R

| Поле | Тип | Условие |
|---|---|---|
| `requested_by`, `subject_scope`, `authority_ref` | `EventActor!`, `DataSubjectScope!`, `Text!` | Проверка личности, области и полномочий; family_id не означает выгрузку секретов всех участников. |
| `status`, `steps` | `Enum(requested,verified,building,ready,expired,rejected,failed)!`, `List<ProcessStep>!` | Поэтапный процесс; формат экспортируемых данных versioned, не архив всех таблиц. |
| `export_schema_version`, `artifact_ref`, `artifact_digest`, `download_expires_at` | `SchemaVersion!`, `Text?`, `Digest?`, `Instant?` | Ready требует три поля; artifact_ref внутренний, ссылка на скачивание выдаётся после повторной проверки доступа. |

### DataErasureRequest — процессы данных; I,M,F,R

| Поле | Тип | Условие |
|---|---|---|
| `requested_by`, `subject_scope`, `authority_ref` | `EventActor!`, `DataSubjectScope!`, `Text!` | Не заменяется голосованием архива; полномочия и основания зависят от условий запуска. |
| `status`, `retention_plan`, `steps` | `Enum(requested,verified,planned,executing,completed,rejected,failed)!`, `TypedPayload?`, `List<ProcessStep>!` | План обязателен до executing: хранилища, исключения, сроки/основания, бэкапы и запрет воскрешения данных. Схема плана обязательна до реализации. |
| `accepted_at`, `completed_at`, `failure_code` | `Instant?`, `Instant?`, `Key?` | Completed только по проверяемым стадиям; отложенные backup-стадии должны иметь явные сроки и ограничения восстановления, не молчаливый успех. |

`DataSubjectScope`: `{kind:profile,profile_id:Ref<MemberProfile>}` или `{kind:family}`. Удаление глобального Account — отдельный координирующий процесс над семейными запросами/ExternalIdentity, не каскадное удаление всех семей. Он нужен при реализации соответствующей политики L08; финальный набор оснований, сроков и субъектов зависит от O01/O09. Эти документы не утверждают юридическую достаточность процедуры.

### OperationReceipt — доменные операции; I,M,F,R

| Поле | Тип | Условие |
|---|---|---|
| `operation_id`, `command_key`, `command_schema_version` | `EntityId!`, `Key!`, `SchemaVersion!` | Operation_id совпадает с id этой квитанции; команда из зарегистрированного реестра. |
| `actor`, `idempotency_key`, `request_digest` | `EventActor!`, `Text!`, `Digest!` | Scope повтора = family + проверенный account/service + command + key. Digest не содержит исходных секретов. |
| `status`, `result_ref`, `error_code` | `Enum(committed,rejected)!`, `OperationResult?`, `Key?` | Успех записывается атомарно с эффектами; pending транспорта/lock не означает применённую команду. |
| `semantic_source_type`, `semantic_source_id` | `Key?`, `EntityId?` | Вместе null либо вместе заполнены. Постоянная бизнес-уникальность хранится также на settlement/покупке/выдаче и не исчезает при очистке transport receipt. |

`OperationResult`: `entity_type:Key!`, `entity_id:EntityId!`, `state_revision:Revision?`; type из результата конкретной команды. Квитанция не хранит бессрочно полный персональный API-ответ. Повтор результата снова проходит авторизацию. Операции до создания семьи/входа используют отдельный контур access receipts: семейный receipt не получает фиктивный family_id.

## 8. Чувствительность, запись и хранение

| Семейство | Класс / кто видит | Кто пишет | Retention-ссылка и условие |
|---|---|---|---|
| Account, ExternalIdentity | Идентифицирующие данные; только разрешённое представление | Доступ / проверенный адаптер | `identity_records`; отвязка/удаление субъекта, сроки O01/O09. |
| Binding, Session, Invitation, Protection, Recovery | Чувствительный контур доступа; verifier_ref не выводится ни в обычный экспорт, ни в логи | Доступ | `access_credentials` / `access_events`; отзыв/истечение, отдельные сроки активного секрета и следа операции. |
| Family, MemberProfile | Семейные персональные данные; детское представление минимально | Семья | `family_membership`; выход/архив не означает бесконечное хранение. |
| Tasks, attempts, snapshots | Семейные дела и пользовательский текст | Задания | `task_history`; результат/архив плюс обработка запросов L08. |
| Wallet, reservations, grants, corrections, purchases | Личная игровая экономика; ребёнку своё, взрослому разрешённое семейное | Экономика/прогресс/исправления в общей транзакции | `gameplay_ledger`; целостность эффектов с минимизацией личности/причин. Не финансовая отчётность реальных денег. |
| RewardOffer/Order/Fulfillment, quota | Семейные обещания и история выдачи | Награды | `reward_history`; незавершённые обязательства и отдельные основания дальнейшего хранения. |
| Entitlements, pets, corners, appearance | Приватная коллекция и разрешённая публичная часть дома | Инвентарь/питомцы/сцены | `player_collection`; уход/удаление и правила минимизации, без вечных имён в аудите. |
| Goals, contributions, house | Семейный прогресс, ограниченный состав общего дома | Прогресс/дом | `family_progress`; устойчивые обезличенные итоги при допустимости, без восстановления удалённой личности. |
| Lifecycle, export, erasure, receipts | Ограниченный журнал административных действий | Семья/процессы данных/операции | `lifecycle_audit`, `export_artifacts`, `idempotency_receipts`; сроки файлов и метаданных различны. |

У каждой записи R содержит конкретный policy ID из принятого перед запуском реестра; таблица задаёт проект ключей, а не готовые сроки. Публичные DTO строятся разрешёнными списками полей. Серверные ссылки на verifier/authority/evidence и внутренние заметки не сериализуются целиком. Неопределённые сроки, параметры безопасности и пределы текста блокируют соответствующий контракт реализации, но не заполняются выдуманными числами.

## 9. Проверка покрытия и следующий результат

Все runtime-сущности 4.1–4.4 DOMAIN_MODEL имеют выше поля либо явную ссылку на вспомогательный тип. Каталог и ассеты описаны в [CONTENT_DICTIONARY](CONTENT_DICTIONARY.md). Логические уникальности должны перейти в таблицу «инвариант → транзакция → SQL constraint/lock → сценарий проверки». Это следующий результат, вместе со схемами команд и точной картой старых данных; наличие слова Ref или статуса не является реализованной защитой.
