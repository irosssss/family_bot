import { describe, expect, it } from 'vitest';
import {
  BALANCE_POLICY_V01, ROUTINES_V01, getTaskReward, planFamilyGoal, projectGoalProgress,
  projectHeroLevel, projectPetProgress, routineReward, totalXpToLevel,
  validateRewardAllocations, xpToNextLevel,
} from '../../src/v3/model/balance.ts';
import { catalogV01, getCatalogItem, starterChoicesV01 } from '../../src/v3/model/catalog.ts';
import {
  buildSimulationV01, familySimulation, heroPacing, isActiveDay, petPacing,
  reviewAndGoalFixtures, shoppingSimulation, simulateAcceptedEffects,
  type AcceptanceFixtureV01,
} from '../../scripts/v3/simulate-balance.ts';

const acceptedChildPart: AcceptanceFixtureV01 = {
  familyId: 'f', occurrenceId: 'o', allocationId: 'a', requestId: 'request-1',
  beneficiaryPlayerId: 'child', performedOnDay: 1, acceptedOnDay: 4, status: 'accepted',
  rewardRulesVersion: 'v3.balance.v0.1', rewardSnapshot: { ...getTaskReward('normal'), petXp: 0 },
  goalId: 'goal.old', petTargetId: null,
};

describe('proposed v3 v0.1 balance and offline scenario seams', () => {
  it('uses one read-only curve with exact transition boundaries and the intended baseline calendar', () => {
    expect(totalXpToLevel(1)).toBe(0);
    expect(totalXpToLevel(100)).toBe(15642);
    for (let level = 1; level < 100; level += 1) {
      expect(totalXpToLevel(level + 1) - totalXpToLevel(level)).toBe(xpToNextLevel(level));
      expect(projectHeroLevel(totalXpToLevel(level + 1) - 1).level).toBe(level);
      expect(projectHeroLevel(totalXpToLevel(level + 1)).level).toBe(level + 1);
    }
    expect(projectHeroLevel(15652)).toMatchObject({ level: 100, xpToNextLevel: null, xpBeyondLevelCap: 10 });
    expect(heroPacing('baseline', 20)).toMatchObject({ activeDaysToLevel100: 241, calendarDayOfLevel100: 337 });
    expect(heroPacing('baseline', 28).calendarDayOfLevel100).toBe(241);
    expect(Object.isFrozen(BALANCE_POLICY_V01.taskRewards.normal)).toBe(true);
    expect(ROUTINES_V01.every(routine => Object.isFrozen(routine.tasks))).toBe(true);
  });

  it('keeps all shared parts inside a pre-agreed integer budget without a roster multiplier', () => {
    const easy = getTaskReward('easy');
    const parts = Array.from({ length: 4 }, (_, index) => ({ allocationId: `a-${index}`, playerId: `p-${index}`, reward: easy }));
    const fourPartBudget = { heroXp: 20, gold: 12, familyContribution: 4, petXp: 4 };
    expect(validateRewardAllocations(fourPartBudget, parts)).toBe(true);
    expect(validateRewardAllocations(fourPartBudget, [...parts].reverse())).toBe(true);
    const eightParts = [...parts, ...parts.map(part => ({ ...part, allocationId: `${part.allocationId}-new`, playerId: `${part.playerId}-new` }))];
    expect(() => validateRewardAllocations(fourPartBudget, eightParts)).toThrow('fixed');
    expect(validateRewardAllocations({ heroXp: 40, gold: 24, familyContribution: 8, petXp: 8 }, eightParts)).toBe(true);
    expect(() => validateRewardAllocations(fourPartBudget, [parts[0], parts[0]])).toThrow('Duplicate');
    expect(() => validateRewardAllocations({ ...fourPartBudget, gold: 12.5 }, parts)).toThrow();
  });

  it('pays only the accepted beneficiary once in the fixture despite rework and a new request ID', () => {
    const events = [
      { ...acceptedChildPart, status: 'submitted' as const, acceptedOnDay: 1 },
      { ...acceptedChildPart, status: 'returned' as const, acceptedOnDay: 2 },
      { ...acceptedChildPart, status: 'submitted' as const, acceptedOnDay: 3, requestId: 'new-attempt' },
      acceptedChildPart,
      { ...acceptedChildPart, acceptedOnDay: 5, requestId: 'new-request-id' },
    ];
    expect(simulateAcceptedEffects(events, 3).totals.gold).toBe(0);
    const result = simulateAcceptedEffects(events);
    expect(result.totals).toEqual({ heroXp: 15, gold: 8, familyContribution: 3, petXp: 0 });
    expect(result.byPlayer.map(player => player.playerId)).toEqual(['child']);
    expect(result.ignoredReplays).toBe(1);
    expect(new Set(result.effects.map(effect => effect.effectKey)).size).toBe(4);
    expect(result.dbGuarantee).toBe(false);
  });

  it('rejects a changed snapshot for the same accepted work and keeps independent shares separate', () => {
    const changed = { ...acceptedChildPart, rewardSnapshot: { ...acceptedChildPart.rewardSnapshot, gold: 100 } };
    expect(() => simulateAcceptedEffects([acceptedChildPart, changed])).toThrow('Conflicting');
    const secondShare = { ...acceptedChildPart, allocationId: 'b', beneficiaryPlayerId: 'second-child' };
    expect(simulateAcceptedEffects([acceptedChildPart, secondShare]).totals.gold).toBe(16);
    expect(() => simulateAcceptedEffects([{ ...acceptedChildPart, rewardSnapshot: getTaskReward('normal') }])).toThrow('none');
  });

  it('isolates wallets for two families sharing textual player and work identifiers', () => {
    const otherFamily = {
      ...acceptedChildPart, familyId: 'other-family', rewardSnapshot: { ...getTaskReward('hard'), petXp: 0 },
    };
    const result = simulateAcceptedEffects([
      acceptedChildPart, otherFamily, { ...otherFamily, requestId: 'retry-other-family' },
    ]);
    expect(result.byPlayer).toEqual([
      { familyId: 'f', playerId: 'child', heroXp: 15, gold: 8, familyContribution: 3, petXp: 0 },
      { familyId: 'other-family', playerId: 'child', heroXp: 30, gold: 15, familyContribution: 6, petXp: 0 },
    ]);
    expect(result.totals).toEqual({ heroXp: 45, gold: 23, familyContribution: 9, petXp: 0 });
    expect(result.uniqueAcceptedAllocations).toBe(2);
    expect(result.ignoredReplays).toBe(1);
    expect(new Set(result.effects.map(effect => effect.effectKey)).size).toBe(8);
  });

  it('normalizes the goal against a frozen roster and preserves other players income during absence', () => {
    for (const heroes of [1, 2, 4, 6, 8]) {
      const regular = familySimulation(heroes, 20);
      const absence = familySimulation(heroes, 20, { absentLastHeroDays: 7 });
      expect(regular.goal.targetContribution).toBe(130 * heroes);
      expect(regular.goal.milestoneDay).toBe(12);
      expect(absence.goal.targetContribution).toBe(regular.goal.targetContribution);
      expect(regular.eventualAfterAllReviews.gold - absence.eventualAfterAllReviews.gold).toBe(170);
      expect(absence.goal.milestoneDay).toBeGreaterThanOrEqual(regular.goal.milestoneDay!);
      if (heroes > 1) expect(absence.personalWalletsAfterAllReviews[0].gold).toBe(680);
    }
    const roster = [{ playerId: 'a', dailyContributionNorm: 4 }, { playerId: 'b', dailyContributionNorm: 20 }];
    const goal = planFamilyGoal(roster);
    roster[0].dailyContributionNorm = 100;
    expect(goal.targetContribution).toBe(240);
    expect(goal.roster[0].dailyContributionNorm).toBe(4);
  });

  it('delayed child review postpones receipt while preserving original promised totals and goal', () => {
    const immediate = familySimulation(4, 28);
    const delayed = familySimulation(4, 28, { childReviewDelayDays: 3 });
    expect(delayed.eventualAfterAllReviews).toEqual(immediate.eventualAfterAllReviews);
    expect(delayed.pendingGoldAtDay28).toBe(204);
    expect(delayed.recognizedByDay28.gold + delayed.pendingGoldAtDay28).toBe(3808);
    const fixtures = reviewAndGoalFixtures();
    expect(fixtures.frozenPerformedOnDay).toBe(2);
    expect(fixtures.acceptedOnDay).toBe(5);
    expect(fixtures.originalGoal).toMatchObject({ earnedContribution: 6, overflowContribution: 3, milestoneCount: 1 });
    expect(fixtures.nextGoal.earnedContribution).toBe(0);
    expect(fixtures.noGoalHistory).toBe(6);
    const next = planFamilyGoal([{ playerId: 'child', dailyContributionNorm: 3 }], { goalId: 'goal.next' });
    expect(projectGoalProgress(next, [{ goalId: null, amount: 30 }]).earnedContribution).toBe(0);
  });

  it('keeps free starter choices separate from a priced known species and roles from personal ownership', () => {
    expect(starterChoicesV01).toHaveLength(2);
    expect(starterChoicesV01.every(item => item.priceGold === 0 && item.acquisition === 'starter_choice')).toBe(true);
    expect(getCatalogItem('v3.egg.fox')).toMatchObject({ priceGold: 180, knownPetId: 'v3.pet.fox', repeatable: false });
    expect(getCatalogItem('v3.home.reading-lamp')).toMatchObject({ ownership: 'family', eligibility: 'adults' });
    expect(getCatalogItem('v3.real-reward.choose-activity')).toMatchObject({ eligibility: 'children', acquisition: 'configured_real_reward' });
    expect(catalogV01.every(item => item.status === 'proposed' && item.simulationOnly && Object.isFrozen(item))).toBe(true);
  });

  it('does not retroactively send XP from already opened work to a newly chosen egg', () => {
    const sequential = petPacing('sequential', 20);
    const morning = petPacing('morning_batch', 20);
    expect(sequential).toMatchObject({ hatchDay: 8, firstGrowthDay: 18, forfeitedPotentialPetXpFromNone: 1 });
    expect(morning).toMatchObject({ hatchDay: 9, firstGrowthDay: 19, forfeitedPotentialPetXpFromNone: 9 });
    expect(petPacing('morning_batch', 20, 3)).toMatchObject({ starterChoiceDay: 4, hatchDay: 14, firstGrowthDay: 26 });
    expect(projectPetProgress(49).stage).toBe('egg');
    expect(projectPetProgress(50).stage).toBe('pet');
    expect(projectPetProgress(122).stage).toBe('grown_pet');
    expect(projectPetProgress(126).xpBeyondFirstGrowth).toBe(4);
  });

  it('ends pet totals on the first growth day even when delayed acceptance falls on a free day', () => {
    expect(isActiveDay(28, 20)).toBe(false);
    expect(petPacing('morning_batch', 20, 4)).toMatchObject({
      firstGrowthDay: 28, horizonDay: 28, totalsHorizon: 'end_of_first_growth_day',
      totalPetXp: 126, acceptedTasks: 72,
    });
    expect(petPacing('morning_batch', 20, 100)).toMatchObject({
      firstGrowthDay: null, horizonDay: 90, totalsHorizon: 'day_90',
      totalPetXp: 0, acceptedTasks: 0,
    });
  });

  it('shows the cost of purchase order and never creates a negative simulated balance', () => {
    const clothesFirst = shoppingSimulation('adult', 28, 20, ['v3.outfit.traveler', 'v3.item.adventure-kit', 'v3.egg.fox']);
    const foxFirst = shoppingSimulation('adult', 28, 20, ['v3.egg.fox', 'v3.outfit.traveler', 'v3.item.adventure-kit']);
    expect(clothesFirst.hypotheticalOrders[0].day).toBe(2);
    expect(clothesFirst.hypotheticalOrders.find(order => order.id === 'v3.egg.fox')!.day).toBe(12);
    expect(foxFirst.hypotheticalOrders[0].day).toBe(8);
    expect(foxFirst.totalSpent).toBe(clothesFirst.totalSpent);
    expect(clothesFirst.hypotheticalOrders.every(order => order.balanceAfter >= 0)).toBe(true);
    expect(() => shoppingSimulation('adult', 28, 20, ['v3.real-reward.choose-activity'])).toThrow('eligible');
    expect(() => shoppingSimulation('child', 28, 20, ['v3.home.reading-lamp'])).toThrow('eligible');
    expect(() => shoppingSimulation('adult', 28, 20, [], { optionalChildRewardEvery7Days: true })).toThrow('adult Gold sink');
  });

  it('reports catalogue saturation and reserve competition instead of claiming an infinite balanced economy', () => {
    const result = buildSimulationV01();
    expect(result.executesGameOperations).toBe(false);
    expect(result.families).toHaveLength(10);
    const day90 = result.longTermGold.find(row => row.calendarDays === 90 && row.activityDaysPer28 === 20)!;
    const day180 = result.longTermGold.find(row => row.calendarDays === 180 && row.activityDaysPer28 === 20)!;
    expect(day90.adultChosenHomeBuyer).toMatchObject({ totalEarned: 2210, totalSpent: 580, remainingGold: 1630 });
    expect(day180.adultChosenHomeBuyer).toMatchObject({ totalEarned: 4420, totalSpent: 580, remainingGold: 3840 });
    expect(day180.childWithOptionalWeeklyRealReward.remainingGold).toBeGreaterThan(day90.childWithOptionalWeeklyRealReward.remainingGold);
    expect(result.competition.totalWanted).toBeGreaterThan(result.competition.balanceGold);
    expect(result.competition.ifReservationFirst.itemAffordable).toBe(false);
    expect(result.competition.ifPurchaseFirst.rewardReservable).toBe(false);
  });

  it('keeps source hypotheses out of production guards and rejects invalid numeric projections', () => {
    expect(() => projectHeroLevel(-1)).toThrow();
    expect(() => projectPetProgress(1.5)).toThrow();
    expect(() => totalXpToLevel(101)).toThrow();
    expect(() => planFamilyGoal([])).toThrow();
    expect(() => planFamilyGoal([{ playerId: 'a', dailyContributionNorm: 0 }])).toThrow();
    expect(() => planFamilyGoal([{ playerId: 'a', dailyContributionNorm: Number.MAX_SAFE_INTEGER }])).toThrow();
    expect(() => isActiveDay(0, 20)).toThrow();
    expect(routineReward('baseline')).toEqual({ heroXp: 65, gold: 34, familyContribution: 13, petXp: 9 });
  });
});
