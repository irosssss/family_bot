/** Offline fixtures only. No app server, database, API, browser storage or secret access. */
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  BALANCE_POLICY_V01, MODEL_STATUS_V01, ROUTINES_V01, getTaskReward, planFamilyGoal,
  projectGoalProgress, projectHeroLevel, projectPetProgress, routineReward,
  totalXpToLevel, validateRewardAllocations,
  type DifficultyV01, type RewardVector, type RoutineIdV01,
} from '../../src/v3/model/balance.ts';
import { catalogV01, getCatalogItem } from '../../src/v3/model/catalog.ts';

export type ActivityDaysV01 = 20 | 28;
type SimRole = 'adult' | 'child';
const zeroReward = (): RewardVector => ({ heroXp: 0, gold: 0, familyContribution: 0, petXp: 0 });
const fields = ['heroXp', 'gold', 'familyContribution', 'petXp'] as const;
const round = (value: number) => Math.round(value * 1000) / 1000;

function whole(value: number, minimum = 0) {
  if (!Number.isSafeInteger(value) || value < minimum) throw new RangeError('Invalid simulation integer');
  return value;
}

export function isActiveDay(day: number, activityDays: ActivityDaysV01) {
  whole(day, 1);
  if (activityDays !== 20 && activityDays !== 28) throw new RangeError('Use 20 or 28 active days');
  // Day 1 is a Monday. The 20/28 pattern is 5 active + 2 free days, repeated.
  return activityDays === 28 || (day - 1) % 7 < 5;
}

function routineTasks(id: RoutineIdV01): readonly DifficultyV01[] {
  const routine = ROUTINES_V01.find(candidate => candidate.id === id);
  if (!routine) throw new RangeError('Unknown simulation routine');
  return routine.tasks;
}

function plus(left: RewardVector, right: RewardVector): RewardVector {
  return Object.fromEntries(fields.map(field => [field, whole(left[field] + right[field])])) as unknown as RewardVector;
}

export type AcceptanceFixtureV01 = Readonly<{
  familyId: string;
  occurrenceId: string;
  allocationId: string;
  requestId: string;
  beneficiaryPlayerId: string;
  performedOnDay: number;
  acceptedOnDay: number;
  status: 'submitted' | 'returned' | 'accepted';
  // These four fields are copied BEFORE work; acceptance never reads the latest policy or goal.
  rewardRulesVersion: string;
  rewardSnapshot: RewardVector;
  goalId: string | null;
  petTargetId: string | null;
}>;

/**
 * In-memory illustration of business-unique accepted effects, NOT an auth/DB guarantee.
 * Submitted/returned rows do not pay. New request IDs do not create new work.
 */
export function simulateAcceptedEffects(events: readonly AcceptanceFixtureV01[], asOfDay = Number.MAX_SAFE_INTEGER) {
  whole(asOfDay);
  const accepted = events.filter(event => event.status === 'accepted' && event.acceptedOnDay <= asOfDay)
    .sort((left, right) => left.acceptedOnDay - right.acceptedOnDay);
  const seen = new Map<string, string>();
  const effects: Array<Readonly<{ effectKey: string; playerId: string; kind: keyof RewardVector; amount: number }>> = [];
  const byPlayer = new Map<string, { familyId: string; playerId: string; reward: RewardVector }>();
  const goalContributions: Array<Readonly<{ goalId: string | null; amount: number; acceptedOnDay: number; performedOnDay: number }>> = [];
  let ignoredReplays = 0;
  for (const event of accepted) {
    whole(event.performedOnDay, 1);
    whole(event.acceptedOnDay, event.performedOnDay);
    if (event.petTargetId === null && event.rewardSnapshot.petXp !== 0) {
      throw new Error('A frozen none pet target cannot receive or bank Pet XP');
    }
    validateRewardAllocations(event.rewardSnapshot, [{
      allocationId: event.allocationId, playerId: event.beneficiaryPlayerId, reward: event.rewardSnapshot,
    }]);
    const source = JSON.stringify([event.familyId, event.occurrenceId, event.allocationId]);
    const snapshot = JSON.stringify([
      event.beneficiaryPlayerId, event.performedOnDay, event.rewardRulesVersion,
      fields.map(field => event.rewardSnapshot[field]), event.goalId, event.petTargetId,
    ]);
    if (seen.has(source)) {
      if (seen.get(source) !== snapshot) throw new Error('Conflicting frozen snapshots for the same work');
      ignoredReplays += 1;
      continue;
    }
    seen.set(source, snapshot);
    const walletKey = JSON.stringify([event.familyId, event.beneficiaryPlayerId]);
    byPlayer.set(walletKey, {
      familyId: event.familyId, playerId: event.beneficiaryPlayerId,
      reward: plus(byPlayer.get(walletKey)?.reward ?? zeroReward(), event.rewardSnapshot),
    });
    for (const kind of fields) effects.push({
      effectKey: JSON.stringify([event.familyId, event.occurrenceId, event.allocationId, kind]),
      playerId: event.beneficiaryPlayerId, kind, amount: event.rewardSnapshot[kind],
    });
    goalContributions.push({
      goalId: event.goalId, amount: event.rewardSnapshot.familyContribution,
      acceptedOnDay: event.acceptedOnDay, performedOnDay: event.performedOnDay,
    });
  }
  return {
    ...MODEL_STATUS_V01,
    dbGuarantee: false,
    ignoredReplays,
    uniqueAcceptedAllocations: seen.size,
    totals: [...byPlayer.values()].reduce((total, wallet) => plus(total, wallet.reward), zeroReward()),
    byPlayer: [...byPlayer.values()].map(({ familyId, playerId, reward }) => ({ familyId, playerId, ...reward })),
    effects,
    goalContributions,
    historyWithoutGoal: goalContributions.filter(row => row.goalId === null).reduce((sum, row) => sum + row.amount, 0),
  };
}

export function familySimulation(
  heroes: number,
  activityDays: ActivityDaysV01,
  options: Readonly<{ absentLastHeroDays?: number; childReviewDelayDays?: number }> = {},
) {
  whole(heroes, 1);
  const absentDays = whole(options.absentLastHeroDays ?? 0);
  const reviewDelay = whole(options.childReviewDelayDays ?? 0);
  const daily = routineReward('baseline');
  const adults = heroes >= 4 ? 2 : 1;
  const roster = Array.from({ length: heroes }, (_, index) => ({
    playerId: `player-${index + 1}`, dailyContributionNorm: daily.familyContribution,
  }));
  const goal = planFamilyGoal(roster, { goalId: 'goal.original' });
  const events: AcceptanceFixtureV01[] = [];
  let heroActiveDays = 0;
  for (let day = 1; day <= 28; day += 1) {
    if (!isActiveDay(day, activityDays)) continue;
    for (let player = 0; player < heroes; player += 1) {
      if (player === heroes - 1 && day <= absentDays) continue;
      heroActiveDays += 1;
      for (const [task, difficulty] of routineTasks('baseline').entries()) {
        const occurrenceId = `day-${day}-player-${player + 1}-task-${task + 1}`;
        events.push({
          familyId: 'family.fixture', occurrenceId, allocationId: 'part-1', requestId: `${occurrenceId}-accepted`,
          beneficiaryPlayerId: roster[player].playerId, performedOnDay: day,
          acceptedOnDay: day + (player < adults ? 0 : reviewDelay), status: 'accepted',
          rewardRulesVersion: BALANCE_POLICY_V01.id,
          // Pet routing is studied separately, rather than silently selecting a pet for every hero.
          rewardSnapshot: Object.freeze({ ...getTaskReward(difficulty), petXp: 0 }),
          goalId: goal.goalId, petTargetId: null,
        });
      }
    }
  }
  const atEnd = simulateAcceptedEffects(events, 28);
  const eventual = simulateAcceptedEffects(events);
  let accumulated = 0;
  let milestoneDay: number | null = null;
  for (const contribution of eventual.goalContributions) {
    accumulated += contribution.amount;
    if (milestoneDay === null && accumulated >= goal.targetContribution) milestoneDay = contribution.acceptedOnDay;
  }
  return {
    ...MODEL_STATUS_V01,
    heroes, adults, children: heroes - adults, activityDaysPer28: activityDays, windowDays: 28,
    absentLastHeroCalendarDays: absentDays, childReviewDelayDays: reviewDelay, heroActiveDays,
    goal: { ...goal, milestoneDay, ...projectGoalProgress(goal, eventual.goalContributions) },
    recognizedByDay28: atEnd.totals,
    eventualAfterAllReviews: eventual.totals,
    pendingGoldAtDay28: eventual.totals.gold - atEnd.totals.gold,
    pendingHeroXpAtDay28: eventual.totals.heroXp - atEnd.totals.heroXp,
    personalWalletsAfterAllReviews: eventual.byPlayer,
    note: 'One prebound goal is retained in this fixture; overflow stays with it. No next-goal auto-allocation.',
  };
}

export function heroPacing(routineId: RoutineIdV01, activityDays: ActivityDaysV01) {
  const daily = routineReward(routineId);
  const totalRequired = totalXpToLevel(100);
  let xp = 0;
  let activeDays = 0;
  for (let calendarDay = 1; calendarDay <= 3000; calendarDay += 1) {
    if (!isActiveDay(calendarDay, activityDays)) continue;
    activeDays += 1;
    xp += daily.heroXp;
    if (xp >= totalRequired) return {
      routineId, activityDaysPer28: activityDays, totalRequiredXp: totalRequired,
      activeDaysToLevel100: activeDays, calendarDayOfLevel100: calendarDay,
      monthsUsing30CalendarDays: round(calendarDay / 30),
      goldEarnedWithoutSpending: activeDays * daily.gold,
    };
  }
  throw new Error('Simulation horizon was insufficient');
}

export function petPacing(
  materialization: 'sequential' | 'morning_batch',
  activityDays: ActivityDaysV01,
  reviewDelayDays = 0,
) {
  whole(reviewDelayDays);
  const queue: Array<{ acceptedOnDay: number; petXp: number }> = [];
  let hasChosenStarter = false;
  let starterChoiceDay: number | null = null;
  let hatchDay: number | null = null;
  let growthDay: number | null = null;
  let totalPetXp = 0;
  let forfeitedPotentialPetXpFromNone = 0;
  let acceptedTasks = 0;
  let horizonDay = 0;
  const accept = (event: { petXp: number }, day: number) => {
    acceptedTasks += 1;
    totalPetXp += event.petXp;
    if (!hasChosenStarter) {
      // Explicit simulated choice at the first available opportunity, NOT an automatic game grant.
      hasChosenStarter = true;
      starterChoiceDay = day;
    }
    const progress = projectPetProgress(totalPetXp);
    if (hatchDay === null && progress.hatchUnlocked) hatchDay = day;
    if (growthDay === null && progress.firstGrowthUnlocked) growthDay = day;
  };
  for (let day = 1; day <= 90; day += 1) {
    horizonDay = day;
    for (const event of queue.filter(candidate => candidate.acceptedOnDay === day)) accept(event, day);
    // Review can unlock growth on a free day. Stop before skipping to later work days.
    if (growthDay !== null) break;
    if (!isActiveDay(day, activityDays)) continue;
    const batchHasPetTarget = hasChosenStarter;
    for (const difficulty of routineTasks('baseline')) {
      const hadTargetBeforeWork = materialization === 'morning_batch' ? batchHasPetTarget : hasChosenStarter;
      const potential = getTaskReward(difficulty).petXp;
      const petXp = hadTargetBeforeWork ? potential : 0;
      if (!hadTargetBeforeWork) forfeitedPotentialPetXpFromNone += potential;
      if (reviewDelayDays === 0) accept({ petXp }, day);
      else queue.push({ acceptedOnDay: day + reviewDelayDays, petXp });
    }
    if (growthDay !== null) break;
  }
  return {
    ...MODEL_STATUS_V01,
    materialization, activityDaysPer28: activityDays, reviewDelayDays,
    starterChoiceDay, hatchDay, firstGrowthDay: growthDay,
    horizonDay, totalsHorizon: growthDay === null ? 'day_90' as const : 'end_of_first_growth_day' as const,
    totalPetXp, acceptedTasks, forfeitedPotentialPetXpFromNone,
    note: 'Chosen egg/pet or none is frozen before each work; none XP is never banked or restored.',
  };
}

const PERSONAL_ONE_OFF_IDS = ['v3.outfit.traveler', 'v3.item.adventure-kit', 'v3.egg.fox'] as const;
const LAMP_ID = 'v3.home.reading-lamp';
const REAL_REWARD_ID = 'v3.real-reward.choose-activity';

export function shoppingSimulation(
  role: SimRole,
  calendarDays: number,
  activityDays: ActivityDaysV01,
  orderIds: readonly string[],
  options: Readonly<{ optionalChildRewardEvery7Days?: boolean }> = {},
) {
  whole(calendarDays, 1);
  const order = orderIds.map(id => {
    const item = getCatalogItem(id);
    if (!item || item.acquisition === 'starter_choice') throw new Error('Shopping needs a proposed Gold offer');
    if ((item.eligibility === 'adults' && role !== 'adult') || (item.eligibility === 'children' && role !== 'child')) {
      throw new Error('This role is not eligible for the offer');
    }
    return item;
  });
  if (new Set(orderIds).size !== orderIds.length) throw new Error('This fixture cannot repeat its one-off priority queue');
  if (role !== 'child' && options.optionalChildRewardEvery7Days) throw new Error('Real rewards are not an adult Gold sink');
  const daily = routineReward('baseline');
  const orders: Array<{ day: number; id: string; priceGold: number; balanceAfter: number }> = [];
  let totalEarned = 0;
  let gold = 0;
  let next = 0;
  let activeDays = 0;
  for (let day = 1; day <= calendarDays; day += 1) {
    if (isActiveDay(day, activityDays)) {
      activeDays += 1;
      totalEarned += daily.gold;
      gold += daily.gold;
    }
    while (next < order.length && gold >= order[next].priceGold) {
      const item = order[next];
      gold -= item.priceGold;
      orders.push({ day, id: item.id, priceGold: item.priceGold, balanceAfter: gold });
      next += 1;
    }
    const realReward = getCatalogItem(REAL_REWARD_ID)!;
    if (options.optionalChildRewardEvery7Days && next === order.length && day % 7 === 0 && gold >= realReward.priceGold) {
      gold -= realReward.priceGold;
      orders.push({ day, id: realReward.id, priceGold: realReward.priceGold, balanceAfter: gold });
    }
  }
  return {
    ...MODEL_STATUS_V01,
    role, calendarDays, activeDays, activityDaysPer28: activityDays,
    totalEarned, totalSpent: totalEarned - gold, remainingGold: gold,
    priorityOrder: orderIds, unacquiredPriorityItems: order.slice(next).map(item => item.id),
    hypotheticalOrders: orders,
    realRewardOrders: orders.filter(order => order.id === REAL_REWARD_ID).length,
    note: options.optionalChildRewardEvery7Days
      ? 'Optional expense sensitivity only: adult enables weekly stock and immediately fulfils each child order. No reserve backlog; not a default promise.'
      : 'Finite one-off catalogue; no replenishment, random drops, fees, depreciation or manufactured sinks.',
  };
}

export function reviewAndGoalFixtures() {
  const original: AcceptanceFixtureV01 = {
    familyId: 'family.fixture', occurrenceId: 'work.original', allocationId: 'part.child', requestId: 'request.first',
    beneficiaryPlayerId: 'child', performedOnDay: 2, acceptedOnDay: 5, status: 'accepted',
    rewardRulesVersion: 'v3.balance.v0.1', rewardSnapshot: { ...getTaskReward('hard'), petXp: 0 },
    goalId: 'goal.original', petTargetId: null,
  };
  const events: AcceptanceFixtureV01[] = [
    { ...original, status: 'submitted', acceptedOnDay: 2 },
    { ...original, status: 'returned', acceptedOnDay: 3 },
    { ...original, status: 'submitted', acceptedOnDay: 4, requestId: 'request.resubmit' },
    original,
    { ...original, acceptedOnDay: 6, requestId: 'request.new-id-retry' },
  ];
  const noGoal: AcceptanceFixtureV01 = { ...original, occurrenceId: 'work.no-goal', goalId: null };
  const oldGoal = planFamilyGoal([{ playerId: 'child', dailyContributionNorm: 3 }], { goalId: 'goal.original', plannedActiveDays: 1 });
  const nextGoal = planFamilyGoal([{ playerId: 'child', dailyContributionNorm: 3 }], { goalId: 'goal.next', plannedActiveDays: 1 });
  const settled = simulateAcceptedEffects(events);
  return {
    ...MODEL_STATUS_V01,
    beforeAcceptance: simulateAcceptedEffects(events, 4).totals,
    afterAcceptanceAndReplay: settled.totals,
    ignoredReplays: settled.ignoredReplays,
    uniqueEffects: settled.effects.length,
    originalGoal: projectGoalProgress(oldGoal, settled.goalContributions),
    nextGoal: projectGoalProgress(nextGoal, settled.goalContributions),
    noGoalHistory: simulateAcceptedEffects([noGoal]).historyWithoutGoal,
    frozenPerformedOnDay: original.performedOnDay,
    acceptedOnDay: original.acceptedOnDay,
    dbGuarantee: false,
  };
}

export function buildSimulationV01() {
  const daily = routineReward('baseline');
  const item = getCatalogItem('v3.item.adventure-kit')!;
  const reward = getCatalogItem(REAL_REWARD_ID)!;
  const competingBalance = daily.gold * 5;
  return {
    ...MODEL_STATUS_V01,
    executesGameOperations: false,
    sources: ['src/v3/model/balance.ts', 'src/v3/model/catalog.ts'],
    assumptions: [
      'Day 1 is Monday. 20/28 means repeating five active then two free days; 28/28 is daily activity.',
      'Prices, norms, level curve and pet thresholds are proposals, not approved user targets or measured behaviour.',
      'Adults self-report; child results need adult acceptance; no reward belongs to the reviewer.',
      'All income comes from accepted frozen work. No streak, level-up, chest, login or paid bonuses.',
      'Goal binding and participation norms are frozen before work, never from online presence.',
      'No family wallet, currency expiration, debt, decay, automatic pet feeding or infinite spending sink.',
      'Starters are free known choices. Gold-priced fox is optional; lamp is paid once by a chosen adult for the family.',
      'Numbers are analytical fixtures; there are no auth, concurrency, persistence or database guarantees.',
    ],
    balancePolicy: BALANCE_POLICY_V01,
    catalogue: catalogV01,
    routines: ROUTINES_V01.map(routine => ({
      ...routine, perActiveDay: routineReward(routine.id),
      calendarPacing: ([20, 28] as const).map(days => heroPacing(routine.id, days)),
    })),
    families: [1, 2, 4, 6, 8].flatMap(heroes => ([20, 28] as const).map(days => familySimulation(heroes, days))),
    oneAbsentFirstWeek: [1, 2, 4, 6, 8].map(heroes => familySimulation(heroes, 20, { absentLastHeroDays: 7 })),
    childReviewDelayedThreeDays: [2, 4, 8].map(heroes => familySimulation(heroes, 28, { childReviewDelayDays: 3 })),
    reviewsAndGoalBinding: reviewAndGoalFixtures(),
    petPacing: (['sequential', 'morning_batch'] as const).flatMap(mode => ([20, 28] as const).map(days => petPacing(mode, days))),
    petPacingWithChildReviewDelay: (['sequential', 'morning_batch'] as const).map(mode => petPacing(mode, 20, 3)),
    firstGoldPurchasesWithoutOtherSpending: catalogV01.filter(offer => offer.acquisition !== 'starter_choice').map(offer => ({
      id: offer.id, gold: offer.priceGold, activeDays: Math.ceil(offer.priceGold / daily.gold), eligibility: offer.eligibility,
    })),
    sequentialSpending: {
      adultClothesFirst: shoppingSimulation('adult', 28, 20, [...PERSONAL_ONE_OFF_IDS, LAMP_ID]),
      adultFoxFirst: shoppingSimulation('adult', 28, 20, ['v3.egg.fox', 'v3.outfit.traveler', 'v3.item.adventure-kit', LAMP_ID]),
      childRewardFirst: shoppingSimulation('child', 28, 20, [REAL_REWARD_ID, ...PERSONAL_ONE_OFF_IDS]),
    },
    competition: {
      balanceGold: competingBalance, optionalChildRewardReservation: reward.priceGold, itemPurchase: item.priceGold,
      totalWanted: reward.priceGold + item.priceGold,
      ifReservationFirst: { availableGold: competingBalance - reward.priceGold, itemAffordable: competingBalance - reward.priceGold >= item.priceGold },
      ifPurchaseFirst: { availableGold: competingBalance - item.priceGold, rewardReservable: competingBalance - item.priceGold >= reward.priceGold },
      note: 'Two illustrative serial outcomes, not a concurrency test. Future server must serialize/check available Gold including reserves.',
    },
    longTermGold: ([90, 180] as const).flatMap(days => ([20, 28] as const).map(activity => ({
      calendarDays: days, activityDaysPer28: activity,
      noSpending: shoppingSimulation('adult', days, activity, []),
      adultChosenHomeBuyer: shoppingSimulation('adult', days, activity, [...PERSONAL_ONE_OFF_IDS, LAMP_ID]),
      adultOtherFamilyMember: shoppingSimulation('adult', days, activity, PERSONAL_ONE_OFF_IDS),
      childWithoutOptionalRealRewards: shoppingSimulation('child', days, activity, PERSONAL_ONE_OFF_IDS),
      childWithOptionalWeeklyRealReward: shoppingSimulation('child', days, activity, PERSONAL_ONE_OFF_IDS, { optionalChildRewardEvery7Days: true }),
    }))),
    unresolved: [
      'Small permanent catalogue saturates. Earned Gold keeps growing; this model is not claimed to balance a multi-year economy.',
      'No target Gold sink ratio is invented. Optional child promises cannot solve adult accumulation.',
      'Age-specific chores, catalogue expansion, real reward availability and final desired pace need separate decisions.',
      'No boss, season, premium, player-versus-player or real-money mechanism is calibrated here.',
    ],
  };
}

const entry = process.argv[1];
if (entry && import.meta.url === pathToFileURL(resolve(entry)).href) {
  process.stdout.write(`${JSON.stringify(buildSimulationV01(), null, 2)}\n`);
}
