# Family Life RPG V3 — контракт команд v0.1

Дата: 2026-09-09. Статус: технический проект этапа 2. Реализация команд, HTTP, ledger, БД и миграций этим документом не выполняется. Offline-модель проверяет численные предложения и отдельные сценарии; она не доказывает серверные транзакции, авторизацию или конкурентный доступ.

Связанные документы: [продуктовый контракт](PRODUCT_CONTRACT_V01.md), [матрица UI](UI_STATE_MATRIX_V01.md), [план](STAGED_PLAN.md), [карточка следующего этапа](STAGE_3_CARD.md). Новый серверный контракт принадлежит только V3. Он не меняет существующие `src/target` Player/check/FK с ограничением `child-only`.

## 1. Принятое и проектируемое

**Принято пользователем:** взрослые тоже игроки; взрослый самостоятельно отмечает собственные дела; детский результат подтверждает взрослый; проверка не награждает проверяющего; реальные семейные награды пока только детям. Данные и интерфейс V3 остаются изолированными от двух предыдущих вариантов.

**Рабочие предложения v0.1:** конкретные DTO, моменты замораживания, календарные переходы, коды ошибок, компенсация, резерв до выдачи реальной награды и SQL-механизмы. Они делают принятые правила проверяемыми, но не называются отдельно принятыми пользователем техническими решениями.

Семейная цель v0.1 проектируется накопительной, без календарного сгорания. Недельный ориентир — план, не deadline начисления. Цель, состав долей и условия фиксируются до работы. Закрытие/достижение цели не переносит старые доли в новую цель и не уничтожает обещанный вклад.

## 2. Общие типы и границы доверия

Ниже TypeScript-подобные **проектные wire-типы**, не существующий импортируемый SDK. Объекты закрытые: неизвестные поля отклоняются. Все ссылки дополнительно проверяются на существование, семью и полномочия; TypeScript brand не заменяет runtime validation.

```ts
type EntityId = string;       // UUIDv7, созданный сервером; fixture IDs — только offline
type Revision = number;      // положительное безопасное целое
type Instant = string;       // строгий RFC3339 UTC
type LocalDate = string;     // действительная YYYY-MM-DD
type ZoneId = string;        // IANA zone, проверенная выбранной TZDB
type UInt = string;          // каноническое целое 0..9223372036854775807
type Int = string;           // каноническая знаковая дельта в согласованном bigint диапазоне
type ContentRef = { definitionId: string; revision: Revision };
type RewardVector = {
  heroXp: UInt; gold: UInt; familyContribution: UInt; petXp: UInt;
};
type CommandEnvelope<K extends string, P> = {
  contract: 'family_life_v3.commands'; version: '0.1';
  command: K; idempotencyKey: string; payload: P;
};
```

`UInt` передаётся строкой, не float. Offline-функции используют те же четыре названия полей с проверенными безопасными целыми JavaScript; адаптер wire → model обязан проверять точность, а не выполнять безусловный `Number(bigintString)`. Денежные остатки и обещанные количества не округляются при JSON/SQL-переходе.

В envelope нет `actorId`, capabilities, нового баланса, суммы выдачи или выбранной клиентом версии правил. Клиент передаёт намерение и проверяемые ссылки. Серверный auth adapter создаёт `VerifiedActor` после проверки сессии/привязки; guard заново проверяет её актуальность в транзакции перед эффектами.

```ts
type MemberProfile = {
  id: EntityId; familyId: EntityId; familyRole: 'adult' | 'child';
  displayName: string; status: 'active' | 'left' | 'archived';
  revision: Revision;
};
type Player = {
  id: EntityId; familyId: EntityId; memberId: EntityId;
  status: 'active' | 'paused' | 'left' | 'archived'; revision: Revision;
}; // familyRole отсутствует: Player возможен у adult и child
type Capability =
  | 'family.read' | 'family.manage' | 'tasks.manage'
  | 'completion.submit_self' | 'completion.review_child'
  | 'shop.purchase_self' | 'shop.purchase_family_item'
  | 'appearance.select_self' | 'real_reward.request_self'
  | 'real_reward.review_child' | 'real_reward.cancel_child' | 'real_reward.deliver_child';
type CapabilityGrant = {
  familyId: EntityId; subjectMemberId: EntityId; capability: Capability;
  scope: 'self' | 'children_of_family' | 'family'; revision: Revision;
};
type VerifiedActor = {
  accountId: EntityId; sessionId: EntityId; bindingId: EntityId;
  familyId: EntityId; actingMemberId: EntityId; actingPlayerId: EntityId | null;
  mode: 'adult' | 'own_child' | 'managed_child';
  sessionRevision: Revision; capabilityRevision: Revision;
  grants: readonly CapabilityGrant[];
}; // внутренний тип; никогда не десериализовать из command payload
```

Наличие Player, золота, взрослого портрета или `familyRole='adult'` само по себе не даёт административных прав. Детский режим на устройстве взрослого действует в детских capabilities. Просмотр другого героя не изменяет `actingMemberId`. Пауза участия Player не отзывает автоматически административные grants взрослого: его собственная игровая активность и проверка детских результатов различаются. Отзыв привязки/сессии/capability должен сериализоваться с командами: после состоявшегося отзыва старая сессия не совершает эффект по ранее полученному snapshot.

### Принятие результата

```ts
type AcceptancePolicy =
  | { kind: 'adult_self_trusted'; policyRevision: Revision }
  | { kind: 'child_requires_adult'; policyRevision: Revision };
```

- `adult_self_trusted`: взрослый отправляет **свою** долю; сервер принимает её в этой же команде по системной политике. Это не ручное `ReviewCompletion` самого себя.
- `child_requires_adult`: после отправки только `submitted`, без награды. Принять/вернуть может актуальный взрослый с `completion.review_child` этой семьи.
- `ReviewCompletion`, у которого reviewer Player совпадает с beneficiary Player, всегда `SELF_REVIEW_FORBIDDEN`. Trusted-self — отдельная явно зарегистрированная ветка submit, не исключение, получаемое флагом клиента.
- Начисление направляется владельцу доли. Reviewer и его Player не получают ни XP/Gold, ни второй личный/семейный вклад за проверку.
- Отметка взрослым за ребёнка — отдельное будущее `SubmitChildCompletionOnBehalf` с отдельным capability и audit actor. Она не наследуется автоматически от review. При её последующем проектировании взрослый и ребёнок имеют разных beneficiary/reviewer; наличие второго взрослого не является обязательным условием детской проверки.

## 3. Условия дела замораживаются до работы

```ts
type CalendarSnapshot = {
  calendarRevision: Revision; zoneId: ZoneId; tzdbVersion: string;
  periodId: EntityId; periodSequence: UInt; localLabel: LocalDate;
  startsAt: Instant; endsBefore: Instant; dayBoundary: '00:00';
};
type GoalBinding =
  | { kind: 'goal'; goalId: EntityId; goalTermsRevision: Revision }
  | { kind: 'none' };
type FamilyGoal = {
  id: EntityId; familyId: EntityId; revision: Revision; termsRevision: Revision;
  targetContribution: UInt;
  plannedRoster: readonly { playerId: EntityId; dailyContributionNorm: UInt }[];
  plannedActiveDays: number; acceptNewAllocations: boolean;
  contributionTotal: UInt; milestoneKey: string; milestoneClaimId: EntityId | null;
}; // target/plan/milestone terms immutable; contributionTotal — проверяемая проекция
type PetXpDestination =
  | { kind: 'owned_pet'; ownedPetId: EntityId }
  | { kind: 'egg'; eggAcquisitionId: EntityId }
  | { kind: 'none' };
type TaskRevision = {
  taskId: EntityId; revision: Revision; familyId: EntityId;
  title: string; instructions: string;
  schedule: { seriesId: EntityId; recurrenceRevision: Revision; kind: 'once' | 'daily' | 'weekly' };
  assignment: 'individual' | 'shared'; rewardPolicy: ContentRef;
  acceptanceRules: {
    adult: 'adult_self_trusted'; child: 'child_requires_adult'; policyRevision: Revision;
  };
  status: 'active' | 'retired';
};
type TaskOccurrence = {
  id: EntityId; familyId: EntityId; revision: Revision;
  taskId: EntityId; taskRevision: Revision;
  occurrenceKey: { seriesId: EntityId; periodId: EntityId; scheduleSlot: string };
  calendar: CalendarSnapshot; scheduledFor: LocalDate;
  openedAt: Instant; submissionWindow: { from: LocalDate; through: LocalDate | null };
  membershipRevision: Revision; participantPlayerIds: readonly EntityId[];
  rewardPolicy: ContentRef; totalBudget: RewardVector; goalBinding: GoalBinding;
  allocationIds: readonly EntityId[]; status: 'open' | 'closed_complete' | 'closed_cancelled';
};
type ParticipantAllocation = {
  id: EntityId; familyId: EntityId; occurrenceId: EntityId; revision: Revision;
  originalPlayerId: EntityId; beneficiaryPlayerId: EntityId;
  reward: RewardVector; acceptancePolicy: AcceptancePolicy;
  petXpDestination: PetXpDestination;
  status: 'open' | 'submitted' | 'returned' | 'settled' | 'cancelled';
  latestAttemptId: EntityId | null; settlementId: EntityId | null;
};
```

Материализация occurrence — серверная операция, а не побочный эффект React render. Она получает актуальную версию дела и выбранную до работы цель, создаёт **один** immutable snapshot и все доли. Момент «можно начать дело» наступает только после существования этого snapshot. Клиент не выбирает после выполнения более выгодную цель/сумму/состав.

Чтение active goal head/его revision и создание occurrence выполняются под одним family guard в одной транзакции. Одновременная смена цели либо предшествует всему snapshot, либо следует после него; нельзя сохранить половину долей на старую цель и половину на новую. Acceptance использует сохранённый binding, не active head.

Для общего дела `SUM(allocation.reward[k]) === totalBudget[k]` по каждому из четырёх полей. Доли — явные целые числа. Нельзя независимо округлить проценты и потерять остаток или распределить его по случайному порядку массива пользователей. `validateRewardAllocations` проверяет точную сумму; способ назначения долей остаётся явным authoring/input решением до материализации.

Допустимо сначала оценить реальные части работы, затем получить общий budget суммой этих оценок. В предложенном примере «стол к ужину» участникам заранее назначены разные реальные Easy-части. Варианты на 2/4/8 исполнителей — отдельные snapshots разного объёма работы, а не множитель к уже опубликованной задаче. Добавление наблюдателя, смена состава после открытия и повторная проверка не увеличивают budget.

При индивидуальном назначении одного шаблона нескольким игрокам это независимые личные occurrences/бюджеты; при `shared` — один общий budget с отдельными долями. Эти случаи нельзя определять по одному лишь количеству assignee IDs.

`GoalBinding` один у occurrence и всех его долей. `none` не означает «назначить активную цель позднее»: положительный familyContribution сохраняется в истории с явным отсутствием цели, не продвигая будущую. Изменение общей цели влияет только на новые occurrences. Принятый или позднее принятый вклад хранит исходную цель; превышение порога остаётся в её истории. Claim улучшения уникален по family/goal/milestone и не повторяется от нового запроса, поздней доли, коррекции и повторного достижения порога.

Изменение задания/награды/календаря/состава создаёт будущую revision. Открытые occurrences, их participant IDs, условия, доли и goal binding не переписываются. Retire определения прекращает будущие открытия, но не отменяет существующую работу: для этого отдельная CancelOccurrence. Ушедший участник не исчезает из snapshot: сохраняются его доля, попытки и attribution. Он теряет право **новых** действий через отозванный доступ; pending-результат может быть обработан оставшимся уполномоченным взрослым. Guard проверки не требует, чтобы получатель исторической pending-доли оставался активным игроком. Начисление остаётся на исходном Player/кошельке как историческое право, а не перераспределяется действующим детям. Перенос результата другому игроку требует отдельной будущей коррекции получателя.

`PetXpDestination` — согласованный рабочий вариант проекта P-PET-destination: конкретный owned pet/egg выбирается до работы; при `none` эффективный `petXp=0` уже в snapshot. Первое принятое дело создаёт право стартового выбора, а не автоматически выбирает питомца. Новые дела после явного получения яйца могут получить pet target; старые snapshots не переписываются. Pet XP target независим от просматриваемого питомца и активного спутника: яйцо может получать прогресс, пока рядом с героем отображается другой полученный pet. Для shared бюджет `petXp` должен совпадать с суммой **эффективных** долей после проверки target. Способ открытия работ (последовательно либо утренним набором) влияет на темп старта; offline-отчёт должен называть этот сценарий, а серверные получатели/эффекты проверяются отдельно.

## 4. Выполненный день и день принятия

`scheduledFor` — календарная позиция дела. `performedOn` — заявленный день фактического выполнения в `occurrence.calendar.zoneId`. `submittedAt` и `acceptedAt` — серверные UTC instants. Они не подменяют друг друга.

```ts
type CompletionAttempt = {
  id: EntityId; familyId: EntityId; allocationId: EntityId; attemptNumber: Revision;
  revision: Revision; predecessorReturnedAttemptId: EntityId | null;
  submittedByMemberId: EntityId; beneficiaryPlayerId: EntityId;
  performedOn: LocalDate; submittedAt: Instant; note: string | null;
  submissionDigest: string; lateSubmission: boolean;
  status: 'submitted' | 'returned' | 'accepted';
  decision: null | {
    id: EntityId; kind: 'accept' | 'return';
    actor: { kind: 'member'; memberId: EntityId } | { kind: 'trusted_policy'; policyRevision: Revision };
    decidedAt: Instant; reason: string | null;
  };
};
```

Содержимое отправленной попытки (дата, note, beneficiary, predecessor и digest) неизменно. Решение — одна добавленная запись; status/revision — её разрешённая проекция, а не право переписать исходную отправку. Return не удаляет попытку.

Проект календарного ввода: `performedOn` не в будущем по серверным часам в frozen zone и входит в сохранённое submission window; нижняя граница не раньше открытия работы. Поздняя отправка допустима, если сохранённое окно её разрешает; у результата остаётся исходная фактическая дата. Пока окно `through:null`, автоматического истечения нет. Изменение даты после возврата создаёт новую попытку с новым фактическим днём; прежняя попытка не редактируется.

Предложение требует отдельного уточнения перед календарной реализацией: какие прошлые даты доступны форме и нужен ли для взрослых дополнительный аудит необычно поздней отметки. Это не даёт клиентскому времени полномочий и не блокирует stage 3.1.

Пример: ребёнок выполнил дело 9 сентября в зоне семьи, отправил 10-го, взрослый принял 12-го. `performedOn=2026-09-09`, `submittedAt` — 10-е, `acceptedAt`/ledger `postedAt` — 12-е. Отчёт о выполнении относится к 9-му; доступные Gold появляются только 12-го. Нет начисления в кошелёк «задним числом», искусственного пропуска из-за задержки взрослого или переноса вклада в новую цель.

Смена зоны/расписания применяется после текущего зафиксированного calendar period. Его границы и все открытые instances сохраняются. Следующий period получает новую revision, UTC-границы без перекрытия и монотонный sequence. Косметическая правка task revision не является частью business occurrence key и не создаёт вторую сегодняшнюю награду. Для нового определения/удаления/повторного создания нужна отдельная политика; защита повтора не доказывает, что пользователь не описал одно реальное дело двумя разными заданиями.

## 5. Отправка, проверка и отмена

```ts
type SubmitCompletion = CommandEnvelope<'SubmitCompletion', {
  allocationId: EntityId; expectedAllocationRevision: Revision;
  continuation: { kind: 'first' } | { kind: 'after_return'; returnedAttemptId: EntityId };
  performedOn: LocalDate; note: string | null;
}>;
type ReviewCompletion = CommandEnvelope<'ReviewCompletion', {
  attemptId: EntityId; expectedAttemptRevision: Revision;
  decision: 'accept' | 'return'; reason: string | null;
}>;
type CancelOccurrence = CommandEnvelope<'CancelOccurrence', {
  occurrenceId: EntityId; expectedOccurrenceRevision: Revision; reason: string;
}>;
```

| Команда | Предусловия после проверки области | Атомарный переход | Отказ/повтор |
|---|---|---|---|
| SubmitCompletion, first | Активный actor — владелец активного Player/dole; `completion.submit_self`; occurrence открыт; allocation=open; валидная дата. | Одна попытка. Child → submitted без эффектов. Adult trusted-self → accepted + settlement/эффекты/receipt в одной транзакции. | Существующая попытка с тем же semantic submission возвращается; изменённые данные при том же semantic key → `SUBMISSION_CONTENT_CONFLICT`. |
| SubmitCompletion, after_return | Указанный returnedAttemptId — текущая возвращённая попытка этой доли; allocation=returned. | Новая append-only попытка с predecessor; старая причина сохраняется. Затем та же policy ветка принятия. | Старый first-запрос не является resubmit. Неактуальный predecessor → `RETURNED_ATTEMPT_NOT_CURRENT`; повтор этого predecessor возвращает уже созданную следующую попытку. |
| ReviewCompletion, accept | Актуальный adult capability; beneficiary — ребёнок этой семьи; attempt=submitted; policy=child_requires_adult; reviewer ≠ beneficiary. | Единственное решение accept → settlement + эффекты + receipt. | Второе accept с новым ключом возвращает уже принятый result. Противоположное состоявшееся решение → `ATTEMPT_ALREADY_DECIDED`. |
| ReviewCompletion, return | Те же review-права; непустая понятная причина; attempt=submitted. | Decision return; allocation=returned. Нет отрицательной награды и нет выдачи. | Повтор идентичного решения возвращает существующее. Другая причина не перезаписывает историю под тем же решением. |
| CancelOccurrence | `tasks.manage`, причина, актуальная revision. Нет submitted/pending долей. | Open/returned доли → cancelled; settled неизменны. Occurrence → closed_cancelled с историей частичного результата. | Любая pending доля → `PENDING_REVIEW_EXISTS`, 409, **ничего не изменилось**. Сначала принять/вернуть её отдельной командой, затем повторить отмену с новой проверенной revision. |

При гонке двух reviewers решение принимается под одной блокировкой/revision check. Победитель фиксирует переход; проигравший не создаёт другой attempt/settlement. Повтор того же уже совершённого действия обрабатывается до проверки старого `expectedRevision`, иначе корректный retry ошибочно станет конфликтом. Для действительно нового изменения revision обязательна.

Предлагаемый простой порядок блокировок V3: family guard → occurrence → allocation/attempt → связанные goal/кошельки по стабильному порядку ID. **Все** submit/review/cancel обязаны брать один occurrence guard до проверки состояния и создания попыток. Проверить pending без lock, а затем отменить после чужого submit — недопустимо. Окончательная реализация и тесты двух соединений относятся к этапу 3.

Отмена и submit также сериализуются. Если submit успел создать pending, отмена отвергается без частичного закрытия других долей. Если отмена первой закрыла долю, submit получает `ALLOCATION_CLOSED`. Отмена не компенсирует ранее принятые награды и не удаляет долю ушедшего участника.

## 6. Settlement, journal и смысловая уникальность

```ts
type CompletionSettlement = {
  id: EntityId; familyId: EntityId; occurrenceId: EntityId; allocationId: EntityId;
  acceptedAttemptId: EntityId; beneficiaryPlayerId: EntityId;
  performedOn: LocalDate; calendar: CalendarSnapshot; acceptedAt: Instant;
  promisedReward: RewardVector; rewardPolicy: ContentRef;
  goalBinding: GoalBinding; petXpDestination: PetXpDestination;
  effectIds: readonly EntityId[]; initialOperationId: EntityId;
};
type RewardEffectBase = {
  id: EntityId; familyId: EntityId; settlementId: EntityId;
  effectKey: string; beneficiaryPlayerId: EntityId;
  postedAt: Instant; performedOn: LocalDate; policy: ContentRef;
  originalEffectId: EntityId | null;
};
type RewardEffect = RewardEffectBase & (
  | { kind: 'hero_xp' | 'gold' | 'family_contribution' | 'pet_xp'; delta: Int }
  | { kind: 'starter_choice'; starterProgramKey: string; eligibilityId: EntityId }
);
```

На момент acceptance сервер читает frozen snapshot, а не действующий сегодня balance policy, каталог, размер семьи или новую цель. В v0.1 нет earning caps/diminishing, streak-множителей и платных бонусов. Их последующее добавление требует отдельного правила обещания **до работы**; нельзя уменьшить награду из-за позднего review или порядка обработки взрослых.

| Смысл | Постоянный уникальный ключ, независимо от request ID |
|---|---|
| Календарное открытие | family + series + period + scheduleSlot; task revision не создаёт второй слот. |
| Первая/повторная попытка | family + allocation + predecessorReturnedAttemptId, где first имеет отдельный non-null sentinel. |
| Решение | family + attempt; одно terminal decision. |
| Отмена occurrence | family + occurrence + cancel; повтор не закрывает доли заново и не переписывает причину. |
| Принятый результат | family + allocation; один initial settlement за всю жизнь доли. |
| Начальный reward effect | family + occurrence + allocation + rewardKind; namespace `initial`. |
| Право стартового выбора | family + player + starter_program; не по request ID или текущему числу питомцев. |
| Milestone цели | family + goal + milestoneKey; одно постоянное открытие. |
| Коррекция/восстановление | family + correctionCase + phase + originalEffectId. |
| Покупка/реальная заявка | family + purchaserPlayer + quote/intent ID. |
| Запрос отмены одобренного обещания | family + order + predecessorDeclinedCancellationId, где first имеет отдельный sentinel. |
| Постоянное владение | ownerScope + ownerId + ownershipKey; семейный owner отличается от личного purchaser. |

Effect key не содержит текущего actor/reviewer, времени повторного запроса, state revision или новой версии цены. Иначе один и тот же результат можно было бы повторно оплатить после изменения этих полей. Нулевой effect не создаёт ложное начисление; право starter choice моделируется отдельным типизированным grant, а не денежной дельтой.

Транзакция принятия: актуальная авторизация → блокировки нужных occurrence/allocation/attempt и владельцев эффектов → semantic uniqueness → решение/settlement → ledger/progress/entitlement → receipt. Любой сбой до commit откатывает **весь** набор. Outbox, если понадобится, записывается той же транзакцией; вызовы внешних сервисов не выполняются под игровыми locks. Наличие outbox не разрешает автоматически отправлять сообщения.

### Исправление ошибочного принятия — отдельный будущий механизм

Проект `CorrectSettlement` принимает settlement ID, reason, ожидаемые revisions и проверенный preview correction ID; клиент не задаёт дельты. Исходная запись остаётся. Попытка не переводится обратно в `open` для получения новой оплаты.

Для Gold предложение: `applied = min(ещё не компенсированные ошибочные Gold, available)`; остаток фиксируется как `waived`, не становится долгом и не удерживается из будущих доходов. Активные резервы, приобретённые вещи и уже открытый milestone не отбираются. XP/вклад компенсируются связанными точными эффектами согласно принятой политике. `RestoreCorrection` может восстановить только реально applied дельты исходной correction; waived не превращается в новое начисление.

Эти правила являются техническим предложением, а не готовым correction endpoint. Нужны отдельные тесты частично потраченной награды и product-решение до этапа 3.3. Перенос получателя между Player, произвольные цепочки исправлений и исправление фактической выдачи реального обещания сюда автоматически не входят.

## 7. Receipt и неизвестный сетевой результат

```ts
type OperationReceipt = {
  operationId: EntityId; familyId: EntityId; accountId: EntityId;
  command: string; commandVersion: '0.1'; idempotencyKey: string; requestDigest: string;
  status: 'committed' | 'rejected'; finishedAt: Instant;
  result: { kind: string; id: EntityId; revision: Revision | null } | null;
  rejectionCode: string | null;
};
type CommandResult =
  | { outcome: 'committed' | 'already_applied'; operationId: EntityId; result: { kind: string; id: EntityId }; projectionRevision: Revision }
  | { outcome: 'rejected'; code: string; retry: 'same_request' | 'refresh_and_new_intent' | 'not_allowed' };
type ClientTransportState = 'idle' | 'sending' | 'confirmed' | 'rejected' | 'unknown';
```

Receipt key scoped по family + проверенному account + command + idempotencyKey. Request digest покрывает каноническую command version/payload. Тот же ключ с другим payload — `IDEMPOTENCY_KEY_REUSED`, без исполнения новых данных. Повтор проходит текущую авторизацию **до** чтения персонального результата; отозванная сессия не получает старый ответ как обход доступа.

Порядок: проверить формат → текущую авторизацию/область → существующий receipt → постоянный semantic result → revision/preconditions нового действия. При успехе receipt фиксируется атомарно с эффектами. При доменном отказе можно сохранить rejected receipt без игровых эффектов. Технический SQL/timeout failure не записывается как успешный receipt.

`unknown` — только знание клиента о транспорте, не новый статус кошелька/settlement. После timeout, разрыва или неоднозначного 5xx интерфейс не увеличивает награду и не объявляет команду точно отклонённой. Он повторяет исходный envelope с тем же ключом либо запрашивает его outcome в своей области. Если новая вкладка потеряла request ID, постоянная уникальность allocation/intent всё равно запрещает повторную выдачу.

Очистка transport receipts не удаляет semantic keys settlement/claim/purchase. Повтор старого submit с новым ключом после return также не создаёт новую попытку: для этого обязателен явный continuation с текущим returnedAttemptId. Повтор `RequestRealReward` прежнего quote/intent после отмены возвращает прежнюю отменённую заявку, а не резервирует деньги заново. Новое реальное намерение требует нового quote/intent.

Receipt хранит ссылки/результат, а не бессрочную копию всего API-ответа семьи. Актуальная разрешённая проекция может быть пересчитана при повторе; её revision не должна откатывать клиент к прежнему состоянию. Конкретный срок хранения/access policy выбирается до production; в синтетических тестах истечение моделируется явно.

## 8. Личный кошелёк, покупка и владение

```ts
type Wallet = {
  id: EntityId; familyId: EntityId; ownerPlayerId: EntityId; currency: 'gold';
  posted: UInt; reserved: UInt; revision: Revision;
};
type WalletEntry = {
  id: EntityId; familyId: EntityId; walletId: EntityId; delta: Int;
  kind: 'reward' | 'item_purchase' | 'real_reward_delivery' | 'correction' | 'restoration';
  causeKey: string; operationId: EntityId; originalEntryId: EntityId | null; postedAt: Instant;
};
type OwnershipScope = { kind: 'player'; playerId: EntityId } | { kind: 'family'; familyId: EntityId };
type PurchaseQuote = {
  id: EntityId; familyId: EntityId; purchaserPlayerId: EntityId;
  offerId: EntityId; offerRevision: Revision; content: ContentRef; priceGold: UInt;
  ownershipKey: string; entitlementOwner: OwnershipScope; expiresAt: Instant;
}; // выдаёт сервер; клиент не задаёт priceGold/owner/snapshot
type PurchaseItem = CommandEnvelope<'PurchaseItem', { quoteId: EntityId; expectedOfferRevision: Revision }>;
type SelectAppearance = CommandEnvelope<'SelectAppearance', {
  selectionId: EntityId; expectedSelectionRevision: Revision;
  slotKey: string; ownedEntitlementId: EntityId | null;
}>;
```

`posted = SUM(entries.delta)`, `reserved = SUM(active reservations.amount)`, `available = posted − reserved ≥ 0`. `available` не редактируемое поле команды. Кошелёк личный и у взрослого, и у ребёнка. Family progress/XP не являются расходуемой общей копилкой; Stars/Pool в этот контракт не вводятся.

PurchaseQuote закрывает цену, получателя и offer revision для конкретного намерения. Если offer/условия изменились или quote истёк до принятия, `OFFER_CHANGED`/`QUOTE_EXPIRED`; нужен новый понятный quote, а не молчаливое списание другой цены. Известные prior purchase/intent проверяются до нового debit.

`PurchaseItem`: проверить текущие права и совместимость/доступность → wallet lock → available ≥ exact quote price → debit + purchase + entitlement + receipt в одной транзакции. Два одновременных расхода не используют один и тот же available. Уже существующий permanent ownership возвращает `ALREADY_OWNED` без списания. Примерка локальная; `SelectAppearance` отдельно проверяет право, совместимость и revision и не покупает вещь автоматически.

Для предложенного family lamp purchaser — взрослый со `shop.purchase_family_item`, оплата его личными Gold, `entitlementOwner={kind:'family'}`. Это не превращает личный кошелёк в общий. Другая семья/детский purchaser/подмена owner → отказ до debit. Состав семейных товаров и это правило каталога — proposal, а не неявное свойство любого PNG мебели.

## 9. Реальные награды: reserve до выдачи

В v0.1 проектируется один режим: ребёнок запрашивает обещание, взрослый принимает решение, после фактической выдачи фиксируется расход. Прежний гарантированный режим основной спецификации сохраняется как отдельное будущее направление; он не включается автоматически отдельной командой `PurchaseRealReward`.

```ts
type RealRewardOrder = {
  id: EntityId; familyId: EntityId; childPlayerId: EntityId; revision: Revision;
  quoteId: EntityId; offerId: EntityId; offerRevision: Revision;
  terms: { title: string; promise: string; priceGold: UInt; fulfillmentTerms: string };
  requestedAt: Instant; reservationId: EntityId;
  status: 'pending_approval' | 'approved_awaiting_delivery' | 'delivered' | 'rejected' | 'cancelled';
  approvedByMemberId: EntityId | null; decidedAt: Instant | null;
  deliveredByMemberId: EntityId | null; deliveredAt: Instant | null;
};
type RealRewardQuote = {
  id: EntityId; familyId: EntityId; childPlayerId: EntityId;
  offerId: EntityId; offerRevision: Revision; expiresAt: Instant;
  terms: RealRewardOrder['terms'];
}; // отдельный от графического ContentRef и item PurchaseQuote
type Reservation = {
  id: EntityId; familyId: EntityId; walletId: EntityId; orderId: EntityId; amount: UInt;
  status: 'active' | 'captured' | 'released'; captureEntryId: EntityId | null;
  terminalOperationId: EntityId | null;
};
type RewardCancellation = {
  id: EntityId; familyId: EntityId; orderId: EntityId; revision: Revision;
  predecessorDeclinedCancellationId: EntityId | null;
  requestedByMemberId: EntityId; requestedAt: Instant; reason: string;
  status: 'pending' | 'approved' | 'declined';
  decidedByMemberId: EntityId | null; decidedAt: Instant | null; decisionReason: string | null;
};
type RequestRealReward = CommandEnvelope<'RequestRealReward', { quoteId: EntityId; expectedOfferRevision: Revision }>;
type ReviewRealReward = CommandEnvelope<'ReviewRealReward', { orderId: EntityId; expectedRevision: Revision; decision: 'approve' | 'reject'; reason: string | null }>;
type CancelRealRewardRequest = CommandEnvelope<'CancelRealRewardRequest', { orderId: EntityId; expectedRevision: Revision }>;
type RequestRewardCancellation = CommandEnvelope<'RequestRewardCancellation', {
  orderId: EntityId; expectedRevision: Revision; reason: string;
  continuation: { kind: 'first' } | { kind: 'after_decline'; declinedCancellationId: EntityId };
}>;
type ResolveRewardCancellation = CommandEnvelope<'ResolveRewardCancellation', { cancellationId: EntityId; expectedRevision: Revision; decision: 'approve' | 'decline'; reason: string | null }>;
type CancelApprovedRealRewardByAdult = CommandEnvelope<'CancelApprovedRealRewardByAdult', {
  orderId: EntityId; expectedRevision: Revision; reason: string;
}>;
type ConfirmRealRewardFulfillment = CommandEnvelope<'ConfirmRealRewardFulfillment', { orderId: EntityId; expectedRevision: Revision; note: string | null }>;
```

| Переход | Кто / предусловия | Деньги и атомарный результат |
|---|---|---|
| request → pending_approval | Child Player acting self; `real_reward.request_self`; quote действителен; available хватает; нет незавершённого заказа того же offer у ребёнка. | Создать order + active reservation + receipt одновременно. Posted неизменен, available меньше. |
| pending → approved_awaiting_delivery | Adult `real_reward.review_child`; текущая revision; те же исходные terms. | Order approved; **reservation остаётся active**. Gold ещё не списаны. |
| pending → rejected | Тот же adult; причина обязательна. | Reservation released; available снова доступен. Никакого положительного WalletEntry. |
| pending → cancelled | Ребёнок-владелец заявки; актуальная revision. | Reservation released, order cancelled; credit/refund не создаётся. |
| approved → cancellation pending | Ребёнок-владелец, RequestRewardCancellation с причиной и актуальной revision. | Order остаётся approved_awaiting_delivery; reservation active, без debit/release. Одна незавершённая cancellation на order. |
| cancellation pending → approved | Adult с правом review этой детской награды, ResolveRewardCancellation approve; order ещё не delivered. | Cancellation approved, order cancelled, reservation released. Исходные terms и решение сохраняются; credit не создаётся. |
| cancellation pending → declined | Тот же adult, ResolveRewardCancellation decline с объяснением. | Order/reserve остаются approved_awaiting_delivery/active. Путь подтверждения выдачи снова доступен. |
| approved → cancelled взрослым | CancelApprovedRealRewardByAdult: adult `real_reward.cancel_child`, причина невозможности/отмены обещания, актуальная revision, ещё active reserve и не delivered. | Order cancelled + reservation released; child request не обязателен. Если child cancellation уже pending, в той же транзакции она завершается approved с отдельной причиной решения взрослого; исходная просьба сохраняется. |
| approved → delivered | Adult `real_reward.deliver_child`; подтверждает реальную выдачу; active reservation ровно исходной суммы; **нет pending cancellation**. | Одновременно reservation captured + один debit на её amount + delivery record + terminal order + receipt. |

Иконки/карточки `awaiting` и `reserved` — два представления **того же** pending order, не два этапа или два резерва. Для простоты v0.1 price real reward > 0; нулевое бесплатное обещание требует отдельного поддержанного условия и не притворяется monetary reservation.

Эта reserve-until-delivery модель **отличается** от прежнего основного контракта со списанием при одобрении. В V3 до delivery возврата потраченных Gold нет: освобождается удержанная сумма. При доставке расходуется exact сохранённая сумма, а не новая цена. Ложная отметка delivered не исправляется обычной отменой; понадобится отдельная подтверждаемая correction policy. Delivered — terminal для обычного v0.1.

Невозможность исполнить обещание не заставляет ребёнка самому инициировать отмену: для этого существует отдельная взрослая команда выше. В pending_approval взрослый использует ReviewRealReward reject; CancelApprovedRealRewardByAdult предназначена только для approved_awaiting_delivery. В другой нетерминальной стадии — `ORDER_STATE_CONFLICT`; после delivered — `REWARD_ALREADY_DELIVERED`. При любом исходе проверяющий/отменяющий не получает награду.

Гонки approve/cancel, reject/cancel и deliver/cancel сериализуются по order и wallet. Ровно один terminal reservation transition: capture **или** release. Пока cancellation pending, ConfirmRealRewardFulfillment получает `CANCELLATION_PENDING`: сначала нужно разрешить запрос. Если delivery победила до RequestRewardCancellation, запрос отклоняется `REWARD_ALREADY_DELIVERED`; если запрос создан первым, выдача ждёт его решения. Повтор того же действия возвращает исходный outcome и не создаёт вторую выдачу/списание. Новая cancellation после предыдущего decline требует continuation с текущим declinedCancellationId; сохранённый first/старый predecessor не открывает запрос заново даже с новым idempotencyKey. Изменённая причина под тем же semantic key → `CANCELLATION_CONTENT_CONFLICT`, без переписывания истории. Удаление/изменение/скрытие offer не уничтожает существующий order и его terms; автоматического истечения pending/approved обещания нет.

## 10. Ошибки должны различаться

| Код | Категория будущего transport | Смысл для UI/повтора |
|---|---|---|
| `INVALID_COMMAND`, `UNKNOWN_FIELD`, `INVALID_QUANTITY`, `INVALID_DATE` | 400 | Неверный payload; никакого исполнения. |
| `SESSION_INVALID` | 401 | Нужен вход; старый receipt не раскрывается. |
| `CAPABILITY_DENIED`, `SELF_REVIEW_FORBIDDEN`, `CHILD_REWARD_ONLY` | 403 | Это не нехватка Gold и не временная сеть; действие запрещено. |
| `RESOURCE_UNAVAILABLE` | 404 | Нет доступного объекта; не раскрывать, существует ли он у другой семьи. |
| `IDEMPOTENCY_KEY_REUSED` | 409 | Тот же transport key с другим payload. Не повторять изменённые данные под старым ключом. |
| `REVISION_CONFLICT` | 409 | Обновить разрешённую проекцию; новое намерение после просмотра изменений. |
| `ATTEMPT_ALREADY_DECIDED`, `ALLOCATION_CLOSED`, `RETURNED_ATTEMPT_NOT_CURRENT`, `SUBMISSION_CONTENT_CONFLICT` | 409 | Конкретное изменение уже невозможно; показать сохранённый статус. |
| `PENDING_REVIEW_EXISTS` | 409 | Отмена occurrence ничего не изменила; сначала разрешить pending доли. |
| `INSUFFICIENT_AVAILABLE_GOLD` | 409 | Объяснить posted/reserved/available; никакого частичного debit/reserve. |
| `ALREADY_OWNED`, `ORDER_ALREADY_OPEN`, `OFFER_CHANGED`, `QUOTE_EXPIRED` | 409 | Новое намерение невозможно; не списывать, показать имеющееся право/заказ или новый quote. Точный повтор ранее committed intent возвращает 200 `already_applied`, а не эту ошибку. |
| `CANCELLATION_PENDING` | 409 | До подтверждения выдачи взрослый должен решить существующий запрос отмены; reserve остаётся active. |
| `CANCELLATION_CONTENT_CONFLICT`, `DECLINED_CANCELLATION_NOT_CURRENT` | 409 | Новый запрос отмены не может переписать прежнюю причину или продолжить неактуальное решение. |
| `REWARD_ALREADY_DELIVERED`, `RESERVATION_ALREADY_FINAL` | 409 | Терминальный результат; простой cancel не создаёт refund. |
| `ORDER_STATE_CONFLICT` | 409 | Команда не соответствует текущей стадии заказа; перечитать её, не выполнять другую операцию молча. |
| `POLICY_UNSUPPORTED`, `PET_DESTINATION_UNRESOLVED` | 422 | Зависимый тип ещё не поддержан; не активировать обещание с неисполняемым эффектом. |
| Неизвестный исход commit/сети | Нет достоверного доменного отказа | Клиент unknown; исходная попытка/ключ до сверки, без award again. |

Committed и точный semantic replay — 200 с outcome `committed`/`already_applied`; новое недопустимое намерение — конкретный отказ из таблицы. Эти случаи не зависят от того, узнал ли UI о предыдущем результате. На этапе 2 это проект transport mapping, а сервер не запускается.

## 11. API offline-модели и будущие проверки

У численной модели согласованы имена: `BALANCE_POLICY_V01`, `RewardVector {heroXp,gold,familyContribution,petXp}`, `getTaskReward`, `xpToNextLevel`, `totalXpToLevel`, `projectHeroLevel`, `validateRewardAllocations`, `planFamilyGoal`, `projectGoalProgress`, `projectPetProgress`. Policy имеет `version:'v0.1'`, `status:'proposed'`, `simulationOnly:true`. Числа берутся только из модели/отчёта, не дублируются здесь как второй источник истины.

Точная сигнатура планирования: `planFamilyGoal(roster, { goalId?, plannedActiveDays? })`. ID модели `v3.balance.v0.1` — метка offline-предложения, не опубликованный ContentRef; будущая серверная регистрация policy требует отдельного exact mapping/revision. Она не возникает от импорта balance.ts.

Точный API и ограничения — [BALANCE_V01, раздел 7](BALANCE_V01.md). `projectGoalProgress` принимает уже accepted, business-unique contributions и не дедуплицирует их. Его `milestoneCount:0|1` — текущая численная проекция, не receipt выдачи постоянного улучшения: после коррекции ниже порога нельзя этим значением удалить ранее заработанный unlock. `simulateAcceptedEffects` существует только в offline-скрипте как Map-fixture; он не является settlement/authorization/DB guard.

Если понадобятся чистые policy-функции следующего среза, предлагаемый API: `authorizeCommand(actor,resourceScope,command)`, `freezeOccurrence(input,policy)`, `classifySubmission(existing,continuation,digest)`, `planSettlement(acceptedAttempt,frozenOccurrence,allocation)`, `planReservationTransition(order,reservation,command)`. Они возвращают закрытые decision/effect plans либо typed errors, не обращаются к storage/clock/network. Время и IDs передаются явно. Их реализация/названия согласуются с владельцем модели; эти функции пока не существуют.

Имена будущих pet/goal extensions для общей карты: `SelectStarterEgg`, `SelectPetXpTarget`, `HatchPetEgg`, `SelectCompanion`, `SavePetCorner`, `SelectFamilyGoal`. Их DTO/auth/compatibility/claim contracts в этом срезе не определены и подключение не разрешено. Pet XP target, active companion и просмотр коллекции — три независимых понятия; бесплатный уголок возникает по будущему получению pet, а не по смене изображения.

Будущая обязательная матрица: два reviewers; новый request ID после commit и после очищенного receipt; replay first после return; изменённый payload при старом key; частичный shared cancel с pending; submit vs cancel; выход участника при pending; позднее acceptance после goal closure; изменение policy/calendar между работой и review; две покупки при ограниченном available; reserve против покупки; request replay после cancel; deliver vs cancel; взрослая отмена невозможного обещания без child request и при существующей pending cancellation; rollback между debit и entitlement; частично потраченный ошибочный grant; отозванный actor при receipt replay. Результаты этой матрицы нельзя объявлять PASS по offline-арифметике.
