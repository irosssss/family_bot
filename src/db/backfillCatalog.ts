/**
 * Фаза 6-lite: каталог магазина/наград и кошелёк — в PostgreSQL.
 *
 * Бэкфилл каталога: таблицы items/rewards существуют в схеме, но исторически
 * не засеяны (каталог жил в памяти). FK у character_inventory и purchases
 * требуют реальных строк в items/rewards — заливаем недостающие при старте
 * (per-row onConflictDoNothing: идемпотентно, устойчиво к частичным данным).
 *
 * Гидрация: золото/кристаллы из БД → appState при старте, чтобы память
 * начинала с актуальных значений (раньше терялись при рестарте).
 */
import { db } from './index';
import * as schema from './schema';
import { appState } from '../services/stateService';
import { INITIAL_SHOP_ITEMS, INITIAL_REWARDS } from '../data/initialData';

export async function ensureCatalogInDb(): Promise<void> {
  try {
    for (const item of INITIAL_SHOP_ITEMS) {
      await db
        .insert(schema.items)
        .values({
          id: item.id,
          name: item.title,
          type: item.slot,
          sprite_url: item.icon || '',
          cost_coins: item.cost,
        })
        .onConflictDoNothing();
    }
    for (const reward of INITIAL_REWARDS) {
      await db
        .insert(schema.rewards)
        .values({
          id: reward.id,
          title: reward.title,
          cost: reward.cost,
          reward_type: reward.reward_type,
          active: reward.active,
        })
        .onConflictDoNothing();
    }
    console.log(`[Phase6-lite] catalog ensured: ${INITIAL_SHOP_ITEMS.length} items, ${INITIAL_REWARDS.length} rewards`);
  } catch (e) {
    // Каталог в БД — не критично для старта (покупки вернут db_error и залогируют).
    console.error('[Phase6-lite] catalog backfill failed:', e);
  }
}

export async function hydrateWalletFromDb(): Promise<void> {
  try {
    const rows = await db
      .select({ id: schema.users.id, gold: schema.users.gold, crystals: schema.users.crystals })
      .from(schema.users);
    let synced = 0;
    for (const row of rows) {
      const user = appState.users.find((u) => u.id === row.id);
      if (user) {
        user.gold = row.gold;
        user.crystals = row.crystals;
        synced++;
      }
    }
    if (synced > 0) console.log(`[Phase6-lite] wallet hydrated from DB for ${synced} users`);
  } catch (e) {
    console.error('[Phase6-lite] wallet hydration failed:', e);
  }
}
