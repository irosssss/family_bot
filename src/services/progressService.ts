/**
 * Фаза 6: PostgreSQL — источник правды для прогресса игрока.
 *
 * Завершения задач, perfect days, дроп питомцев, ачивки, урон боссу —
 * теперь пишутся в БД; память (appState) остаётся зеркалом для чтения UI.
 * Паттерн тот же, что в walletService: игровая логика синхронно мутирует
 * память, БД пишется следом (best-effort с логом). Дубли завершений
 * страхует уникальный индекс uq_completions_user_task_day (db/index.ts).
 *
 * Разделение ответственности:
 *   - taskService.applyTaskCompletion → persistCompletion (завершение,
 *     ценность задачи, perfect day, питомец, ачивки, босс).
 *   - taskRoutes POST /complete и /toggle → persistUserState (золото/опыт/
 *     HP/MP/streak — после ВСЕХ мутаций пользователя: сундук, стрик).
 */
import { and, eq } from 'drizzle-orm';
import { db } from '../db';
import * as schema from '../db/schema';
import { appState } from './stateService';
import type { Completion, Task, User } from '../types';

/** Снимок состояния пользователя в users (после всех игровых мутаций). */
export async function persistUserState(user: User): Promise<void> {
  try {
    await db
      .update(schema.users)
      .set({
        gold: user.gold,
        xp: user.xp,
        crystals: user.crystals ?? 0,
        hp: user.hp,
        mp: user.mp,
        current_streak: user.current_streak,
        best_streak: user.best_streak,
        streak_status: user.streak_status,
        skill_date: user.skill_date,
        last_streak_update: user.last_streak_update,
      })
      .where(eq(schema.users.id, user.id));
  } catch (e) {
    console.error('[Phase6] persistUserState failed:', e);
  }
}

/** Снимок босса в bosses (урон/победа). */
export async function persistBossState(): Promise<void> {
  try {
    await db
      .update(schema.bosses)
      .set({
        hp: appState.boss.hp,
        damage: appState.boss.damage,
        defeated: appState.boss.defeated,
      })
      .where(eq(schema.bosses.id, appState.boss.id));
  } catch (e) {
    console.error('[Phase6] persistBossState failed:', e);
  }
}

export interface CompletionPersistInput {
  completion: Completion;
  task: Task;
  perfect: boolean;
  pet: { id: number } | null;
  achievements: { id: number }[];
  bossDefeated: boolean;
}

/**
 * Пишет завершение + побочные эффекты в БД.
 * Возвращает id из БД (или null), чтобы вызывающий синхронизировал
 * id зеркала (замена Date.now()-id на серийный).
 */
export async function persistCompletion(input: CompletionPersistInput): Promise<number | null> {
  const { completion, task, perfect, pet, achievements, bossDefeated } = input;
  let insertedId: number | null = null;
  try {
    const [row] = await db
      .insert(schema.completions)
      .values({
        user_id: completion.user_id,
        task_id: completion.task_id,
        completed_at: completion.completed_at,
        completed_at_ts: completion.completed_at_ts,
        points: task.points,
      })
      .onConflictDoNothing()
      .returning({ id: schema.completions.id });
    insertedId = row?.id ?? null;

    // Ценность задачи (Task Value Decay, Этап 4) — в БД.
    const taskAny = task as any;
    await db
      .update(schema.tasks)
      .set({
        value: typeof taskAny.value === 'number' ? taskAny.value : 0,
        last_completed_at: new Date(),
      })
      .where(eq(schema.tasks.id, task.id));

    // Perfect day (Этап 8): все обязательные дела сделаны.
    if (perfect) {
      await db
        .insert(schema.perfect_days)
        .values({ user_id: completion.user_id, day: completion.completed_at })
        .onConflictDoNothing();
    }

    // Дроп питомца (25%).
    if (pet) {
      await db
        .insert(schema.character_pets)
        .values({ character_id: completion.user_id, pet_id: pet.id, is_active: false })
        .onConflictDoNothing();
    }

    // Разблокированные ачивки (бонусное золото попадает в persistUserState).
    for (const ach of achievements) {
      await db
        .insert(schema.user_achievements)
        .values({ user_id: completion.user_id, achievement_id: ach.id })
        .onConflictDoNothing();
    }

    // Босс: урон/победа. Победа = +20 золота ВСЕМ (остальным игрокам пишем
    // в БД здесь — их кошелёк никто больше не персистит в этом запросе).
    await persistBossState();
    if (bossDefeated) {
      for (const u of appState.users) {
        if (u.id === completion.user_id) continue; // его золотo persistUserState
        try {
          await db.update(schema.users).set({ gold: u.gold }).where(eq(schema.users.id, u.id));
        } catch (e) {
          console.error('[Phase6] boss bonus gold failed for user', u.id, e);
        }
      }
    }
  } catch (e) {
    console.error('[Phase6] persistCompletion failed:', e);
  }
  return insertedId;
}

export interface RemovalResult {
  status: 'deleted' | 'missing' | 'db_error';
}

/** Удаляет завершение (POST /toggle). missing = строки в БД не было. */
export async function removeCompletion(
  userId: number,
  taskId: number,
  day: string
): Promise<RemovalResult> {
  try {
    const removed = await db
      .delete(schema.completions)
      .where(
        and(
          eq(schema.completions.user_id, userId),
          eq(schema.completions.task_id, taskId),
          eq(schema.completions.completed_at, day)
        )
      )
      .returning({ id: schema.completions.id });
    return { status: removed.length > 0 ? 'deleted' : 'missing' };
  } catch (e) {
    console.error('[Phase6] removeCompletion failed (DEMO MODE без БД?):', e);
    return { status: 'db_error' };
  }
}
