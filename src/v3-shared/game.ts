/** Shared data only: safe in the browser, without database/auth/runtime dependencies. */
export type Id = string;
export type Quantity = string;
export type Role = 'adult' | 'child';
export type Difficulty = 'easy' | 'normal' | 'hard' | 'epic';
export type Reward = { heroXp: Quantity; gold: Quantity; familyContribution: Quantity; petXp: Quantity };
export type Schedule = { kind: 'once' | 'daily' | 'weekly'; startsOn: string; weekdays: number[] };
export type TaskPart = { playerId: Id; difficulty: Difficulty; label: string };
export type TaskDefinition = {
  id: Id; revision: number; title: string; description: string; assignment: 'individual' | 'shared' | 'rotation';
  parts: TaskPart[]; schedule: Schedule; status: 'active' | 'retired'; rotationIndex: number;
};
export type CalendarPeriod = { id: Id; sequence: number; date: string; zone: string; startsAt: string; endsAt: string; revision: number };
export type Occurrence = {
  id: Id; taskId: Id; taskRevision: number; revision: number; title: string; description: string;
  assignment: TaskDefinition['assignment']; period: CalendarPeriod; scheduledFor: string; openedAt: string;
  submissionThrough: string; goalId: Id | null; adventureId: Id | null; policyRevision: number;
  budget: Reward; allocationIds: Id[]; status: 'open' | 'complete' | 'cancelled'; cancellationReason: string | null;
};
export type Allocation = {
  id: Id; occurrenceId: Id; playerId: Id; memberId: Id; role: Role; label: string;
  difficulty: Difficulty; reward: Reward; petId: Id | null; revision: number;
  status: 'open' | 'submitted' | 'returned' | 'settled' | 'cancelled'; latestAttemptId: Id | null;
};
export type Attempt = {
  id: Id; allocationId: Id; predecessorId: Id | null; performedOn: string; note: string | null;
  submittedAt: string; submittedBy: Id; digest: string; revision: number;
  status: 'submitted' | 'returned' | 'accepted';
  decision: null | { kind: 'adult_self_trusted' | 'manual_child_review'; actorMemberId: Id; result: 'accept' | 'return'; reason: string | null; decidedAt: string };
};
export type LedgerEntry = {
  id: Id; playerId: Id; kind: 'gold' | 'hero_xp' | 'pet_xp' | 'family_contribution' | 'adventure_damage';
  delta: string; causeKey: string; settlementId: Id | null; originalEntryId: Id | null;
  goalId: Id | null; petId: Id | null; adventureId: Id | null; postedAt: string; performedOn: string | null;
};
export type Settlement = {
  id: Id; allocationId: Id; attemptId: Id; playerId: Id; performedOn: string; acceptedAt: string;
  reward: Reward; goalId: Id | null; petId: Id | null; adventureId: Id | null;
  effectIds: Id[]; correctionId: Id | null; revision: number;
};
export type PlayerProgress = {
  playerId: Id; revision: number; heroXp: Quantity; postedGold: Quantity; reservedGold: Quantity;
  starterEligible: boolean; starterPetId: Id | null; petTargetId: Id | null; companionId: Id | null;
  appearance: { outfit: Id | null; hand: Id | null };
};
export type OwnedItem = { id: Id; itemId: string; ownerKind: 'player' | 'family'; ownerId: Id; purchaserId: Id; acquiredAt: string };
export type Pet = {
  id: Id; playerId: Id; species: string; xp: Quantity; revision: number; hatched: boolean; grown: boolean;
  acquiredAt: string; hatchedAt: string | null; corner: { theme: 'meadow' | 'sky' | 'sand'; name: string } | null;
};
export type PurchaseQuote = {
  id: Id; playerId: Id; itemId: string; offerRevision: number; price: Quantity; ownerKind: 'player' | 'family';
  ownerId: Id; expiresAt: string; catalogFingerprint: string;
};
export type Purchase = { id: Id; quoteId: Id; playerId: Id; itemId: string; price: Quantity; ownedItemId: Id; acquiredAt: string };
export type Goal = {
  id: Id; revision: number; title: string; roster: { playerId: Id; dailyNorm: number }[];
  plannedDays: number; target: Quantity; earned: Quantity; active: boolean; milestoneId: Id | null; createdAt: string;
};
export type RealOffer = {
  id: Id; revision: number; title: string; promise: string; fulfillmentTerms: string; price: Quantity;
  eligiblePlayerIds: Id[]; active: boolean;
};
export type RewardQuote = {
  id: Id; playerId: Id; offerId: Id; offerRevision: number; expiresAt: string;
  terms: Pick<RealOffer, 'title' | 'promise' | 'fulfillmentTerms' | 'price'>;
};
export type RewardOrder = {
  id: Id; revision: number; quoteId: Id; playerId: Id; offerId: Id; terms: RewardQuote['terms'];
  status: 'pending_approval' | 'approved_awaiting_delivery' | 'rejected' | 'cancelled' | 'delivered';
  reserve: 'active' | 'released' | 'captured'; requestedAt: string; decidedAt: string | null;
  decisionBy: Id | null; decisionReason: string | null; deliveredAt: string | null; deliveredBy: Id | null;
  deliveryNote: string | null;
  history: { kind: 'approve' | 'reject' | 'cancel_pending' | 'cancel_adult' | 'cancel_resolved' | 'deliver'; actorId: Id; reason: string | null; at: string }[];
};
export type RewardCancellation = {
  id: Id; orderId: Id; predecessorId: Id | null; revision: number; reason: string;
  status: 'pending' | 'approved' | 'declined'; requestedAt: string; requestedBy: Id;
  decidedBy: Id | null; decidedAt: string | null; decisionReason: string | null;
};
export type CorrectionPlan = { entryId: Id; kind: LedgerEntry['kind']; applied: Quantity; waived: Quantity };
export type CorrectionPreview = { id: Id; settlementId: Id; reason: string; plan: CorrectionPlan[]; expiresAt: string };
export type Correction = {
  id: Id; settlementId: Id; previewId: Id; revision: number; reason: string; plan: CorrectionPlan[];
  effectIds: Id[]; status: 'applied' | 'restored'; createdAt: string; restoredAt: string | null; restoreReason: string | null;
};
export type Adventure = {
  id: Id; revision: number; title: string; roster: Id[]; target: Quantity; damage: Quantity;
  status: 'active' | 'paused' | 'won'; trophyId: Id | null; createdAt: string;
};
export type Trophy = { id: Id; kind: 'goal' | 'adventure'; sourceId: Id; title: string; earnedAt: string };
export type FamilySettings = {
  zone: string; lateDays: number; revision: number; pendingZone: string | null; zoneEffectiveAt: string | null;
};
export type GameWorld = {
  version: 1; revision: number; settings: FamilySettings; periods: CalendarPeriod[];
  tasks: TaskDefinition[]; occurrences: Occurrence[]; allocations: Allocation[]; attempts: Attempt[];
  settlements: Settlement[]; ledger: LedgerEntry[]; progress: PlayerProgress[]; owned: OwnedItem[];
  pets: Pet[]; quotes: PurchaseQuote[]; purchases: Purchase[]; goals: Goal[]; offers: RealOffer[];
  rewardQuotes: RewardQuote[]; orders: RewardOrder[]; cancellations: RewardCancellation[];
  correctionPreviews: CorrectionPreview[]; corrections: Correction[]; adventures: Adventure[]; trophies: Trophy[];
};
export type PublicMember = {
  id: Id; playerId: Id | null; name: string; role: Role; active: boolean; playerStatus: string | null;
  visual?: {outfitItemId:string|null;handItemId:string|null;companionSpecies:string|null;companionState:'pet'|'companion'};
};
export type GameProjection = {
  revision: number; serverTime: string; today: string; familyId: Id; memberId: Id; playerId: Id | null; role: Role;
  capabilities: string[]; members: PublicMember[]; settings: FamilySettings;
  tasks: TaskDefinition[]; occurrences: Occurrence[]; allocations: Allocation[]; attempts: Attempt[];
  progress: PlayerProgress | null; ledger: LedgerEntry[]; settlements: Settlement[];
  owned: OwnedItem[]; pets: Pet[]; purchases: Purchase[]; goals: Goal[]; offers: RealOffer[];
  orders: RewardOrder[]; cancellations: RewardCancellation[]; corrections: Correction[];
  adventures: Adventure[]; trophies: Trophy[];
};
export type OperationResult = { kind: string; id: Id | null; revision: number | null; details?: Record<string, unknown> };
export type GameResponse = { outcome: 'committed' | 'already_applied'; operationId: Id; result: OperationResult; projection: GameProjection };
