import { describe, expect, it } from 'vitest';
import {
  baselinePerHeroActiveDay,
  bossScenario,
  buildBalanceAudit,
  familyScenario,
  heroXPFromLevel1To100,
  heroXPToNextLevel,
  repeatedEasyTaskBeforeRounding,
  seasonProgress,
  softDailyGoldBudget,
} from '../../scripts/v3/audit-balance.ts';

describe('v3 source proposal audit, without a production economy', () => {
  it('makes the illustrative routine and audited formula disagreement explicit', () => {
    expect(baselinePerHeroActiveDay()).toEqual({
      heroXP: 65, gold: 34, damage: 37, adventureXP: 54, ultimateEnergy: 13, petXP: 8,
    });
    expect(heroXPToNextLevel(3)).toBe(170); // Source table says 175.
    expect(heroXPToNextLevel(10)).toBe(520); // Source table says 500.
    expect(heroXPFromLevel1To100()).toBe(381095);
    expect(6 * 60 * 450).toBeLessThan(heroXPFromLevel1To100());
  });

  it('uses the 30 listed milestones and does not award the last one early', () => {
    expect(seasonProgress(0).unlockedMilestones).toBe(0);
    expect(seasonProgress(7359).unlockedMilestones).toBe(29);
    expect(seasonProgress(7360).unlockedMilestones).toBe(30);
    expect(seasonProgress(7460).overflowAfterAllMilestones).toBe(100);
    expect(seasonProgress(7460).unlockedMilestones).toBe(30);
  });

  it('shows family-size sensitivity while preserving the same personal wallet rate', () => {
    const solo = familyScenario(1, 28);
    const pair = familyScenario(2, 28);
    const six = familyScenario(6, 28);
    expect(solo.personalGoldPerHero).toBe(952);
    expect(six.personalGoldPerHero).toBe(solo.personalGoldPerHero);
    expect(solo.seasonWithoutBonus.adventureXP).toBe(1512);
    expect(pair.seasonWithoutBonus.adventureXP).toBe(3024);
    expect(six.seasonWithoutBonus.adventureXP).toBe(9072);
    expect(pair.seasonWithComboAndFourMaximumBossRewards.adventureXP).toBe(5326.4);
    expect(pair.seasonWithComboAndFourMaximumBossRewards.unlockedMilestones).toBeLessThan(30);
    expect(familyScenario(7, 28).heroes).toBe(7); // Six is not a product limit.
  });

  it('counts skipped days as absent earnings, with no negative progress or catch-up minting', () => {
    const full = familyScenario(4, 28);
    const skipped = familyScenario(4, 20);
    expect(skipped.personalGoldPerHero).toBe(680);
    expect(skipped.seasonWithoutBonus.adventureXP).toBe(4320);
    expect(full.seasonWithoutBonus.adventureXP - skipped.seasonWithoutBonus.adventureXP).toBe(1728);
    const paused = familyScenario(4, 0);
    expect(paused.personalGoldPerHero).toBe(0);
    expect(paused.seasonWithoutBonus.adventureXP).toBe(0);
  });

  it('demonstrates that even the favorable ultimate estimate misses the 3–5 day boss claim', () => {
    expect(bossScenario(4).scaledNormalHP).toBe(4100);
    expect(bossScenario(4).normalDaysWithoutUltimate).toBe(27.703);
    expect(bossScenario(4).normalContinuousDaysWith5PercentUltimate).toBeGreaterThan(5);
    expect(bossScenario(6).halloweenContinuousDaysWith5PercentUltimate).toBeGreaterThan(28);
    expect(bossScenario(6).normalDaysWithoutUltimate).toBeLessThan(bossScenario(1).normalDaysWithoutUltimate);
  });

  it('exposes unlimited residual minting and leaves fractional reward policy unresolved', () => {
    expect(repeatedEasyTaskBeforeRounding(100).goldBeforeIntegerPolicy).toBe(49.5);
    expect(repeatedEasyTaskBeforeRounding(100).adventureXPIfUncapped).toBe(500);
    expect(softDailyGoldBudget(300)).toBe(156);
    expect(softDailyGoldBudget(3000)).toBe(696);
    expect(softDailyGoldBudget(3000)).toBeGreaterThan(120);
  });

  it('labels the output as hypothetical and reports missing Gold sinks instead of inventing prices', () => {
    const audit = buildBalanceAudit();
    expect(audit.hypothetical).toBe(true);
    expect(audit.productionReady).toBe(false);
    expect(audit.executesPurchasesOrRewards).toBe(false);
    expect(audit.monthlyGold.validatedGoldSpending).toBeNull();
    expect(audit.monthlyGold.baseline30ActiveDays).toBe(1020);
    expect(audit.inflationAndRounding.eventShop.oneOfEach).toBe(1750);
    expect(audit.season.scenarios).toHaveLength(8);
  });

  it('rejects nonsensical analytic inputs rather than returning misleading infinities', () => {
    expect(() => familyScenario(0, 28)).toThrow();
    expect(() => familyScenario(2, 29)).toThrow();
    expect(() => familyScenario(2, -1)).toThrow();
    expect(() => heroXPToNextLevel(100)).toThrow();
    expect(() => seasonProgress(-1)).toThrow();
    expect(() => seasonProgress(Number.POSITIVE_INFINITY)).toThrow();
    expect(() => bossScenario(0)).toThrow();
  });
});
