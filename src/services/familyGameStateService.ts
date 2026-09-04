import { eq } from 'drizzle-orm';
import { db } from '../db';
import * as schema from '../db/schema';
import { INITIAL_CHALLENGES } from '../data/initialData';
import { getWeekKey } from '../lib/dateUtils';
import type { AppState, Boss, Challenge } from '../types';
import { getWeeklyBoss } from '../utils/habiticaCatalog';
import { appState } from './stateService';

export type FamilyGameState = NonNullable<AppState['familyGameStates']>[number];

export function getFamilyGameState(familyId: number | null | undefined): FamilyGameState | null {
  if (!familyId || !Number.isInteger(familyId)) return null;
  return appState.familyGameStates?.[familyId] ?? null;
}

export function setFamilyGameState(familyId: number, state: FamilyGameState): void {
  if (!appState.familyGameStates) appState.familyGameStates = {};
  appState.familyGameStates[familyId] = state;
  // Legacy-поля оставлены только для совместимости локальных чистых unit-тестов.
  if (familyId === 1) {
    appState.family = state.family;
    appState.boss = state.boss;
    appState.challenge = state.challenge;
  }
}

function mapBoss(row: typeof schema.bosses.$inferSelect): Boss {
  return {
    id: row.id,
    week_key: row.week_key,
    name: row.name,
    emoji: row.emoji,
    imageUrl: row.sprite_url || undefined,
    spriteSheetUrl: row.sprite_url || undefined,
    hp: row.hp,
    maxHp: row.max_hp,
    damage: row.damage,
    defeated: row.defeated,
  };
}

/** Загружает семейные HP, текущих боссов и прогресс челленджей до listen(). */
export async function hydrateFamilyGameStatesFromDb(): Promise<number> {
  const [families, bosses, challenges, familyChallenges] = await Promise.all([
    db.select().from(schema.families),
    db.select().from(schema.bosses),
    db.select().from(schema.challenges),
    db.select().from(schema.family_challenges),
  ]);
  const challengeByCode = new Map(challenges.map((challenge) => [challenge.code, challenge]));
  const currentWeekKey = getWeekKey();
  const weeklyBoss = getWeeklyBoss();
  const states: NonNullable<AppState['familyGameStates']> = {};

  for (const family of families) {
    let bossRow = bosses.find((boss) => boss.family_id === family.id);
    if (!bossRow) {
      const [created] = await db.insert(schema.bosses).values({
        family_id: family.id,
        week_key: currentWeekKey,
        name: weeklyBoss.name,
        emoji: '',
        sprite_url: weeklyBoss.spriteUrl,
        hp: 90,
        max_hp: 90,
        damage: 0,
        defeated: 0,
      }).returning();
      bossRow = created;
    } else if (bossRow.week_key !== currentWeekKey) {
      const [rotated] = await db.update(schema.bosses).set({
        week_key: currentWeekKey,
        name: weeklyBoss.name,
        emoji: '',
        sprite_url: weeklyBoss.spriteUrl,
        hp: 90,
        max_hp: 90,
        damage: 0,
        defeated: 0,
      }).where(eq(schema.bosses.id, bossRow.id)).returning();
      bossRow = rotated;
    }

    let familyChallenge = familyChallenges.find((entry) => entry.family_id === family.id);
    if (!familyChallenge) {
      const defaultChallenge = INITIAL_CHALLENGES[0];
      const [created] = await db.insert(schema.family_challenges).values({
        family_id: family.id,
        challenge_code: defaultChallenge.code,
        progress: 0,
        completed: false,
      }).returning();
      familyChallenge = created;
    }
    const challengeDefinition = challengeByCode.get(familyChallenge.challenge_code)
      ?? INITIAL_CHALLENGES[0];
    const challenge: Challenge = {
      code: challengeDefinition.code,
      title: challengeDefinition.title,
      description: challengeDefinition.description,
      target: challengeDefinition.target,
      bonus: challengeDefinition.bonus,
      progress: familyChallenge.progress,
      completed: familyChallenge.completed,
    };

    states[family.id] = {
      family: {
        id: family.id,
        family_code: family.family_code,
        name: family.name,
        family_hp: family.family_hp,
        max_family_hp: family.max_family_hp,
        exhausted_until: family.exhausted_until?.toISOString() ?? null,
      },
      boss: mapBoss(bossRow),
      challenge,
    };
  }

  appState.familyGameStates = states;
  if (states[1]) setFamilyGameState(1, states[1]);
  return Object.keys(states).length;
}
