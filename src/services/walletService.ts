/**
 * Фаза 6-lite + H4: атомарные операции кошелька.
 *
 * БД — источник правды для ТРАТ (покупки предметов и наград).
 * Канонический паттерн — транзакция с автоматическим ROLLBACK при ошибке
 * (postgres.js sql.begin / Drizzle db.transaction) + условное списание
 * `UPDATE users SET gold = gold - cost WHERE id = $1 AND gold >= $2
 *  RETURNING gold`: при параллельных покупках только одна проходит списание,
 * вторая получает пустой RETURNING → "недостаточно золота". Гонка исключена.
 *
 * Память (appState) остаётся зеркалом для чтения UI — мутируется только
 * ПОСЛЕ успешной транзакции, так что рассинхрон при сбое БД невозможен.
 */
import { and, eq, gte, inArray, sql } from 'drizzle-orm';
import { db } from '../db';
import * as schema from '../db/schema';
import { appState } from './stateService';

export interface WalletResult {
  ok: boolean;
  gold: number;
  reason?: 'insufficient_funds' | 'already_owned' | 'db_error' | 'not_found';
}

/** Атомарная покупка предмета лавки: списание золота + строка инвентаря. */
export async function buyShopItemAtomic(
  userId: number,
  itemId: number
): Promise<WalletResult> {
  const user = appState.users.find((u) => u.id === userId);
  const item = appState.shopItems.find((s) => s.id === itemId);
  if (!user || !item) return { ok: false, gold: 0, reason: 'not_found' };

  const cost = item.cost;

  try {
    const result = await db.transaction(async (tx) => {
      // 1. Уже куплен? (PK (character_id, item_id) страхует и в гонке ниже)
      const owned = await tx
        .select({ item_id: schema.character_inventory.item_id })
        .from(schema.character_inventory)
        .where(
          and(
            eq(schema.character_inventory.character_id, userId),
            eq(schema.character_inventory.item_id, itemId)
          )
        );
      if (owned.length > 0) {
        return { ok: false, gold: user.gold, reason: 'already_owned' as const };
      }

      // 2. Условное списание: проходит только если золота хватает.
      const debited = await tx
        .update(schema.users)
        .set({ gold: sql`${schema.users.gold} - ${cost}` })
        .where(and(eq(schema.users.id, userId), gte(schema.users.gold, cost)))
        .returning({ gold: schema.users.gold });
      if (debited.length === 0) {
        return { ok: false, gold: user.gold, reason: 'insufficient_funds' as const };
      }
      const newGold = debited[0].gold;

      // 3. Строка инвентаря. Если конфликт PK (параллельная покупка того же
      // предмета прошла между шагами 1 и 3) — откатываем ВСЮ транзакцию
      // исключением, чтобы списание не осталось без предмета.
      const inserted = await tx
        .insert(schema.character_inventory)
        .values({
          character_id: userId,
          item_id: itemId,
          is_equipped: true,
        })
        .onConflictDoNothing()
        .returning({ item_id: schema.character_inventory.item_id });
      if (inserted.length === 0) {
        throw new Error('INVENTORY_CONFLICT');
      }

      // 4. Снять другие предметы того же слота (в БД; слот берём из каталога).
      const sameSlotIds = appState.shopItems
        .filter((s) => s.slot === item.slot && s.id !== itemId)
        .map((s) => s.id);
      if (sameSlotIds.length > 0) {
        await tx
          .update(schema.character_inventory)
          .set({ is_equipped: false })
          .where(
            and(
              eq(schema.character_inventory.character_id, userId),
              inArray(schema.character_inventory.item_id, sameSlotIds)
            )
          );
      }

      return { ok: true as const, gold: newGold };
    });

    if (result.ok) {
      // 5. Зеркалим в память только после успешной транзакции.
      user.gold = result.gold;
      for (const ui of appState.userItems) {
        if (ui.user_id === userId && ui.equipped) {
          const it = appState.shopItems.find((s) => s.id === ui.item_id);
          if (it?.slot === item.slot) ui.equipped = 0;
        }
      }
      appState.userItems.push({ user_id: userId, item_id: itemId, equipped: 1 });
    } else if (result.reason === 'already_owned') {
      // Синхронизируем память, если она отстала (например, после рестарта).
      if (!appState.userItems.some((ui) => ui.user_id === userId && ui.item_id === itemId)) {
        appState.userItems.push({ user_id: userId, item_id: itemId, equipped: 1 });
      }
    }
    return result;
  } catch (e: any) {
    if (e?.message === 'INVENTORY_CONFLICT') {
      return { ok: false, gold: user.gold, reason: 'already_owned' };
    }
    console.error('[wallet] buyShopItemAtomic db error:', e);
    return { ok: false, gold: user.gold, reason: 'db_error' };
  }
}

/** Атомарная покупка награды: списание золота + запись в purchases. */
export async function buyRewardAtomic(
  userId: number,
  rewardId: number
): Promise<WalletResult> {
  const user = appState.users.find((u) => u.id === userId);
  const reward = appState.rewards.find((r) => r.id === Number(rewardId));
  if (!user || !reward) return { ok: false, gold: 0, reason: 'not_found' };
  if (reward.family_id != null && reward.family_id !== user.family_id) {
    return { ok: false, gold: user.gold, reason: 'not_found' };
  }

  const cost = reward.cost;
  const createdAt = new Date().toISOString();

  try {
    const result = await db.transaction(async (tx) => {
      const debited = await tx
        .update(schema.users)
        .set({ gold: sql`${schema.users.gold} - ${cost}` })
        .where(and(eq(schema.users.id, userId), gte(schema.users.gold, cost)))
        .returning({ gold: schema.users.gold });
      if (debited.length === 0) {
        return { ok: false as const, gold: user.gold, reason: 'insufficient_funds' as const };
      }
      const [purchase] = await tx.insert(schema.purchases).values({
        user_id: userId,
        reward_id: reward.id,
        reward_title: reward.title,
        created_at: createdAt,
      }).returning({ id: schema.purchases.id });
      let gold = debited[0].gold;
      let achievementId: number | undefined;
      const firstBuyAchievement = appState.achievements.find((achievement) => achievement.code === 'first_buy');
      if (firstBuyAchievement) {
        const unlocked = await tx.insert(schema.user_achievements).values({
          user_id: userId,
          achievement_id: firstBuyAchievement.id,
        }).onConflictDoNothing().returning({ achievement_id: schema.user_achievements.achievement_id });
        if (unlocked.length > 0) {
          gold += firstBuyAchievement.bonus;
          await tx.update(schema.users).set({ gold }).where(eq(schema.users.id, userId));
          achievementId = firstBuyAchievement.id;
        }
      }
      return { ok: true as const, gold, purchaseId: purchase.id, achievementId };
    });

    if (!result.ok) return result;

    // Зеркало в память.
    user.gold = result.gold;
    const purchase = {
      id: result.purchaseId,
      user_id: user.id,
      reward_id: reward.id,
      reward_title: reward.title,
      created_at: createdAt,
      user_name: user.display_name,
    };
    appState.purchases.push(purchase);
    if (result.achievementId && !appState.userAchievements.some(
      (achievement) => achievement.user_id === userId && achievement.achievement_id === result.achievementId,
    )) {
      appState.userAchievements.push({ user_id: userId, achievement_id: result.achievementId });
    }

    return { ok: true, gold: result.gold };
  } catch (e) {
    console.error('[wallet] buyRewardAtomic db error:', e);
    return { ok: false, gold: user.gold, reason: 'db_error' };
  }
}

/** Начисление кристаллов (Stars и бонусы): БД сначала, память — зеркало. */
export async function creditCrystals(userId: number, delta: number): Promise<boolean> {
  try {
    const updated = await db
      .update(schema.users)
      .set({ crystals: sql`${schema.users.crystals} + ${delta}` })
      .where(eq(schema.users.id, userId))
      .returning({ crystals: schema.users.crystals });
    if (updated.length === 0) return false;
    const user = appState.users.find((u) => u.id === userId);
    if (user) user.crystals = updated[0].crystals;
    return true;
  } catch (e) {
    console.error('[wallet] creditCrystals db error:', e);
    return false;
  }
}
