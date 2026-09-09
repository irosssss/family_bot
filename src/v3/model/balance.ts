/** Proposed v0.1 arithmetic. Read-only UI imports are safe; no settlement or side effects. */
export const MODEL_STATUS_V01 = Object.freeze({
  version: 'v0.1', status: 'proposed', simulationOnly: true,
} as const);

export type DifficultyV01 = 'easy' | 'normal' | 'hard' | 'epic';
export type RewardVector = Readonly<{
  heroXp: number;
  gold: number;
  familyContribution: number;
  petXp: number;
}>;

export type RoutineIdV01 = 'calm' | 'baseline' | 'busy';
export type RoutineV01 = Readonly<{ id: RoutineIdV01; label: string; tasks: readonly DifficultyV01[] }>;
export const ROUTINES_V01: readonly RoutineV01[] = Object.freeze([
  Object.freeze({ id: 'calm', label: 'Спокойный день', tasks: Object.freeze(['easy', 'normal'] as const) }),
  Object.freeze({ id: 'baseline', label: 'Базовый день', tasks: Object.freeze(['easy', 'normal', 'normal', 'hard'] as const) }),
  Object.freeze({ id: 'busy', label: 'Насыщенный день', tasks: Object.freeze(['easy', 'easy', 'normal', 'normal', 'hard', 'hard'] as const) }),
]);

export const BALANCE_POLICY_V01 = Object.freeze({
  ...MODEL_STATUS_V01,
  id: 'v3.balance.v0.1',
  taskRewards: Object.freeze({
    easy: Object.freeze({ heroXp: 5, gold: 3, familyContribution: 1, petXp: 1 }),
    normal: Object.freeze({ heroXp: 15, gold: 8, familyContribution: 3, petXp: 2 }),
    hard: Object.freeze({ heroXp: 30, gold: 15, familyContribution: 6, petXp: 4 }),
    epic: Object.freeze({ heroXp: 60, gold: 30, familyContribution: 12, petXp: 8 }),
  }),
  hero: Object.freeze({ firstTransitionXp: 60, incrementPerLevel: 2, maximumLevel: 100 }),
  family: Object.freeze({ defaultDailyContributionNorm: 13, defaultPlannedActiveDays: 10 }),
  pet: Object.freeze({ hatchXp: 50, firstGrowthAdditionalXp: 72 }),
  hiddenBonuses: false,
  goldExpiry: false,
  streakMultiplier: false,
  familyWallet: false,
});

const rewardFields = ['heroXp', 'gold', 'familyContribution', 'petXp'] as const;

function whole(value: number, label: string, minimum = 0) {
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw new RangeError(`${label} must be a safe whole number >= ${minimum}`);
  }
  return value;
}

function sumWhole(values: readonly number[], label: string) {
  return values.reduce((total, value) => whole(total + whole(value, label), label), 0);
}

function nonempty(value: string, label: string) {
  if (typeof value !== 'string' || value.trim().length === 0) throw new TypeError(`${label} is required`);
  return value;
}

export function getTaskReward(difficulty: DifficultyV01): RewardVector {
  if (!Object.hasOwn(BALANCE_POLICY_V01.taskRewards, difficulty)) throw new RangeError('Unknown difficulty');
  return BALANCE_POLICY_V01.taskRewards[difficulty];
}

/** Pet XP here is potential income with an eligible target, not a retroactive grant. */
export function routineReward(id: RoutineIdV01): RewardVector {
  const routine = ROUTINES_V01.find(candidate => candidate.id === id);
  if (!routine) throw new RangeError('Unknown routine');
  return Object.freeze(Object.fromEntries(rewardFields.map(field => [
    field, sumWhole(routine.tasks.map(difficulty => getTaskReward(difficulty)[field]), field),
  ])) as unknown as RewardVector);
}

export function xpToNextLevel(level: number): number {
  whole(level, 'level', 1);
  if (level >= BALANCE_POLICY_V01.hero.maximumLevel) throw new RangeError('Level 100 has no next transition');
  return BALANCE_POLICY_V01.hero.firstTransitionXp + BALANCE_POLICY_V01.hero.incrementPerLevel * (level - 1);
}

export function totalXpToLevel(level: number): number {
  whole(level, 'level', 1);
  if (level > BALANCE_POLICY_V01.hero.maximumLevel) throw new RangeError('Maximum proposed level is 100');
  return (level - 1) * BALANCE_POLICY_V01.hero.firstTransitionXp +
    BALANCE_POLICY_V01.hero.incrementPerLevel * (level - 1) * (level - 2) / 2;
}

export function projectHeroLevel(totalXp: number) {
  whole(totalXp, 'totalXp');
  let level = 1;
  while (level < BALANCE_POLICY_V01.hero.maximumLevel && totalXp >= totalXpToLevel(level + 1)) level += 1;
  const atCap = level === BALANCE_POLICY_V01.hero.maximumLevel;
  return Object.freeze({
    ...MODEL_STATUS_V01,
    level,
    totalXp,
    xpIntoLevel: atCap ? 0 : totalXp - totalXpToLevel(level),
    xpToNextLevel: atCap ? null : xpToNextLevel(level),
    xpBeyondLevelCap: atCap ? totalXp - totalXpToLevel(level) : 0,
  });
}

export type RewardAllocationV01 = Readonly<{
  allocationId: string;
  playerId: string;
  reward: RewardVector;
}>;

/** Validate explicit integer shares. Never multiply a joint budget by roster size. */
export function validateRewardAllocations(budget: RewardVector, allocations: readonly RewardAllocationV01[]) {
  if (allocations.length === 0) throw new RangeError('At least one explicit allocation is required');
  const ids = new Set<string>();
  for (const allocation of allocations) {
    nonempty(allocation.allocationId, 'allocationId');
    nonempty(allocation.playerId, 'playerId');
    if (ids.has(allocation.allocationId)) throw new RangeError('Duplicate allocationId');
    ids.add(allocation.allocationId);
  }
  for (const field of rewardFields) {
    whole(budget[field], `budget.${field}`);
    const allocated = sumWhole(allocations.map(allocation => allocation.reward[field]), field);
    if (allocated !== budget[field]) throw new RangeError(`Allocations must equal the fixed ${field} budget`);
  }
  return true as const;
}

export type GoalRosterMemberV01 = Readonly<{ playerId: string; dailyContributionNorm: number }>;
export type FamilyGoalPlanV01 = Readonly<{
  version: 'v0.1'; status: 'proposed'; simulationOnly: true;
  goalId: string;
  roster: readonly GoalRosterMemberV01[];
  plannedActiveDays: number;
  targetContribution: number;
}>;

/** Freeze roster and achievable norms BEFORE work. Days are a plan, never an expiry. */
export function planFamilyGoal(
  roster: readonly GoalRosterMemberV01[],
  options: Readonly<{ goalId?: string; plannedActiveDays?: number }> = {},
): FamilyGoalPlanV01 {
  if (roster.length === 0) throw new RangeError('A goal needs at least one participating player');
  const plannedActiveDays = whole(
    options.plannedActiveDays ?? BALANCE_POLICY_V01.family.defaultPlannedActiveDays,
    'plannedActiveDays', 1,
  );
  const ids = new Set<string>();
  const frozenRoster = Object.freeze(roster.map(member => {
    const playerId = nonempty(member.playerId, 'playerId');
    if (ids.has(playerId)) throw new RangeError('Duplicate goal participant');
    ids.add(playerId);
    return Object.freeze({ playerId, dailyContributionNorm: whole(member.dailyContributionNorm, 'norm', 1) });
  }));
  const dailyNorm = sumWhole(frozenRoster.map(member => member.dailyContributionNorm), 'dailyNorm');
  return Object.freeze({
    ...MODEL_STATUS_V01,
    goalId: nonempty(options.goalId ?? 'v3.goal.preview', 'goalId'),
    roster: frozenRoster,
    plannedActiveDays,
    targetContribution: whole(dailyNorm * plannedActiveDays, 'targetContribution', 1),
  });
}

export type GoalContributionV01 = Readonly<{ goalId: string | null; amount: number }>;

/** Inputs must be accepted, business-unique contributions. This is NOT a deduplication guard. */
export function projectGoalProgress(goal: FamilyGoalPlanV01, contributions: readonly GoalContributionV01[]) {
  whole(goal.targetContribution, 'targetContribution', 1);
  for (const contribution of contributions) whole(contribution.amount, 'contribution.amount');
  const earnedContribution = sumWhole(
    contributions.filter(contribution => contribution.goalId === goal.goalId).map(contribution => contribution.amount),
    'earnedContribution',
  );
  return Object.freeze({
    ...MODEL_STATUS_V01,
    goalId: goal.goalId,
    targetContribution: goal.targetContribution,
    earnedContribution,
    progressContribution: Math.min(earnedContribution, goal.targetContribution),
    overflowContribution: Math.max(0, earnedContribution - goal.targetContribution),
    remainingContribution: Math.max(0, goal.targetContribution - earnedContribution),
    reached: earnedContribution >= goal.targetContribution,
    milestoneCount: earnedContribution >= goal.targetContribution ? 1 as const : 0 as const,
    // A display projection has no action that starts another goal or transfers its overflow.
  });
}

/** One selected known egg/pet receives its own XP; stages and progress never decay. */
export function projectPetProgress(totalPetXp: number) {
  whole(totalPetXp, 'totalPetXp');
  const hatch = BALANCE_POLICY_V01.pet.hatchXp;
  const grown = hatch + BALANCE_POLICY_V01.pet.firstGrowthAdditionalXp;
  const stage = totalPetXp < hatch ? 'egg' : totalPetXp < grown ? 'pet' : 'grown_pet';
  return Object.freeze({
    ...MODEL_STATUS_V01,
    totalPetXp,
    stage,
    xpIntoStage: stage === 'egg' ? totalPetXp : stage === 'pet' ? totalPetXp - hatch : 0,
    stageTargetXp: stage === 'egg' ? hatch : stage === 'pet' ? grown - hatch : null,
    xpBeyondFirstGrowth: Math.max(0, totalPetXp - grown),
    hatchUnlocked: totalPetXp >= hatch,
    firstGrowthUnlocked: totalPetXp >= grown,
  });
}
