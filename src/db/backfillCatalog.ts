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
import { eq } from 'drizzle-orm';
import { client, db } from './index';
import * as schema from './schema';
import { appState } from '../services/stateService';
import {
  INITIAL_ACHIEVEMENTS,
  INITIAL_CHALLENGES,
  INITIAL_PETS,
  INITIAL_REWARDS,
  INITIAL_SHOP_ITEMS,
  INITIAL_TASKS,
} from '../data/initialData';
import { getTodayStr, getNowTimestamp, getWeekKey } from '../lib/dateUtils';
import { getWeeklyBoss } from '../utils/habiticaCatalog';

export async function ensureCatalogInDb(): Promise<void> {
  try {
    for (const item of INITIAL_SHOP_ITEMS) {
      await db
        .insert(schema.items)
        .values({
          id: item.id,
          name: item.title,
          // code — slug из initialData; onConflictDoUpdate дозаполняет его
          // существующим строкам (в dev-БД каталог уже был без code).
          code: item.code,
          type: item.slot,
          sprite_url: item.icon || '',
          cost_coins: item.cost,
        })
        .onConflictDoUpdate({
          target: schema.items.id,
          set: { code: item.code, sprite_url: item.icon || '', cost_coins: item.cost },
        });
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
    // Фаза 6: каталог питомцев и ачивок тоже нужен в БД — FK
    // character_pets.pet_id и user_achievements.achievement_id.
    for (const pet of INITIAL_PETS) {
      await db
        .insert(schema.pets)
        .values({
          id: pet.id,
          code: pet.code,
          name: pet.title,
          sprite_sheet_url: (pet as any).spriteSheetUrl || pet.icon || '',
          cost_coins: (pet as any).cost ?? 0,
        })
        .onConflictDoUpdate({
          target: schema.pets.id,
          set: {
            code: pet.code,
            name: pet.title,
            sprite_sheet_url: (pet as any).spriteSheetUrl || pet.icon || '',
          },
        });
    }
    for (const ach of INITIAL_ACHIEVEMENTS) {
      await db
        .insert(schema.achievements)
        .values({
          id: ach.id,
          code: ach.code,
          title: ach.title,
          description: ach.description,
          bonus: ach.bonus,
        })
        .onConflictDoNothing();
    }
    for (const challenge of INITIAL_CHALLENGES) {
      await db.insert(schema.challenges).values({
        code: challenge.code,
        title: challenge.title,
        description: challenge.description,
        target: challenge.target,
        bonus: challenge.bonus,
      }).onConflictDoUpdate({
        target: schema.challenges.code,
        set: {
          title: challenge.title,
          description: challenge.description,
          target: challenge.target,
          bonus: challenge.bonus,
        },
      });
    }

    // Каталоги используют стабильные явные id. Без синхронизации SERIAL
    // следующая пользовательская запись могла получить уже занятый id.
    await Promise.all([
      client`SELECT setval(pg_get_serial_sequence('items', 'id'), COALESCE(MAX(id), 1), MAX(id) IS NOT NULL) FROM items`,
      client`SELECT setval(pg_get_serial_sequence('rewards', 'id'), COALESCE(MAX(id), 1), MAX(id) IS NOT NULL) FROM rewards`,
      client`SELECT setval(pg_get_serial_sequence('pets', 'id'), COALESCE(MAX(id), 1), MAX(id) IS NOT NULL) FROM pets`,
      client`SELECT setval(pg_get_serial_sequence('achievements', 'id'), COALESCE(MAX(id), 1), MAX(id) IS NOT NULL) FROM achievements`,
    ]);

    const families = await db.select({ id: schema.families.id }).from(schema.families);
    const weeklyBoss = getWeeklyBoss();
    const challenge = INITIAL_CHALLENGES[0];
    for (const family of families) {
      await db.insert(schema.bosses).values({
        family_id: family.id,
        week_key: getWeekKey(),
        name: weeklyBoss.name,
        emoji: '',
        sprite_url: weeklyBoss.spriteUrl,
        max_hp: 90,
        hp: 90,
        damage: 0,
        defeated: 0,
      }).onConflictDoNothing();
      await db.insert(schema.family_challenges).values({
        family_id: family.id,
        challenge_code: challenge.code,
        progress: 0,
        completed: false,
      }).onConflictDoNothing();
    }
    console.log(
      `[Phase6-lite] catalog ensured: ${INITIAL_SHOP_ITEMS.length} items, ${INITIAL_REWARDS.length} rewards, ${INITIAL_PETS.length} pets, ${INITIAL_ACHIEVEMENTS.length} achievements`
    );
  } catch (e) {
    // Каталог в БД — не критично для старта (покупки вернут db_error и залогируют).
    console.error('[Phase6-lite] catalog backfill failed:', e);
  }
}

/**
 * Фаза 6: одноразовый перенос демо-прогресса из памяти в БД.
 *
 * Исторически completions/perfect_days/инвентарь/питомцы/покупки/рефералки
 * жили только в appState (сеялись демо-данными при старте). Теперь БД —
 * источник правды; чтобы после деплоя UI не «облысел» (пропали аутфиты,
 * питомцы, история ленты), демо-состояние переносится один раз — каждый
 * блок срабатывает только если целевая таблица ПУСТА. Дальше правит БД.
 */
export async function backfillProgressFromMemory(): Promise<void> {
  // Это исключительно инструмент миграции старой локальной демо-БД. Автоматически
  // переносить содержимое INITIAL_* в production недопустимо.
  if (process.env.BACKFILL_DEMO_DATA !== 'true') {
    console.log('[Phase6] demo progress backfill skipped (set BACKFILL_DEMO_DATA=true to run once)');
    return;
  }

  const guard = async (name: string, table: any): Promise<boolean> => {
    const rows = await db.select().from(table).limit(1);
    if (rows.length > 0) return false;
    console.log(`[Phase6] backfilling demo ${name} into DB (table was empty)`);
    return true;
  };

  try {
    const [demoFamily] = await db.select({ id: schema.families.id }).from(schema.families).limit(1);
    if (!demoFamily) {
      console.warn('[Phase6] demo progress backfill skipped: no family exists');
      return;
    }
    // Демо-задачи: исторически сидировались только квесты (seed.ts), а
    // ежедневные/еженедельные дела 1-5 жили только в памяти. Завершения
    // ссылаются на них по FK — заливаем до completions (идемпотентно).
    // day_of_week-массивы (новая система расписаний) в колонку integer не
    // влезают — пишем null; построчный try: одна кривая строка не роняет всё.
    for (const t of INITIAL_TASKS) {
      try {
        await db
          .insert(schema.tasks)
          .values({
            id: t.id,
            family_id: demoFamily.id,
            code: t.code,
            title: t.title,
            description: '',
            points: t.points,
            assignee: t.assignee,
            task_type: t.task_type,
            day_of_week: Array.isArray(t.day_of_week) ? null : (t.day_of_week ?? null),
            done: false,
          })
          .onConflictDoNothing();
      } catch (e) {
        console.error(`[Phase6] demo task ${t.id} backfill skipped:`, (e as any)?.message);
      }
    }

    // Завершения задач (история ленты + отметки «сделано сегодня»).
    if (await guard('completions', schema.completions)) {
      for (const c of appState.completions) {
        try {
          await db.insert(schema.completions).values({
            user_id: c.user_id,
            task_id: c.task_id,
            completed_at: c.completed_at,
            completed_at_ts: c.completed_at_ts || getNowTimestamp(),
          });
        } catch (e) {
          // FK/конфликт: завершение кастомной задачи, которой нет в INITIAL_TASKS.
          console.error(`[Phase6] demo completion task=${c.task_id} skipped:`, (e as any)?.message);
        }
      }
    }

    // Perfect days.
    if (await guard('perfect_days', schema.perfect_days)) {
      for (const p of appState.perfectDays) {
        await db.insert(schema.perfect_days).values({ user_id: p.user_id, day: p.day }).onConflictDoNothing();
      }
    }

    // Инвентарь/экипировка (character_inventory: is_equipped boolean).
    if (await guard('character_inventory', schema.character_inventory)) {
      for (const ui of appState.userItems) {
        await db
          .insert(schema.character_inventory)
          .values({ character_id: ui.user_id, item_id: ui.item_id, is_equipped: !!ui.equipped })
          .onConflictDoNothing();
      }
    }

    // Питомцы игроков.
    if (await guard('character_pets', schema.character_pets)) {
      for (const up of appState.userPets) {
        await db
          .insert(schema.character_pets)
          .values({ character_id: up.user_id, pet_id: up.pet_id })
          .onConflictDoNothing();
      }
    }

    // Покупки наград.
    if (await guard('purchases', schema.purchases)) {
      for (const p of appState.purchases) {
        await db
          .insert(schema.purchases)
          .values({
            user_id: p.user_id,
            reward_id: p.reward_id,
            reward_title: p.reward_title,
            created_at: p.created_at || getTodayStr(),
          })
          .onConflictDoNothing();
      }
    }

    // Рефералки.
    if (await guard('referrals', schema.referrals)) {
      for (const r of appState.referrals ?? []) {
        await db.insert(schema.referrals).values({
          referrer_id: r.referrer_id,
          referee_id: r.referee_id,
          referee_name: r.referee_name,
          created_at: r.created_at || getTodayStr(),
          bonus_gold: r.bonus_gold ?? 0,
          bonus_crystals: r.bonus_crystals ?? 0,
        });
      }
    }

    // Владение ачивками.
    if (await guard('user_achievements', schema.user_achievements)) {
      for (const ua of appState.userAchievements) {
        await db
          .insert(schema.user_achievements)
          .values({ user_id: ua.user_id, achievement_id: ua.achievement_id })
          .onConflictDoNothing();
      }
    }

    // Босс: исторически урон жил только в памяти (в БД всегда 0).
    // Если в БД урон/победа нулевые, а в памяти накоплен демо-урон — переносим,
    // чтобы после перехода на «БД = правда» босс не «сбросился» визуально.
    try {
      const bossRows = await db.select().from(schema.bosses);
      if (bossRows.length > 0 && !bossRows[0].damage && !bossRows[0].defeated && appState.boss.damage > 0) {
        await db
          .update(schema.bosses)
          .set({ damage: appState.boss.damage, defeated: appState.boss.defeated })
          .where(eq(schema.bosses.id, bossRows[0].id));
        console.log(`[Phase6] backfilled boss damage=${appState.boss.damage} into DB`);
      }
    } catch (e) {
      console.error('[Phase6] boss backfill failed:', e);
    }
  } catch (e) {
    console.error('[Phase6] backfillProgressFromMemory failed:', e);
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
