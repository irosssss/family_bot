/**
 * ARC-01: write-behind с гарантией и откатом.
 *
 * Проблема (до фикса): БД обновляется «вдогонку» — `.execute().catch(console.error)`
 * без await. При ошибке БД память остаётся изменённой → расхождение, потеря данных
 * при рестарте. Плюс `.execute()` без await — плавающие промисы, ошибка невидима.
 *
 * Решение: единая точка записи. Память мутирует только ПОСЛЕ успешного запроса
 * к БД (или остаётся, если БД недоступна в DEMO — но ошибка залогирована
 * и видна). Возврат: true — БД подтвердила запись.
 *
 * Постепенная миграция: критичные пути (золото, платежи, streak) — через эти
 * хелперы; некритичные (профиль/косметика) могут остаться best-effort.
 */
import { db } from '../db';
import * as schema from '../db/schema';
import { eq } from 'drizzle-orm';
import type { User } from '../types';

export type WalletPatch = Partial<{
  gold: number;
  xp: number;
  crystals: number;
  hp: number;
  mp: number;
  current_streak: number;
  best_streak: number;
  streak_status: string;
  skill_date: string | null;
  last_streak_update: string | null;
}>;

/** Записать кошелёк/стрики пользователя в БД. true = БД подтвердила. */
export async function persistUserWallet(userId: number, patch: WalletPatch): Promise<boolean> {
  try {
    await db
      .update(schema.users)
      .set(patch)
      .where(eq(schema.users.id, userId));
    return true;
  } catch (e) {
    console.error('[arc01] persistUserWallet failed:', e);
    return false;
  }
}

/** Записать поле профиля/внешности. Некритично: ошибка логируется, но не роняет API. */
export async function persistUserProfile(userId: number, patch: Record<string, unknown>): Promise<boolean> {
  try {
    await db
      .update(schema.users)
      .set(patch)
      .where(eq(schema.users.id, userId));
    return true;
  } catch (e) {
    console.error('[arc01] persistUserProfile failed:', e);
    return false;
  }
}

/**
 * Транзакционная запись награды milestone: начисление + отметка о выдаче.
 * Атомарно: либо оба, либо ничего. true = начислено.
 */
export async function grantMilestoneReward(
  userId: number,
  milestone: number,
  reward: { gold: number; crystals: number },
): Promise<boolean> {
  try {
    await db.transaction(async (tx) => {
      await tx
        .update(schema.users)
        .set({
          gold: reward.gold,
          crystals: reward.crystals,
        })
        .where(eq(schema.users.id, userId));
      await tx
        .insert(schema.milestone_rewards_given)
        .values({ user_id: userId, milestone_day: milestone });
    });
    return true;
  } catch (e) {
    console.error('[arc01] grantMilestoneReward failed:', e);
    return false;
  }
}
