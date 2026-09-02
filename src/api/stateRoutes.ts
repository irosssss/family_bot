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
    // async-parallel (vercel-react-best-practices): независимые выборки —
    // один параллельный батч вместо водопада последовательных round-trip'ов.
    const [dbUsersRaw, dbItems, dbPets, dbBossesArr] = await Promise.all([
      db.select().from(usersTable),
      db.select().from(schema.items),
      db.select().from(schema.pets),
      db.select().from(schema.bosses),
    ]);

    // Стабильный порядок: родители (админы) первыми, затем дети по уровню —
    // сцена Дома и селектор профиля получают предсказуемый порядок
    const dbUsers = [...dbUsersRaw].sort((a: any, b: any) => {
      const pa = a.family_role === 'parent' ? 0 : 1;
      const pb = b.family_role === 'parent' ? 0 : 1;
      if (pa !== pb) return pa - pb;
      return (a.id ?? 0) - (b.id ?? 0);
    });

    if (dbUsers.length > 0) {
      appState.users = dbUsers.map(u => ({ ...u, class: u.class_type })) as any;
    }

    if (dbItems.length > 0) {
      appState.shopItems = dbItems.map((i: any) => ({
        id: i.id,
        // code из БД (колонка items.code), фолбэк — старый slug из названия
        code: i.code || i.name.toLowerCase().replace(/ /g, '_'),
        title: i.name,
        imageUrl: i.sprite_url,
        slot: i.type === 'hat' ? 'head' : (i.type === 'clothing' ? 'body' : i.type),
        cost: i.cost_coins,
        statsModifier: i.stats_modifier,
      })) as any;
    }

    if (dbPets.length > 0) {
       appState.pets = dbPets.map((p: any) => ({
         id: p.id,
         code: p.name.toLowerCase().replace(/ /g, '_'),
         title: p.name,
         imageUrl: p.sprite_sheet_url,
         cost: p.cost_coins
       })) as any;
    }

    if (dbBossesArr.length > 0) {
      const dbBoss = dbBossesArr[0];
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
          damage: 0,
          defeated: 0,
        }).where(eq(schema.bosses.id, dbBoss.id)).execute().catch((e) => console.error('Boss rotation DB error:', e));
        Object.assign(dbBoss, { week_key: currentWeekKey, name: `${weeklyBoss.name}`, sprite_url: weeklyBoss.spriteUrl, hp: newHp, max_hp: newHp, damage: 0, defeated: 0 });
        console.log(`New week boss: ${weeklyBoss.name} (${weeklyBoss.id})`);
      }
      // Фаза 6: урон/победа приходят из БД (persistBossState пишет их туда),
      // а не из дефолта памяти. damage=0 и defeated=0 — легитимные значения,
      // поэтому ||-фолбэки на память здесь были бы багом рестарта.
      appState.boss = {
        id: dbBoss.id,
        week_key: dbBoss.week_key || '',
        damage: dbBoss.damage ?? 0,
        defeated: dbBoss.defeated ?? 0,
        name: dbBoss.name,
        emoji: dbBoss.emoji,
        imageUrl: dbBoss.sprite_url || undefined,
        spriteSheetUrl: dbBoss.sprite_url || undefined,
        hp: dbBoss.hp,
        maxHp: dbBoss.max_hp
      };
    }

    // Habits + Фаза 6: обе группы — параллельно, изоляция сбоев сохранена
    const habitsHydrate = (async () => {
    try {
      const dbHabits = await db.select().from(schema.habits).orderBy(desc(schema.habits.id));
      if (dbHabits.length > 0) {
        appState.habits = dbHabits as any;
      }
    } catch (e) {
      console.error('Habits hydrate error:', e);
    }
    })();

    // Фаза 6: прогресс игрока — БД источник правды. Перезапуск сервера больше
    // не теряет завершения, perfect days, инвентарь, питомцев, покупки,
    // рефералки и ачивки. Каждая коллекция перенимается только когда БД
    // её отдаёт (иначе — демо-сида памяти, как до Фазы 6).
    const phase6Hydrate = (async () => {
    try {
      const [dbCompletions, dbPerfect, dbInv, dbUserPets, dbPurchases, dbRefs, dbUserAch] = await Promise.all([
        db.select().from(schema.completions),
        db.select().from(schema.perfect_days),
        db.select().from(schema.character_inventory),
        db.select().from(schema.character_pets),
        db.select().from(schema.purchases),
        db.select().from(schema.referrals),
        db.select().from(schema.user_achievements),
      ]);
      if (dbCompletions.length > 0) {
        appState.completions = dbCompletions.map((c) => ({
          id: c.id,
          user_id: c.user_id,
          task_id: c.task_id,
          completed_at: c.completed_at,
          completed_at_ts: c.completed_at_ts,
        }));
      }

      if (dbPerfect.length > 0) {
        appState.perfectDays = dbPerfect.map((p) => ({ user_id: p.user_id, day: p.day }));
      }

      if (dbInv.length > 0) {
        appState.userItems = dbInv.map((i) => ({
          user_id: i.character_id,
          item_id: i.item_id,
          equipped: i.is_equipped ? 1 : 0,
        }));
      }

      if (dbUserPets.length > 0) {
        appState.userPets = dbUserPets.map((p) => ({
          user_id: p.character_id,
          pet_id: p.pet_id,
          is_active: p.is_active ?? false,
          feed_points: p.feed_points,
        }));
      }

      if (dbPurchases.length > 0) {
        appState.purchases = dbPurchases.map((p) => ({
          id: p.id,
          user_id: p.user_id,
          reward_id: p.reward_id,
          reward_title: p.reward_title || '',
          created_at: p.created_at,
        }));
      }

      if (dbRefs.length > 0) {
        appState.referrals = dbRefs.map((r) => ({
          id: r.id,
          referrer_id: r.referrer_id,
          referee_id: r.referee_id,
          referee_name: r.referee_name,
          created_at: r.created_at,
          bonus_gold: r.bonus_gold,
          bonus_crystals: r.bonus_crystals,
        }));
      }

      if (dbUserAch.length > 0) {
        appState.userAchievements = dbUserAch.map((ua) => ({
          user_id: ua.user_id,
          achievement_id: ua.achievement_id,
        }));
      }
    } catch (e) {
      console.error('Phase6 progress hydrate error:', e);
    }
    })();

    await Promise.all([habitsHydrate, phase6Hydrate]);
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
