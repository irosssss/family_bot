/**
 * Роуты состояния приложения.
 * GET /api/state — главная агрегация (гидрация из БД + обогащение).
 * GET /api/db-test — диагностика подключения к БД.
 * GET /api/health — health check.
 */
import { Request, Response, Router } from 'express';
import { eq, desc } from 'drizzle-orm';
import { db } from '../db';
import * as schema from '../db/schema';
import { users as usersTable } from '../db/schema';
import { appState } from '../services/stateService';
import { getTodayStr, getWeekKey } from '../lib/dateUtils';
import { getWeeklyBoss } from '../utils/habiticaCatalog';
import type { FeedEntry, ShopItem } from '../types';

export const stateRoutes = Router();

stateRoutes.get('/db-test', async (_req: Request, res: Response) => {
  try {
    const dbUsers = await db.select().from(usersTable);
    const dbTasks = await db.select().from(schema.tasks);
    res.json({ success: true, users: dbUsers });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

stateRoutes.get('/', async (req: Request, res: Response) => {
  try {
    const dbUsers = await db.select().from(usersTable);
    if (dbUsers.length > 0) {
      appState.users = dbUsers.map(u => ({ ...u, class: u.class_type })) as any;
    }

    const dbItems = await db.select().from(schema.items);
    if (dbItems.length > 0) {
      appState.shopItems = dbItems.map((i: any) => ({
        id: i.id,
        code: i.name.toLowerCase().replace(/ /g, '_'),
        title: i.name,
        imageUrl: i.sprite_url,
        slot: i.type === 'hat' ? 'head' : (i.type === 'clothing' ? 'body' : i.type),
        cost: i.cost_coins,
        statsModifier: i.stats_modifier,
      })) as any;
    }

    const dbPets = await db.select().from(schema.pets);
    if (dbPets.length > 0) {
       appState.pets = dbPets.map((p: any) => ({
         id: p.id,
         code: p.name.toLowerCase().replace(/ /g, '_'),
         title: p.name,
         imageUrl: p.sprite_sheet_url,
         cost: p.cost_coins
       })) as any;
    }

    const dbBosses = await db.select().from(schema.bosses);
    if (dbBosses.length > 0) {
      const dbBoss = dbBosses[0];
      // Недельная ротация боссов (Habitica-каталог, 117 шт):
      // если неделя сменилась — выбираем нового по номеру недели и обновляем БД.
      const currentWeekKey = getWeekKey();
      if ((dbBoss.week_key || '') !== currentWeekKey) {
        const weeklyBoss = getWeeklyBoss();
        const newHp = 90;
        await db.update(schema.bosses).set({
          week_key: currentWeekKey,
          name: `${weeklyBoss.name}`,
          sprite_url: weeklyBoss.spriteUrl,
          hp: newHp,
          max_hp: newHp,
        }).where(eq(schema.bosses.id, dbBoss.id)).execute().catch((e) => console.error('Boss rotation DB error:', e));
        Object.assign(dbBoss, { week_key: currentWeekKey, name: `${weeklyBoss.name}`, sprite_url: weeklyBoss.spriteUrl, hp: newHp, max_hp: newHp });
        console.log(`New week boss: ${weeklyBoss.name} (${weeklyBoss.id})`);
      }
      appState.boss = {
        id: dbBoss.id,
        week_key: dbBoss.week_key || '',
        damage: appState.boss?.damage || 10,
        defeated: appState.boss?.defeated || 0,
        name: dbBoss.name,
        emoji: dbBoss.emoji,
        imageUrl: dbBoss.sprite_url || undefined,
        spriteSheetUrl: dbBoss.sprite_url || undefined,
        hp: dbBoss.hp,
        maxHp: dbBoss.max_hp
      };
    }

    // Habitica Habits: гидрация из БД
    try {
      const dbHabits = await db.select().from(schema.habits).orderBy(desc(schema.habits.id));
      if (dbHabits.length > 0) {
        appState.habits = dbHabits as any;
      }
    } catch (e) {
      console.error('Habits hydrate error:', e);
    }
  } catch (e) { console.error('Error fetching data from DB:', e); }

  // Enrich users with equipped emojis and pets list
  const enrichedUsers = appState.users.map((u) => {
    const equippedItems = appState.userItems
      .filter((ui) => ui.user_id === u.id && ui.equipped)
      .map((ui) => appState.shopItems.find((s) => s.id === ui.item_id))
      .filter(Boolean) as ShopItem[];

    const userPetEmojis = appState.userPets
      .filter((up) => up.user_id === u.id)
      .map((up) => {
        const pet = appState.pets.find((p) => p.id === up.pet_id);
        if (!pet) return null;
        return { id: pet.id, emoji: pet.emoji, imageUrl: pet.imageUrl };
      })
      .filter(Boolean) as any[];

    const equipped: Record<string, string> = {};
    for (const item of equippedItems) {
      equipped[item.slot] = item.imageUrl || item.emoji || item.code || '';
    }
    // ULPC примерка: код предмета кладётся в отдельное поле equipped_codes,
    // чтобы фронт мог отличить ULPC-торс от старых 16-bit URL
    const equippedCodes: Record<string, string> = {};
    for (const item of equippedItems) {
      equippedCodes[item.slot] = item.code || '';
    }

    return {
      ...u,
      equipped,
      equipped_codes: equippedCodes,
      pets: userPetEmojis,
    };
  });

  const todayStr = getTodayStr();

  // Enrich tasks with done status for current user if query param provided
  const requestedUserId = req.query.userId ? Number(req.query.userId) : null;
  const enrichedTasks = appState.tasks.map((t) => {
    const isDone = appState.completions.some(
      (c) =>
        c.task_id === t.id &&
        c.completed_at === todayStr &&
        (requestedUserId ? c.user_id === requestedUserId : true)
    );
    return {
      ...t,
      done: isDone,
    };
  });

  // Enrich achievements with unlocked status
  const enrichedAchievements = appState.achievements.map((a) => {
    const isUnlocked = appState.userAchievements.some(
      (ua) => ua.achievement_id === a.id && (requestedUserId ? ua.user_id === requestedUserId : true)
    );
    return {
      ...a,
      unlocked: isUnlocked,
    };
  });

  // Enrich feed entries
  const feed: FeedEntry[] = appState.completions
    .slice(-20)
    .reverse()
    .map((c) => {
      const user = appState.users.find((u) => u.id === c.user_id);
      const task = appState.tasks.find((t) => t.id === c.task_id);
      const tsStr = String(c.completed_at_ts || c.completed_at || '');
      const dateStr = String(c.completed_at || '');
      return {
        id: c.id,
        userId: c.user_id,
        userName: user?.display_name || 'Игрок',
        taskTitle: task?.title || 'Задание',
        points: task?.points || 0,
        completedAt: tsStr,
        date: dateStr,
        timestamp: tsStr,
      };
    });

  res.json({
    users: enrichedUsers,
    tasks: enrichedTasks,
    boss: appState.boss,
    challenge: appState.challenge,
    rewards: appState.rewards,
    shopItems: appState.shopItems,
    achievements: enrichedAchievements,
    feed,
    completions: appState.completions || [],
    userPets: appState.userPets || [],
    pets: appState.pets || [],
    userItems: appState.userItems || [],
    purchases: appState.purchases || [],
  });
});

stateRoutes.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});
