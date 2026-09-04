/** Транзакционные операции, общие для нескольких доменных сервисов. */
import { db } from '../db';
import * as schema from '../db/schema';
import { eq, sql } from 'drizzle-orm';

/**
 * Транзакционная запись награды milestone: начисление + отметка о выдаче.
 * Атомарно: либо оба, либо ничего. true = начислено.
 */
export async function grantMilestoneReward(
  userId: number,
  milestone: number,
  reward: { gold: number; crystals: number },
): Promise<{ gold: number; crystals: number } | null> {
  try {
    return await db.transaction(async (tx) => {
      const marker = await tx
        .insert(schema.milestone_rewards_given)
        .values({ user_id: userId, milestone_day: milestone })
        .onConflictDoNothing()
        .returning({ id: schema.milestone_rewards_given.id });
      if (marker.length === 0) return null;
      const [updated] = await tx
        .update(schema.users)
        .set({
          gold: sql`${schema.users.gold} + ${reward.gold}`,
          crystals: sql`${schema.users.crystals} + ${reward.crystals}`,
        })
        .where(eq(schema.users.id, userId))
        .returning({ gold: schema.users.gold, crystals: schema.users.crystals });
      if (!updated) throw new Error(`User ${userId} not found`);
      return updated;
    });
  } catch (e) {
    console.error('[arc01] grantMilestoneReward failed:', e);
    return null;
  }
}
