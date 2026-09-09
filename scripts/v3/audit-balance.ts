/**
 * Offline audit of proposals in GDD v1.0, NOT a production reward engine.
 * No application imports, persisted state, database, network, or environment secrets.
 * Run: node scripts/v3/audit-balance.ts
 * Importing this module only exposes pure calculations; it does not print or award anything.
 */
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const AUDIT_SOURCES = {
  gdd: {
    title: 'Family Life RPG — Game Design Document v1.0 (1).md',
    sha256: '3ba9ceb9e45f30bcf38613bc320d340f2b0f33ac690e7123df262ff889c46c24',
    sections: ['6–7', '9', '15–17', '21–24', '28–29', '35', '44–45', '61', '87–90', '93–94'],
  },
  economy: {
    title: 'Экономика, события и монетизация семейного RPG-приложения.md',
    sha256: '4bfb9549e68a536e006efff7aa002938d3644ebe330c4761ba174f91b061ad0c',
    sections: ['3–5', '7', '12–15', '29', '43'],
  },
} as const;

// Values transcribed from GDD §§9, 21, 28, 44. They are unapproved hypotheses.
export const HYPOTHETICAL_TASKS = {
  easy: { heroXP: 5, gold: 3, damage: 3, adventureXP: 5, ultimateEnergy: 1, petXP: 0 },
  normal: { heroXP: 15, gold: 8, damage: 8, adventureXP: 12, ultimateEnergy: 3, petXP: 2 },
  hard: { heroXP: 30, gold: 15, damage: 18, adventureXP: 25, ultimateEnergy: 6, petXP: 4 },
  epic: { heroXP: 60, gold: 30, damage: 40, adventureXP: 50, ultimateEnergy: 12, petXP: 8 },
} as const;

// An illustrative mix inside the stated 3–6 actions/day, not observed user behavior.
export const BASELINE_ROUTINE = ['easy', 'normal', 'normal', 'hard'] as const;

// The document lists 100..380, then 400: there is no 390 entry.
// Audit convention: 30 paid-by-XP milestones, starting with zero unlocked milestones.
export const SEASON_MILESTONE_COSTS = Object.freeze([
  ...Array.from({ length: 29 }, (_, index) => 100 + 10 * index),
  400,
]);
export const GDD_HALLOWEEN_BOSS_BASE_HP = [1200, 2500, 4000, 8000] as const;

const round = (value: number) => Math.round(value * 1000) / 1000;
const sum = (values: readonly number[]) => values.reduce((total, value) => total + value, 0);

function requireInteger(value: number, minimum: number, name: string) {
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw new RangeError(`${name} must be a safe integer >= ${minimum}`);
  }
}

export function baselinePerHeroActiveDay() {
  return BASELINE_ROUTINE.reduce((total, name) => {
    const task = HYPOTHETICAL_TASKS[name];
    return {
      heroXP: total.heroXP + task.heroXP,
      gold: total.gold + task.gold,
      damage: total.damage + task.damage,
      adventureXP: total.adventureXP + task.adventureXP,
      ultimateEnergy: total.ultimateEnergy + task.ultimateEnergy,
      petXP: total.petXP + task.petXP,
    };
  }, { heroXP: 0, gold: 0, damage: 0, adventureXP: 0, ultimateEnergy: 0, petXP: 0 });
}

export function heroXPToNextLevel(level: number) {
  requireInteger(level, 1, 'level');
  if (level > 99) throw new RangeError('This audit covers transitions from levels 1..99 only');
  return Math.round((100 + 25 * (level - 1) + 8 * (level - 1) ** 1.45) / 5) * 5;
}

export function heroXPFromLevel1To100() {
  return sum(Array.from({ length: 99 }, (_, index) => heroXPToNextLevel(index + 1)));
}

export function seasonProgress(adventureXP: number) {
  if (!Number.isFinite(adventureXP) || adventureXP < 0) {
    throw new RangeError('adventureXP must be finite and nonnegative');
  }
  let consumedXP = 0;
  let unlockedMilestones = 0;
  for (const cost of SEASON_MILESTONE_COSTS) {
    if (consumedXP + cost > adventureXP) break;
    consumedXP += cost;
    unlockedMilestones += 1;
  }
  const totalXP = sum(SEASON_MILESTONE_COSTS);
  return {
    adventureXP: round(adventureXP),
    totalRequiredXP: totalXP,
    earnedToRequiredPercent: round(adventureXP / totalXP * 100),
    unlockedMilestones,
    overflowAfterAllMilestones: round(Math.max(0, adventureXP - totalXP)),
  };
}

export function familyScenario(heroes: number, activeDays: number, windowDays = 28) {
  requireInteger(heroes, 1, 'heroes');
  requireInteger(activeDays, 0, 'activeDays');
  requireInteger(windowDays, 1, 'windowDays');
  if (activeDays > windowDays) throw new RangeError('activeDays exceeds windowDays');
  const daily = baselinePerHeroActiveDay();
  const adventureXP = daily.adventureXP * heroes * activeDays;
  return {
    heroes,
    windowDays,
    synchronizedActiveDays: activeDays,
    skippedDays: windowDays - activeDays,
    personalGoldPerHero: daily.gold * activeDays,
    personalHeroXPPerHero: daily.heroXP * activeDays,
    aggregateGoldAcrossSeparateWallets: daily.gold * activeDays * heroes,
    familyXPHypothesis30Percent: round(daily.heroXP * activeDays * heroes * 0.3),
    seasonWithoutBonus: seasonProgress(adventureXP),
    // Upper scenario: all roster members complete a task on EVERY active day.
    // Combo timing and integer rounding are unspecified; this is arithmetic only.
    seasonWithEveryActiveDayCombo: seasonProgress(adventureXP * 1.1),
    // Conditional ceiling, NOT reachable income: assumes all four bosses were defeated,
    // each gives the maximum 500 XP ONCE to the family, and combo affects task XP only.
    seasonWithComboAndFourMaximumBossRewards: seasonProgress(adventureXP * 1.1 + 2000),
  };
}

export function bossScenario(heroes: number) {
  requireInteger(heroes, 1, 'heroes');
  const daily = baselinePerHeroActiveDay();
  const scale = 0.65 + 0.35 * heroes;
  const normalHP = 2000 * scale;
  const dailyDamage = daily.damage * heroes;
  // Continuous estimate grants fractional ultimates without waiting for a full charge.
  // It is a favorable pacing approximation, NOT a discrete gameplay simulation.
  // Assumes percent of MAX HP; the document does not define max vs remaining HP.
  const continuousDays = (hp: number, fraction: number) => hp /
    (dailyDamage + daily.ultimateEnergy * heroes / 100 * fraction * hp);
  return {
    heroes,
    rosterFrozenForEncounter: true,
    normalBaseHP: 2000,
    scaledNormalHP: round(normalHP),
    normalDaysWithoutUltimate: round(normalHP / dailyDamage),
    normalContinuousDaysWith3PercentUltimate: round(continuousDays(normalHP, 0.03)),
    normalContinuousDaysWith5PercentUltimate: round(continuousDays(normalHP, 0.05)),
    halloweenScaledTotalHP: round(sum(GDD_HALLOWEEN_BOSS_BASE_HP) * scale),
    halloweenDaysWithoutUltimate: round(sum(GDD_HALLOWEEN_BOSS_BASE_HP) * scale / dailyDamage),
    halloweenContinuousDaysWith3PercentUltimate: round(sum(GDD_HALLOWEEN_BOSS_BASE_HP.map(
      hp => continuousDays(hp * scale, 0.03),
    ))),
    halloweenContinuousDaysWith5PercentUltimate: round(sum(GDD_HALLOWEEN_BOSS_BASE_HP.map(
      hp => continuousDays(hp * scale, 0.05),
    ))),
  };
}

export function repeatedEasyTaskBeforeRounding(completions: number) {
  requireInteger(completions, 0, 'completions');
  const full = Math.min(5, completions);
  const half = Math.min(5, Math.max(0, completions - 5));
  const tenth = Math.max(0, completions - 10);
  return {
    completions,
    goldBeforeIntegerPolicy: round(full * 3 + half * 1.5 + tenth * 0.3),
    heroXP: completions * 5,
    adventureXPIfUncapped: completions * 5,
    damageIfUncapped: completions * 3,
    ultimateEnergyIfUncapped: completions,
  };
}

export function softDailyGoldBudget(nominalGold: number, threshold = 120) {
  requireInteger(nominalGold, 0, 'nominalGold');
  requireInteger(threshold, 1, 'threshold');
  // This interpretation applies full reward until threshold, then 20% of the excess.
  // A different treatment of the crossing task would produce another result.
  return Math.min(nominalGold, threshold) + Math.max(0, nominalGold - threshold) * 0.2;
}

export function buildBalanceAudit() {
  const daily = baselinePerHeroActiveDay();
  const totalHeroXP = heroXPFromLevel1To100();
  const totalSeasonXP = sum(SEASON_MILESTONE_COSTS);
  const heroCounts = [1, 2, 4, 6];
  const claimedCurve = [
    [1, 100], [2, 135], [3, 175], [5, 260], [10, 500], [20, 1080], [30, 1770],
    [40, 2540], [50, 3380], [60, 4280], [70, 5230], [80, 6240], [90, 7300], [99, 8300],
  ];
  return {
    auditVersion: 1,
    hypothetical: true,
    productionReady: false,
    executesPurchasesOrRewards: false,
    sources: AUDIT_SOURCES,
    assumptions: [
      'Adults are players in isolated v3 by explicit user decision; hero count includes every role.',
      '1/2/4/6 are sensitivity scenarios, not a product membership limit.',
      'One active hero performs 1 Easy + 2 Normal + 1 Hard per active day.',
      'No observed usage data. All amounts and thresholds are unapproved source hypotheses.',
      'Inactive days yield zero new income, with no subtraction of accumulated progress.',
      'No unspecified achievement, level-up, chest, pet, stat or Family Task bonuses.',
      'Family XP and combo are fractional analytical values: no production rounding policy exists.',
      'Season track is assumed shared; a personal track would use the one-hero row.',
      'Boss XP ceiling is conditional on victories, never assumed as ordinary income.',
      'No Gold price catalogue exists in the proposals, so Gold spending cannot be validated.',
    ],
    baselinePerHeroActiveDay: daily,
    heroProgress: {
      totalXPLevel1To100: totalHeroXP,
      formulaVsDocument: claimedCurve.map(([level, claimed]) => ({
        level, documentNextXP: claimed, formulaNextXP: heroXPToNextLevel(level),
      })),
      baselineActiveDaysTo100: round(totalHeroXP / daily.heroXP),
      activeDaysWithMaximum15PercentStreakFromDay1: round(totalHeroXP / (daily.heroXP * 1.15)),
      activeDaysAtSixHardTasksDaily: round(totalHeroXP / (6 * HYPOTHETICAL_TASKS.hard.heroXP)),
      requiredXPPerDayFor9MonthsOf30Days: round(totalHeroXP / 270),
      requiredXPPerDayFor15MonthsOf30Days: round(totalHeroXP / 450),
    },
    season: {
      totalXP: totalSeasonXP,
      milestoneCosts: SEASON_MILESTONE_COSTS,
      requiredFamilyXPPerDay28: round(totalSeasonXP / 28),
      requiredFamilyXPPerActiveDay20: totalSeasonXP / 20,
      economyDocExtrapolated30Costs100ThenPlus20: 30 * (100 + 680) / 2,
      scenarios: heroCounts.flatMap(heroes => [
        familyScenario(heroes, 28), familyScenario(heroes, 20),
      ]),
      oneOfFourHeroesAbsentSevenDays: {
        heroActiveDays: 4 * 28 - 7,
        adventureXPWithoutBonus: daily.adventureXP * (4 * 28 - 7),
        adventureXPWithComboOn21SharedDays: round(daily.adventureXP * (4 * 21 * 1.1 + 3 * 7)),
        note: 'Roster stays four; one hero is absent for seven days; others keep their rewards.',
      },
    },
    bosses: heroCounts.map(bossScenario),
    weeklyGoal40Tasks: heroCounts.map(heroes => ({
      heroes,
      tasksPerHeroPerDayAcross7Days: round(40 / heroes / 7),
      tasksPerHeroPerActiveDayAcross5Days: round(40 / heroes / 5),
    })),
    simultaneousActivityIllustration: {
      independentProbabilityPerHero: 0.8,
      empirical: false,
      families: heroCounts.map(heroes => ({ heroes, allActiveProbability: round(0.8 ** heroes) })),
    },
    monthlyGold: {
      baseline30ActiveDays: daily.gold * 30,
      baseline20ActiveDays: daily.gold * 20,
      threeNormalTasks30Days: 3 * 8 * 30,
      sixNormalTasks30Days: 6 * 8 * 30,
      sixHardTasks30Days: 6 * 15 * 30,
      economyDocClaim: 2000,
      validatedGoldSpending: null,
    },
    inflationAndRounding: {
      repeatedEasy100: repeatedEasyTaskBeforeRounding(100),
      repeatedEasy1000: repeatedEasyTaskBeforeRounding(1000),
      distinctEasy100GoldAtSoftBudget120: softDailyGoldBudget(100 * 3),
      distinctEasy1000GoldAtSoftBudget120: softDailyGoldBudget(1000 * 3),
      familyXPForOneEasyBeforeRounding: 5 * 0.3,
      eventShop: {
        small: 100, rare: 250, epic: 500, legendary: 900,
        oneOfEach: 1750,
        economyDocMonthlyTokens: 1000,
        gddSeasonTokenRange: [1800, 2500],
        balancesAfterOneOfEach: [1000 - 1750, 1800 - 1750, 2500 - 1750],
        note: 'Negative result means unaffordable, not a permitted wallet debt; grant schedule unspecified.',
      },
      familyStarsFromEconomyDoc: {
        perfectDaily28Days: 28,
        ifSevenDayBonusRepeatsFourTimes: 28 + 4 * 3,
        samePlusOneSeasonBoss: 28 + 4 * 3 + 10,
        reportedMonthlyTarget: [5, 15],
      },
    },
    petTiming: {
      activeDaysToHatch100XP: 100 / daily.petXP,
      activeDaysForFurther500XP: 500 / daily.petXP,
      totalDaysIfSecondThresholdIsAdditional: 600 / daily.petXP,
      totalDaysIfSecondThresholdIsCumulative: 500 / daily.petXP,
      note: 'GDD does not specify cumulative vs additional evolution thresholds.',
    },
  };
}

const entry = process.argv[1];
if (entry && import.meta.url === pathToFileURL(resolve(entry)).href) {
  process.stdout.write(`${JSON.stringify(buildBalanceAudit(), null, 2)}\n`);
}
