/**
 * Фаза 6: PostgreSQL — источник правды для прогресса игрока.
 *
 * Завершение задачи выполняется одной транзакцией: блокируются пользователи
 * семьи, задача, босс и челлендж; затем фиксируются completion, экономика и
 * все побочные эффекты. appState обновляется внутри той же критической секции
 * и откатывается к DB-снимку при ошибке.
 */
import { and, eq, gt, inArray } from 'drizzle-orm';
import { db } from '../db';
import * as schema from '../db/schema';
import { appState } from './stateService';
import type { Completion, Task, User } from '../types';
import { getFamilyGameState } from './familyGameStateService';
import { applyTaskCompletion } from './taskService';
import { rollSurpriseChest } from './taskGenerator';
import { getNowTimestamp, getTodayStr } from '../lib/dateUtils';

type AppliedCompletion = Exclude<ReturnType<typeof applyTaskCompletion>, { error: string }>;

export interface AtomicCompletionResult {
  status: 'completed' | 'duplicate' | 'not_found' | 'db_error';
  result?: AppliedCompletion;
  surpriseChest?: ReturnType<typeof rollSurpriseChest>;
  totalGoldEarned?: number;
}

interface FamilyRuntimeSnapshot {
  users: Array<{ target: User; value: User }>;
  task: Task;
  completions: typeof appState.completions;
  perfectDays: typeof appState.perfectDays;
  userPets: typeof appState.userPets;
  userAchievements: typeof appState.userAchievements;
  purchases: typeof appState.purchases;
  boss: ReturnType<typeof structuredClone>;
  challenge: ReturnType<typeof structuredClone>;
  familyUserIds: Set<number>;
}

interface CompletionEffectsV1 {
  version: 1;
  userDeltas: Array<{
    id: number;
    gold: number;
    xp: number;
    crystals: number;
    hp: number;
    mp: number;
  }>;
  streakBefore: {
    current: number;
    best: number;
    status: User['streak_status'];
    lastUpdate: string | null;
  };
  taskBefore: { value: number; lastCompletedAt: string | null };
  boss: { damageDelta: number; causedDefeat: boolean };
  challenge: { progressDelta: number; causedCompletion: boolean };
  addedPerfectDay: boolean;
  addedAchievements: number[];
  addedPets: Array<{ userId: number; petId: number }>;
}

function syncMutableUser(memoryUser: User, dbUser: typeof schema.users.$inferSelect): void {
  memoryUser.gold = dbUser.gold;
  memoryUser.xp = dbUser.xp;
  memoryUser.crystals = dbUser.crystals;
  memoryUser.hp = dbUser.hp;
  memoryUser.max_hp = dbUser.max_hp;
  memoryUser.mp = dbUser.mp;
  memoryUser.max_mp = dbUser.max_mp;
  memoryUser.current_streak = dbUser.current_streak;
  memoryUser.best_streak = dbUser.best_streak;
  memoryUser.streak_status = dbUser.streak_status as User['streak_status'];
  memoryUser.streak_freeze_available = dbUser.streak_freeze_available;
  memoryUser.streak_freeze_last_used = dbUser.streak_freeze_last_used?.toISOString();
  memoryUser.last_streak_update = dbUser.last_streak_update ?? undefined;
  memoryUser.skill_date = dbUser.skill_date;
}

function restoreFamilySnapshot(snapshot: FamilyRuntimeSnapshot): void {
  for (const entry of snapshot.users) Object.assign(entry.target, entry.value);
  Object.assign(
    appState.tasks.find((candidate) => candidate.id === snapshot.task.id) ?? snapshot.task,
    snapshot.task,
  );
  const gameState = getFamilyGameState(Number(snapshot.users[0]?.value.family_id));
  if (gameState) {
    Object.assign(gameState.boss, snapshot.boss);
    Object.assign(gameState.challenge, snapshot.challenge);
  }
  const outsideFamily = <T extends { user_id: number }>(rows: T[]): T[] =>
    rows.filter((row) => !snapshot.familyUserIds.has(row.user_id));
  appState.completions = [...outsideFamily(appState.completions), ...snapshot.completions];
  appState.perfectDays = [...outsideFamily(appState.perfectDays), ...snapshot.perfectDays];
  appState.userPets = [...outsideFamily(appState.userPets), ...snapshot.userPets];
  appState.userAchievements = [
    ...outsideFamily(appState.userAchievements),
    ...snapshot.userAchievements,
  ];
  appState.purchases = [...outsideFamily(appState.purchases), ...snapshot.purchases];
}

/**
 * Атомарное завершение задачи. Уникальный индекс отвечает за идемпотентность,
 * а блокировка всех user-строк семьи сериализует награды и победу над боссом
 * даже при нескольких Node-процессах.
 */
export async function completeTaskAtomic(user: User, task: Task): Promise<AtomicCompletionResult> {
  const familyId = Number(user.family_id);
  const familyGameState = getFamilyGameState(familyId);
  if (!Number.isInteger(familyId) || familyId <= 0 || !familyGameState) {
    return { status: 'not_found' };
  }

  let snapshot: FamilyRuntimeSnapshot | undefined;
  try {
    return await db.transaction(async (tx): Promise<AtomicCompletionResult> => {
      const familyRows = await tx
        .select()
        .from(schema.users)
        .where(eq(schema.users.family_id, familyId))
        .orderBy(schema.users.id)
        .for('update');
      const dbUser = familyRows.find((row) => row.id === user.id);
      if (!dbUser) return { status: 'not_found' };

      const [dbTask] = await tx
        .select()
        .from(schema.tasks)
        .where(and(eq(schema.tasks.id, task.id), eq(schema.tasks.family_id, familyId)))
        .for('update')
        .limit(1);
      if (!dbTask) return { status: 'not_found' };

      const [dbBoss] = await tx
        .select()
        .from(schema.bosses)
        .where(eq(schema.bosses.family_id, familyId))
        .for('update')
        .limit(1);
      if (!dbBoss) throw new Error(`Boss for family ${familyId} is missing`);

      const [dbChallenge] = await tx
        .select()
        .from(schema.family_challenges)
        .where(
          and(
            eq(schema.family_challenges.family_id, familyId),
            eq(schema.family_challenges.challenge_code, familyGameState.challenge.code),
          ),
        )
        .for('update')
        .limit(1);

      const familyUserIds = new Set(familyRows.map((row) => row.id));
      const ids = [...familyUserIds];
      const completionRows = await tx
        .select()
        .from(schema.completions)
        .where(inArray(schema.completions.user_id, ids));
      const perfectRows = await tx
        .select()
        .from(schema.perfect_days)
        .where(inArray(schema.perfect_days.user_id, ids));
      const petRows = await tx
        .select()
        .from(schema.character_pets)
        .where(inArray(schema.character_pets.character_id, ids));
      const achievementRows = await tx
        .select()
        .from(schema.user_achievements)
        .where(inArray(schema.user_achievements.user_id, ids));
      const purchaseRows = await tx
        .select()
        .from(schema.purchases)
        .where(inArray(schema.purchases.user_id, ids));

      for (const row of familyRows) {
        const memoryUser = appState.users.find((candidate) => candidate.id === row.id);
        if (memoryUser) syncMutableUser(memoryUser, row);
      }
      task.value = dbTask.value ?? 0;
      (task as Task & { last_completed_at?: Date }).last_completed_at = dbTask.last_completed_at ?? undefined;
      Object.assign(familyGameState.boss, {
        id: dbBoss.id,
        week_key: dbBoss.week_key,
        name: dbBoss.name,
        emoji: dbBoss.emoji,
        imageUrl: dbBoss.sprite_url || undefined,
        spriteSheetUrl: dbBoss.sprite_url || undefined,
        hp: dbBoss.hp,
        maxHp: dbBoss.max_hp,
        damage: dbBoss.damage,
        defeated: dbBoss.defeated,
      });
      if (dbChallenge) {
        familyGameState.challenge.progress = dbChallenge.progress;
        familyGameState.challenge.completed = dbChallenge.completed;
      }

      appState.completions = [
        ...appState.completions.filter((row) => !familyUserIds.has(row.user_id)),
        ...completionRows.map((row) => ({
          id: row.id,
          user_id: row.user_id,
          task_id: row.task_id,
          completed_at: row.completed_at,
          completed_at_ts: row.completed_at_ts,
        })),
      ];
      appState.perfectDays = [
        ...appState.perfectDays.filter((row) => !familyUserIds.has(row.user_id)),
        ...perfectRows.map((row) => ({ user_id: row.user_id, day: row.day })),
      ];
      appState.userPets = [
        ...appState.userPets.filter((row) => !familyUserIds.has(row.user_id)),
        ...petRows.map((row) => ({
          user_id: row.character_id,
          pet_id: row.pet_id,
          is_active: row.is_active ?? false,
          feed_points: row.feed_points,
        })),
      ];
      appState.userAchievements = [
        ...appState.userAchievements.filter((row) => !familyUserIds.has(row.user_id)),
        ...achievementRows.map((row) => ({
          user_id: row.user_id,
          achievement_id: row.achievement_id,
        })),
      ];
      appState.purchases = [
        ...appState.purchases.filter((row) => !familyUserIds.has(row.user_id)),
        ...purchaseRows.map((row) => ({
          id: row.id,
          user_id: row.user_id,
          reward_id: row.reward_id,
          reward_title: row.reward_title || '',
          created_at: row.created_at,
        })),
      ];

      snapshot = {
        users: appState.users
          .filter((candidate) => familyUserIds.has(candidate.id))
          .map((target) => ({ target, value: structuredClone(target) })),
        task: structuredClone(task),
        completions: structuredClone(appState.completions.filter((row) => familyUserIds.has(row.user_id))),
        perfectDays: structuredClone(appState.perfectDays.filter((row) => familyUserIds.has(row.user_id))),
        userPets: structuredClone(appState.userPets.filter((row) => familyUserIds.has(row.user_id))),
        userAchievements: structuredClone(
          appState.userAchievements.filter((row) => familyUserIds.has(row.user_id)),
        ),
        purchases: structuredClone(appState.purchases.filter((row) => familyUserIds.has(row.user_id))),
        boss: structuredClone(familyGameState.boss),
        challenge: structuredClone(familyGameState.challenge),
        familyUserIds,
      };

      const completedAt = getTodayStr();
      const completedAtTs = getNowTimestamp();
      const [inserted] = await tx
        .insert(schema.completions)
        .values({
          user_id: user.id,
          task_id: task.id,
          completed_at: completedAt,
          completed_at_ts: completedAtTs,
          points: task.points,
        })
        .onConflictDoNothing()
        .returning({ id: schema.completions.id });
      if (!inserted) return { status: 'duplicate' };

      const petKeysBefore = new Set(
        appState.userPets
          .filter((row) => familyUserIds.has(row.user_id))
          .map((row) => `${row.user_id}:${row.pet_id}`),
      );
      const calculation = applyTaskCompletion(user, task, {
        id: inserted.id,
        user_id: user.id,
        task_id: task.id,
        completed_at: completedAt,
        completed_at_ts: completedAtTs,
      });
      if ('error' in calculation) throw new Error(`STATE_CONFLICT:${calculation.error}`);

      const surpriseChest = rollSurpriseChest();
      let totalGoldEarned = calculation.goldGain;
      if (surpriseChest) {
        user.gold += surpriseChest.gold;
        user.crystals = (user.crystals || 0) + surpriseChest.crystals;
        totalGoldEarned += surpriseChest.gold;
      }

      for (const row of familyRows) {
        const memoryUser = appState.users.find((candidate) => candidate.id === row.id);
        if (!memoryUser) continue;
        if (row.id === user.id) {
          await tx.update(schema.users).set({
            gold: memoryUser.gold,
            xp: memoryUser.xp,
            crystals: memoryUser.crystals ?? 0,
            hp: memoryUser.hp,
            mp: memoryUser.mp,
            current_streak: memoryUser.current_streak,
            best_streak: memoryUser.best_streak,
            streak_status: memoryUser.streak_status,
            skill_date: memoryUser.skill_date,
            last_streak_update: memoryUser.last_streak_update,
          }).where(eq(schema.users.id, row.id));
        } else if (memoryUser.gold !== row.gold) {
          await tx.update(schema.users).set({ gold: memoryUser.gold }).where(eq(schema.users.id, row.id));
        }
      }

      await tx.update(schema.tasks).set({
        value: task.value ?? 0,
        last_completed_at: new Date(),
      }).where(eq(schema.tasks.id, task.id));
      await tx.update(schema.bosses).set({
        damage: familyGameState.boss.damage,
        defeated: familyGameState.boss.defeated,
      }).where(eq(schema.bosses.id, dbBoss.id));
      await tx.insert(schema.family_challenges).values({
        family_id: familyId,
        challenge_code: familyGameState.challenge.code,
        progress: familyGameState.challenge.progress,
        completed: familyGameState.challenge.completed,
        updated_at: new Date(),
      }).onConflictDoUpdate({
        target: [schema.family_challenges.family_id, schema.family_challenges.challenge_code],
        set: {
          progress: familyGameState.challenge.progress,
          completed: familyGameState.challenge.completed,
          updated_at: new Date(),
        },
      });

      if (calculation.perfect) {
        await tx.insert(schema.perfect_days).values({
          user_id: user.id,
          day: completedAt,
        }).onConflictDoNothing();
      }
      for (const achievement of calculation.achievements) {
        await tx.insert(schema.user_achievements).values({
          user_id: user.id,
          achievement_id: achievement.id,
        }).onConflictDoNothing();
      }
      const newPetLinks = appState.userPets.filter(
        (row) => familyUserIds.has(row.user_id) && !petKeysBefore.has(`${row.user_id}:${row.pet_id}`),
      );
      for (const pet of newPetLinks) {
        await tx.insert(schema.character_pets).values({
          character_id: pet.user_id,
          pet_id: pet.pet_id,
          is_active: pet.is_active ?? false,
          feed_points: pet.feed_points ?? 0,
        }).onConflictDoNothing();
      }

      const beforeUsers = new Map(snapshot.users.map((entry) => [entry.value.id, entry.value]));
      const effects: CompletionEffectsV1 = {
        version: 1,
        userDeltas: familyRows.map((row) => {
          const before = beforeUsers.get(row.id)!;
          const after = appState.users.find((candidate) => candidate.id === row.id) ?? before;
          return {
            id: row.id,
            gold: after.gold - before.gold,
            xp: after.xp - before.xp,
            crystals: (after.crystals ?? 0) - (before.crystals ?? 0),
            hp: (after.hp ?? 0) - (before.hp ?? 0),
            mp: (after.mp ?? 0) - (before.mp ?? 0),
          };
        }),
        streakBefore: {
          current: snapshot.users.find((entry) => entry.value.id === user.id)?.value.current_streak ?? 0,
          best: snapshot.users.find((entry) => entry.value.id === user.id)?.value.best_streak ?? 0,
          status: snapshot.users.find((entry) => entry.value.id === user.id)?.value.streak_status,
          lastUpdate: snapshot.users.find((entry) => entry.value.id === user.id)?.value.last_streak_update ?? null,
        },
        taskBefore: {
          value: snapshot.task.value ?? 0,
          lastCompletedAt: (snapshot.task as Task & { last_completed_at?: Date }).last_completed_at?.toISOString() ?? null,
        },
        boss: {
          damageDelta: familyGameState.boss.damage - Number((snapshot.boss as any).damage || 0),
          causedDefeat: !Number((snapshot.boss as any).defeated) && !!familyGameState.boss.defeated,
        },
        challenge: {
          progressDelta: Number(familyGameState.challenge.progress || 0) - Number((snapshot.challenge as any).progress || 0),
          causedCompletion: !(snapshot.challenge as any).completed && !!familyGameState.challenge.completed,
        },
        addedPerfectDay: calculation.perfect,
        addedAchievements: calculation.achievements.map((achievement) => achievement.id),
        addedPets: newPetLinks.map((pet) => ({ userId: pet.user_id, petId: pet.pet_id })),
      };
      await tx.update(schema.completions).set({ effects })
        .where(eq(schema.completions.id, inserted.id));

      return { status: 'completed', result: calculation, surpriseChest, totalGoldEarned };
    });
  } catch (error) {
    if (snapshot) restoreFamilySnapshot(snapshot);
    if (error instanceof Error && error.message.startsWith('STATE_CONFLICT:')) {
      return { status: 'duplicate' };
    }
    console.error('[progress] atomic task completion failed:', error);
    return { status: 'db_error' };
  }
}

export interface UndoCompletionResult {
  status:
    | 'undone'
    | 'missing'
    | 'not_latest'
    | 'effects_missing'
    | 'effects_in_use'
    | 'dependent_reward'
    | 'insufficient_balance'
    | 'db_error';
}

function isCompletionEffects(value: unknown): value is CompletionEffectsV1 {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<CompletionEffectsV1>;
  return candidate.version === 1
    && Array.isArray(candidate.userDeltas)
    && Array.isArray(candidate.addedAchievements)
    && Array.isArray(candidate.addedPets)
    && !!candidate.streakBefore
    && !!candidate.taskBefore
    && !!candidate.boss
    && !!candidate.challenge;
}

/**
 * Отмена последнего семейного completion с точным реверсом записанных эффектов.
 * Более старую запись отменять нельзя: её абсолютные task/challenge переходы уже
 * могли стать основой последующих наград.
 */
export async function undoTaskCompletionAtomic(user: User, task: Task): Promise<UndoCompletionResult> {
  const familyId = Number(user.family_id);
  const familyGameState = getFamilyGameState(familyId);
  if (!Number.isInteger(familyId) || familyId <= 0 || !familyGameState) {
    return { status: 'missing' };
  }
  const day = getTodayStr();

  try {
    const outcome = await db.transaction(async (tx) => {
      const familyRows = await tx.select().from(schema.users)
        .where(eq(schema.users.family_id, familyId))
        .orderBy(schema.users.id)
        .for('update');
      const familyUserIds = familyRows.map((row) => row.id);
      if (!familyUserIds.includes(user.id)) return { status: 'missing' as const };

      const [dbTask] = await tx.select().from(schema.tasks)
        .where(and(eq(schema.tasks.id, task.id), eq(schema.tasks.family_id, familyId)))
        .for('update').limit(1);
      const [dbBoss] = await tx.select().from(schema.bosses)
        .where(eq(schema.bosses.family_id, familyId)).for('update').limit(1);
      const [dbChallenge] = await tx.select().from(schema.family_challenges)
        .where(and(
          eq(schema.family_challenges.family_id, familyId),
          eq(schema.family_challenges.challenge_code, familyGameState.challenge.code),
        )).for('update').limit(1);
      if (!dbTask || !dbBoss) return { status: 'missing' as const };

      const [completion] = await tx.select().from(schema.completions)
        .where(and(
          eq(schema.completions.user_id, user.id),
          eq(schema.completions.task_id, task.id),
          eq(schema.completions.completed_at, day),
        )).for('update').limit(1);
      if (!completion) return { status: 'missing' as const };
      if (!isCompletionEffects(completion.effects)) return { status: 'effects_missing' as const };
      const effects = completion.effects;

      const later = await tx.select({ id: schema.completions.id }).from(schema.completions)
        .where(and(
          inArray(schema.completions.user_id, familyUserIds),
          gt(schema.completions.id, completion.id),
        )).limit(1);
      if (later.length > 0) return { status: 'not_latest' as const };

      const currentUser = familyRows.find((row) => row.id === user.id)!;
      if (
        currentUser.last_streak_update === day
        && currentUser.current_streak !== effects.streakBefore.current
        && [3, 7, 10].includes(currentUser.current_streak)
      ) {
        const milestone = await tx.select({ id: schema.milestone_rewards_given.id })
          .from(schema.milestone_rewards_given)
          .where(and(
            eq(schema.milestone_rewards_given.user_id, user.id),
            eq(schema.milestone_rewards_given.milestone_day, currentUser.current_streak),
          )).limit(1);
        if (milestone.length > 0) return { status: 'dependent_reward' as const };
      }

      for (const addedPet of effects.addedPets) {
        const [pet] = await tx.select().from(schema.character_pets).where(and(
          eq(schema.character_pets.character_id, addedPet.userId),
          eq(schema.character_pets.pet_id, addedPet.petId),
        )).for('update').limit(1);
        if (pet && (pet.is_active || pet.feed_points > 0)) {
          return { status: 'effects_in_use' as const };
        }
      }

      const updates: Array<typeof schema.users.$inferSelect> = [];
      for (const delta of effects.userDeltas) {
        const current = familyRows.find((row) => row.id === delta.id);
        if (!current) continue;
        const gold = current.gold - delta.gold;
        const xp = current.xp - delta.xp;
        const crystals = current.crystals - delta.crystals;
        if (gold < 0 || xp < 0 || crystals < 0) {
          return { status: 'insufficient_balance' as const };
        }
        const restoreStreak = current.id === user.id
          && current.last_streak_update === day
          && effects.streakBefore.lastUpdate !== day;
        const [updated] = await tx.update(schema.users).set({
          gold,
          xp,
          crystals,
          hp: Math.max(0, Math.min(current.max_hp, current.hp - delta.hp)),
          mp: Math.max(0, Math.min(current.max_mp, current.mp - delta.mp)),
          ...(restoreStreak ? {
            current_streak: effects.streakBefore.current,
            best_streak: effects.streakBefore.best,
            streak_status: effects.streakBefore.status,
            last_streak_update: effects.streakBefore.lastUpdate,
          } : {}),
        }).where(eq(schema.users.id, current.id)).returning();
        updates.push(updated);
      }

      const restoredTaskDate = effects.taskBefore.lastCompletedAt
        ? new Date(effects.taskBefore.lastCompletedAt)
        : null;
      await tx.update(schema.tasks).set({
        value: effects.taskBefore.value,
        last_completed_at: restoredTaskDate,
      }).where(eq(schema.tasks.id, task.id));

      const bossDamage = Math.max(0, dbBoss.damage - effects.boss.damageDelta);
      const bossDefeated = effects.boss.causedDefeat && bossDamage < dbBoss.hp
        ? 0
        : dbBoss.defeated;
      const [updatedBoss] = await tx.update(schema.bosses).set({
        damage: bossDamage,
        defeated: bossDefeated,
      }).where(eq(schema.bosses.id, dbBoss.id)).returning();

      let updatedChallenge = dbChallenge;
      if (dbChallenge) {
        const progress = Math.max(0, dbChallenge.progress - effects.challenge.progressDelta);
        const completed = effects.challenge.causedCompletion && progress < familyGameState.challenge.target
          ? false
          : dbChallenge.completed;
        [updatedChallenge] = await tx.update(schema.family_challenges).set({
          progress,
          completed,
          updated_at: new Date(),
        }).where(and(
          eq(schema.family_challenges.family_id, familyId),
          eq(schema.family_challenges.challenge_code, dbChallenge.challenge_code),
        )).returning();
      }

      if (effects.addedPerfectDay) {
        await tx.delete(schema.perfect_days).where(and(
          eq(schema.perfect_days.user_id, user.id),
          eq(schema.perfect_days.day, day),
        ));
      }
      for (const achievementId of effects.addedAchievements) {
        await tx.delete(schema.user_achievements).where(and(
          eq(schema.user_achievements.user_id, user.id),
          eq(schema.user_achievements.achievement_id, achievementId),
        ));
      }
      for (const addedPet of effects.addedPets) {
        await tx.delete(schema.character_pets).where(and(
          eq(schema.character_pets.character_id, addedPet.userId),
          eq(schema.character_pets.pet_id, addedPet.petId),
        ));
      }
      await tx.delete(schema.completions).where(eq(schema.completions.id, completion.id));
      return {
        status: 'undone' as const,
        updates,
        updatedBoss,
        updatedChallenge,
        effects,
        restoredTaskDate,
      };
    });

    if (outcome.status !== 'undone') return outcome;
    for (const updated of outcome.updates) {
      const memoryUser = appState.users.find((candidate) => candidate.id === updated.id);
      if (memoryUser) syncMutableUser(memoryUser, updated);
    }
    task.value = outcome.effects.taskBefore.value;
    (task as Task & { last_completed_at?: Date }).last_completed_at = outcome.restoredTaskDate ?? undefined;
    familyGameState.boss.damage = outcome.updatedBoss.damage;
    familyGameState.boss.defeated = outcome.updatedBoss.defeated;
    if (outcome.updatedChallenge) {
      familyGameState.challenge.progress = outcome.updatedChallenge.progress;
      familyGameState.challenge.completed = outcome.updatedChallenge.completed;
    }
    appState.completions = appState.completions.filter(
      (completion) => !(completion.user_id === user.id && completion.task_id === task.id && completion.completed_at === day),
    );
    if (outcome.effects.addedPerfectDay) {
      appState.perfectDays = appState.perfectDays.filter(
        (perfect) => !(perfect.user_id === user.id && perfect.day === day),
      );
    }
    const removedAchievementIds = new Set(outcome.effects.addedAchievements);
    appState.userAchievements = appState.userAchievements.filter(
      (achievement) => achievement.user_id !== user.id || !removedAchievementIds.has(achievement.achievement_id),
    );
    const removedPetKeys = new Set(
      outcome.effects.addedPets.map((pet) => `${pet.userId}:${pet.petId}`),
    );
    appState.userPets = appState.userPets.filter(
      (pet) => !removedPetKeys.has(`${pet.user_id}:${pet.pet_id}`),
    );
    return { status: 'undone' };
  } catch (error) {
    console.error('[progress] undo completion transaction failed:', error);
    return { status: 'db_error' };
  }
}
