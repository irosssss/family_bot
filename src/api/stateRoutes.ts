/**
 * Роуты состояния приложения.
 * GET /api/state — главная агрегация (гидрация из БД + обогащение).
 * GET /api/db-test — диагностика подключения к БД.
 * GET /api/health — health check.
 */
import { Request, Response, Router } from 'express';
import { desc } from 'drizzle-orm';
import { db } from '../db';
import * as schema from '../db/schema';
import { users as usersTable } from '../db/schema';
import { appState } from '../services/stateService';
import { getTodayStr } from '../lib/dateUtils';
import type { FeedEntry, ShopItem, Task } from '../types';
import { toStateUser } from '../services/userStateHydration';
import { getFamilyGameState } from '../services/familyGameStateService';
import {
  canAccessUser,
  getAuthFamilyId,
  getUserFamilyId,
  isAuthEnforced,
  requireAdmin,
  type AuthedRequest,
} from '../utils/apiAuth';

export const stateRoutes = Router();

stateRoutes.get('/db-test', async (req: AuthedRequest, res: Response) => {
  try {
    if (!requireAdmin(req)) return res.status(403).json({ error: 'Admin access required' });
    const authFamilyId = getAuthFamilyId(req);
    const dbUsers = await db.select().from(usersTable);
    const dbTasks = await db.select().from(schema.tasks);
    const visibleUsers = isAuthEnforced()
      ? dbUsers.filter((user) => user.family_id === authFamilyId)
      : dbUsers;
    const visibleTasks = isAuthEnforced()
      ? dbTasks.filter((task) => task.family_id === authFamilyId)
      : dbTasks;
    res.json({ success: true, users: visibleUsers, taskCount: visibleTasks.length });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

stateRoutes.get('/', async (req: AuthedRequest, res: Response) => {
  try {
    // async-parallel (vercel-react-best-practices): независимые выборки —
    // один параллельный батч вместо водопада последовательных round-trip'ов.
    const [dbUsersRaw, dbTasks, dbItems, dbPets, dbRewards] = await Promise.all([
      db.select().from(usersTable),
      db.select().from(schema.tasks),
      db.select().from(schema.items),
      db.select().from(schema.pets),
      db.select().from(schema.rewards),
    ]);

    // Стабильный порядок: родители (админы) первыми, затем дети по уровню —
    // сцена Дома и селектор профиля получают предсказуемый порядок
    const dbUsers = [...dbUsersRaw].sort((a: any, b: any) => {
      const pa = a.family_role === 'parent' ? 0 : 1;
      const pb = b.family_role === 'parent' ? 0 : 1;
      if (pa !== pb) return pa - pb;
      return (a.id ?? 0) - (b.id ?? 0);
    });

    // Единый маппер со стартовой гидрацией. Не оставляем demo-пользователей,
    // если БД пока пуста.
    appState.users = dbUsers.map(toStateUser);

    appState.tasks = dbTasks.map((task): Task => ({
        id: task.id,
        family_id: task.family_id,
        code: task.code,
        title: task.title,
        description: task.description ?? undefined,
        points: task.points,
        assignee: task.assignee === 'misha' || task.assignee === 'regina' ? task.assignee : 'both',
        task_type: (task.task_type || 'todo') as Task['task_type'],
        day_of_week: task.day_of_week,
        done: task.done ?? false,
        category: task.category as Task['category'],
        assignee_type: (task.assignee_type || 'any') as Task['assignee_type'],
        age_min: task.age_min,
        age_max: task.age_max,
        schedule_type: (task.schedule_type || 'flexible') as Task['schedule_type'],
        is_required: task.is_required,
        is_repeatable: task.is_repeatable,
        max_daily: task.max_daily ?? undefined,
        icon: task.icon ?? undefined,
        recommendedClass: task.recommended_class ?? undefined,
        value: task.value ?? 0,
      }));

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

    appState.pets = dbPets.map((p: any) => ({
         id: p.id,
         code: p.code || p.name.toLowerCase().replace(/ /g, '_'),
         title: p.name,
         imageUrl: p.sprite_sheet_url,
         cost: p.cost_coins
       })) as any;

    appState.rewards = dbRewards.map((reward) => ({
        id: reward.id,
        family_id: reward.family_id,
        title: reward.title,
        cost: reward.cost,
        reward_type: reward.reward_type === 'joint' ? 'joint' : 'personal',
        active: reward.active ?? 1,
      }));

    // Habits + Фаза 6: обе группы — параллельно, изоляция сбоев сохранена
    const habitsHydrate = (async () => {
    try {
      const dbHabits = await db.select().from(schema.habits).orderBy(desc(schema.habits.id));
      appState.habits = dbHabits as any;
    } catch (e) {
      console.error('Habits hydrate error:', e);
      if (isAuthEnforced()) throw e;
    }
    })();

    // Фаза 6: прогресс игрока — БД источник правды. Перезапуск сервера больше
    // не теряет завершения, perfect days, инвентарь, питомцев, покупки,
    // рефералки и ачивки. Каждая коллекция перенимается только когда БД
    // её отдаёт, включая пустые массивы: старые demo-записи не должны
    // просачиваться в семью после рестарта production-процесса.
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
      appState.completions = dbCompletions.map((c) => ({
          id: c.id,
          user_id: c.user_id,
          task_id: c.task_id,
          completed_at: c.completed_at,
          completed_at_ts: c.completed_at_ts,
        }));

      appState.perfectDays = dbPerfect.map((p) => ({ user_id: p.user_id, day: p.day }));

      appState.userItems = dbInv.map((i) => ({
          user_id: i.character_id,
          item_id: i.item_id,
          equipped: i.is_equipped ? 1 : 0,
        }));

      appState.userPets = dbUserPets.map((p) => ({
          user_id: p.character_id,
          pet_id: p.pet_id,
          is_active: p.is_active ?? false,
          feed_points: p.feed_points,
        }));

      appState.purchases = dbPurchases.map((p) => ({
          id: p.id,
          user_id: p.user_id,
          reward_id: p.reward_id,
          reward_title: p.reward_title || '',
          created_at: p.created_at,
        }));

      appState.referrals = dbRefs.map((r) => ({
          id: r.id,
          referrer_id: r.referrer_id,
          referee_id: r.referee_id,
          referee_name: r.referee_name,
          created_at: r.created_at,
          bonus_gold: r.bonus_gold,
          bonus_crystals: r.bonus_crystals,
        }));

      appState.userAchievements = dbUserAch.map((ua) => ({
          user_id: ua.user_id,
          achievement_id: ua.achievement_id,
        }));
    } catch (e) {
      console.error('Phase6 progress hydrate error:', e);
      if (isAuthEnforced()) throw e;
    }
    })();

    await Promise.all([habitsHydrate, phase6Hydrate]);
  } catch (e) {
    console.error('Error fetching data from DB:', e);
    if (isAuthEnforced()) {
      return res.status(503).json({ error: 'Состояние временно недоступно' });
    }
  }

  const authFamilyId = getAuthFamilyId(req);
  if (isAuthEnforced() && authFamilyId === null) {
    return res.status(403).json({ error: 'Forbidden: user has no family' });
  }

  const requestedUserId = req.query.userId
    ? Number(req.query.userId)
    : (isAuthEnforced() ? req.auth?.userId ?? null : null);
  if (requestedUserId && !canAccessUser(req, requestedUserId)) {
    return res.status(403).json({ error: 'Forbidden: not your family' });
  }
  const requestedUser = requestedUserId
    ? appState.users.find((user) => user.id === requestedUserId)
    : undefined;
  const responseFamilyId = authFamilyId ?? getUserFamilyId(requestedUser) ?? appState.family?.id ?? null;
  const familyGameState = getFamilyGameState(responseFamilyId);

  const familyUsers = responseFamilyId !== null
    ? appState.users.filter((user) => getUserFamilyId(user) === responseFamilyId)
    : appState.users;
  const familyUserIds = new Set(familyUsers.map((user) => user.id));
  const familyTasks = responseFamilyId !== null
    ? appState.tasks.filter((task) => task.family_id === responseFamilyId)
    : appState.tasks;
  const familyTaskIds = new Set(familyTasks.map((task) => task.id));
  const familyRewards = responseFamilyId !== null
    ? appState.rewards.filter((reward) => reward.family_id == null || reward.family_id === responseFamilyId)
    : appState.rewards;
  const familyCompletions = appState.completions.filter(
    (completion) => familyUserIds.has(completion.user_id) && familyTaskIds.has(completion.task_id),
  );

  // Enrich users with equipped items and pets list
  const enrichedUsers = familyUsers.map((u) => {
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
  const enrichedTasks = familyTasks.map((t) => {
    const isDone = familyCompletions.some(
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
  const feed: FeedEntry[] = familyCompletions
    .slice(-20)
    .reverse()
    .map((c) => {
      const user = familyUsers.find((u) => u.id === c.user_id);
      const task = familyTasks.find((t) => t.id === c.task_id);
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
    boss: familyGameState?.boss ?? appState.boss,
    challenge: familyGameState?.challenge ?? appState.challenge,
    family: familyGameState?.family ?? null,
    rewards: familyRewards,
    shopItems: appState.shopItems,
    achievements: enrichedAchievements,
    feed,
    completions: familyCompletions,
    userPets: appState.userPets.filter((pet) => familyUserIds.has(pet.user_id)),
    pets: appState.pets || [],
    userItems: appState.userItems.filter((item) => familyUserIds.has(item.user_id)),
    purchases: appState.purchases.filter((purchase) => familyUserIds.has(purchase.user_id)),
  });
});

stateRoutes.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});
