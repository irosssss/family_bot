import express, { Request, Response, NextFunction } from 'express';
import { integrationsRouter } from './src/api/integrations';
import multer from 'multer';
import fs from 'fs';
import cors from 'cors';
import { telegramAuthMiddleware } from './src/utils/telegramAuth';
import { initializeDatabase } from './setup_db';
import { telegramWebhookHandler, notifyParentAboutTaskCompletion , setSocketIO, onTaskApprove, onTaskCreate, notifyTaskCreated } from './src/bot/telegramBot';
import path from 'path';
import * as Sentry from '@sentry/node';
import { createServer as createHttpServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { db } from './src/db/index';
import * as schema from './src/db/schema';
import { eq } from 'drizzle-orm';
import { users as usersTable } from './src/db/schema';
import { getWeekKey, getTodayStr, getNowTimestamp } from './src/lib/dateUtils';
import { createServer as createViteServer } from 'vite';

// Initialize Sentry Node SDK if DSN is provided
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || 'production',
    tracesSampleRate: 1.0,
  });
  console.log('⚡ Server Sentry initialized successfully');
}

import {
  BOSS_LIST,
  INITIAL_ACHIEVEMENTS,
  INITIAL_CHALLENGES,
  INITIAL_PETS,
  INITIAL_REWARDS,
  INITIAL_SHOP_ITEMS,
  INITIAL_TASKS,
  INITIAL_USERS,
} from './src/data/initialData';
import { AppState, Boss, Challenge, Completion, FeedEntry, Pet, Reward, ShopItem, Task, User } from './src/types';

const PORT = 3000;

// In-Memory Telegram Push Config

async function sendTelegramPushNotification(htmlText: string) {
  const token = process.env.BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    console.log('[Telegram Push skipped]: Token or Chat ID not configured');
    return;
  }

  try {
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: htmlText,
        parse_mode: 'HTML',
      }),
    });
    const data = await res.json();
    if (!data.ok) {
      console.warn('[Telegram Push Error]:', data);
    } else {
      console.log('⚡ [Telegram Push Sent]:', htmlText);
    }
  } catch (err) {
    console.error('[Telegram Push Exception]:', err);
  }
}

// In-Memory State
const appState: AppState = {
  users: JSON.parse(JSON.stringify(INITIAL_USERS)),
  tasks: JSON.parse(JSON.stringify(INITIAL_TASKS)),
  completions: [
    {
      id: 1,
      user_id: 1,
      task_id: 1,
      completed_at: getTodayStr(),
      completed_at_ts: getNowTimestamp(),
    },
    {
      id: 2,
      user_id: 2,
      task_id: 5,
      completed_at: getTodayStr(),
      completed_at_ts: getNowTimestamp(),
    },
  ],
  rewards: JSON.parse(JSON.stringify(INITIAL_REWARDS)),
  purchases: [
    {
      id: 1,
      user_id: 1,
      reward_id: 1,
      reward_title: '🎬 Выбрать фильм на вечер',
      created_at: getTodayStr(),
      user_name: 'Миша',
    },
  ],
  shopItems: JSON.parse(JSON.stringify(INITIAL_SHOP_ITEMS)),
  userItems: [
    { user_id: 1, item_id: 7, equipped: 1 }, // Cap
    { user_id: 1, item_id: 1, equipped: 1 }, // Sword
    { user_id: 1, item_id: 14, equipped: 1 }, // Castle background
    { user_id: 2, item_id: 9, equipped: 1 }, // Crown
    { user_id: 2, item_id: 2, equipped: 1 }, // Staff
    { user_id: 2, item_id: 13, equipped: 1 }, // Forest background
  ],
  pets: JSON.parse(JSON.stringify(INITIAL_PETS)),
  userPets: [
    { user_id: 1, pet_id: 1 },
    { user_id: 1, pet_id: 2 },
    { user_id: 2, pet_id: 4 },
    { user_id: 2, pet_id: 8 },
  ],
  achievements: JSON.parse(JSON.stringify(INITIAL_ACHIEVEMENTS)),
  userAchievements: [
    { user_id: 1, achievement_id: 1 },
    { user_id: 2, achievement_id: 1 },
  ],
  boss: {
    id: 1,
    week_key: getWeekKey(),
    name: BOSS_LIST[0].name,
    emoji: BOSS_LIST[0].emoji,
    hp: 90,
    maxHp: 100,
    damage: 34,
    defeated: 0,
  },
  challenge: {
    code: INITIAL_CHALLENGES[0].code,
    title: INITIAL_CHALLENGES[0].title,
    description: INITIAL_CHALLENGES[0].description,
    target: INITIAL_CHALLENGES[0].target,
    bonus: INITIAL_CHALLENGES[0].bonus,
    progress: 7,
    completed: false,
  },
  perfectDays: [
    { user_id: 1, day: '2026-08-05' },
    { user_id: 2, day: '2026-08-06' },
  ],
  referrals: [
    {
      id: 1,
      referrer_id: 1,
      referee_id: 2,
      referee_name: 'Регина',
      created_at: getTodayStr(),
      bonus_gold: 100,
      bonus_crystals: 25,
    },
  ],
};

function processReferral(refereeUser: User, rawRefCode: string) {
  if (!rawRefCode || !refereeUser) {
    return { success: false, message: 'Укажите верный реферальный код' };
  }

  let cleanCode = rawRefCode.trim().toLowerCase();
  if (cleanCode.startsWith('/start ')) {
    cleanCode = cleanCode.replace('/start ', '').trim();
  }
  if (cleanCode.startsWith('ref_')) {
    cleanCode = cleanCode.replace('ref_', '');
  }

  const referrerUser = appState.users.find(
    (u) =>
      u.id === Number(cleanCode) ||
      (u.referral_code && u.referral_code.toLowerCase().replace('ref_', '') === cleanCode) ||
      u.display_name.trim().toLowerCase() === cleanCode
  );

  if (!referrerUser) {
    return { success: false, message: 'Реферальный код не найден' };
  }

  if (referrerUser.id === refereeUser.id) {
    return { success: false, message: 'Вы не можете использовать собственный реферальный код' };
  }

  if (refereeUser.referred_by) {
    return { success: false, message: 'Вы уже активировали реферальный код ранее' };
  }

  if (!appState.referrals) {
    appState.referrals = [];
  }

  const alreadyRecorded = appState.referrals.some(
    (r) => r.referrer_id === referrerUser.id && r.referee_id === refereeUser.id
  );
  if (alreadyRecorded) {
    return { success: false, message: 'Реферальный бонус уже был начислен' };
  }

  const REFERRER_GOLD = 100;
  const REFERRER_CRYSTALS = 25;
  const REFEREE_GOLD = 50;
  const REFEREE_CRYSTALS = 15;

  refereeUser.referred_by = referrerUser.id;
  refereeUser.gold += REFEREE_GOLD;
  refereeUser.crystals = (refereeUser.crystals || 0) + REFEREE_CRYSTALS;

  referrerUser.gold += REFERRER_GOLD;
  referrerUser.crystals = (referrerUser.crystals || 0) + REFERRER_CRYSTALS;
  referrerUser.referrals_count = (referrerUser.referrals_count || 0) + 1;
  referrerUser.referral_earnings_gold = (referrerUser.referral_earnings_gold || 0) + REFERRER_GOLD;
  referrerUser.referral_earnings_crystals = (referrerUser.referral_earnings_crystals || 0) + REFERRER_CRYSTALS;

  const record = {
    id: appState.referrals.length + 1,
    referrer_id: referrerUser.id,
    referee_id: refereeUser.id,
    referee_name: refereeUser.display_name,
    created_at: getTodayStr(),
    bonus_gold: REFERRER_GOLD,
    bonus_crystals: REFERRER_CRYSTALS,
  };
  appState.referrals.push(record);

  return {
    success: true,
    message: `🎉 Реферальный код активирован! Герой ${referrerUser.display_name} получил +${REFERRER_GOLD}💰 и +${REFERRER_CRYSTALS}💎. Вам начислено +${REFEREE_GOLD}💰 и +${REFEREE_CRYSTALS}💎!`,
    referrer: referrerUser,
    referee: refereeUser,
  };
}

function checkAchievements(userId: number) {
  const user = appState.users.find((u) => u.id === userId);
  if (!user) return [];

  const userCompletions = appState.completions.filter((c) => c.user_id === userId);
  const userPurchases = appState.purchases.filter((p) => p.user_id === userId);
  const userPetCount = appState.userPets.filter((p) => p.user_id === userId).length;
  const bossesDefeated = appState.boss.defeated ? 1 : 0;
  const level = Math.floor(user.xp / 100) + 1;

  const conditions: Record<string, boolean> = {
    first_task: userCompletions.length >= 1,
    tasks_10: userCompletions.length >= 10,
    tasks_50: userCompletions.length >= 50,
    streak_3: user.streak >= 3,
    streak_7: user.streak >= 7,
    level_3: level >= 3,
    level_5: level >= 5,
    first_buy: userPurchases.length >= 1,
    boss_1: bossesDefeated >= 1,
    pet_1: userPetCount >= 1,
  };

  const newUnlocked: any[] = [];

  for (const ach of appState.achievements) {
    const already = appState.userAchievements.some(
      (ua) => ua.user_id === userId && ua.achievement_id === ach.id
    );
    if (conditions[ach.code] && !already) {
      appState.userAchievements.push({ user_id: userId, achievement_id: ach.id });
      user.gold += ach.bonus;
      newUnlocked.push(ach);
    }
  }

  return newUnlocked;
}

function checkChallenge(userId: number) {
  const user = appState.users.find((u) => u.id === userId);
  if (!user) return null;

  const currentChallenge = appState.challenge;
  if (currentChallenge.completed) return null;

  const todayStr = getTodayStr();
  const thisWeekCompletions = appState.completions.filter((c) => c.user_id === userId);
  const perfectDaysCount = appState.perfectDays.filter((p) => p.user_id === userId).length;
  const teamTasksDone = appState.completions.filter((c) => {
    const task = appState.tasks.find((t) => t.id === c.task_id);
    return task?.assignee === 'both';
  }).length;

  let progress = 0;
  if (currentChallenge.code === 'summer_dragon_15') {
    progress = teamTasksDone;
  } else if (currentChallenge.code === 'marathon_12') {
    progress = thisWeekCompletions.length;
  } else if (currentChallenge.code === 'perfect_2') {
    progress = perfectDaysCount;
  } else if (currentChallenge.code === 'team_3') {
    progress = teamTasksDone;
  }

  currentChallenge.progress = progress;

  if (progress >= currentChallenge.target) {
    currentChallenge.completed = true;
    user.gold += currentChallenge.bonus;

    // Grant special Gold Dragon Pet if dragon challenge!
    if (currentChallenge.code === 'summer_dragon_15') {
      const dragonPet = appState.pets.find((p) => p.code === 'gold_dragon');
      if (dragonPet) {
        for (const u of appState.users) {
          const already = appState.userPets.some((up) => up.user_id === u.id && up.pet_id === dragonPet.id);
          if (!already) {
            appState.userPets.push({ user_id: u.id, pet_id: dragonPet.id });
          }
        }
      }
    }

    sendTelegramPushNotification(
      `🏆 <b>СЕМЕЙНЫЙ ЧЕЛЛЕНДЖ ВЫПОЛНЕН!</b> 🎉\nСемейный квест <b>"${currentChallenge.title}"</b> полностью завершен! Герой <b>${user.display_name}</b> принес в семейную казну +${currentChallenge.bonus}💰!`
    );

    return { title: currentChallenge.title, bonus: currentChallenge.bonus };
  }

  return null;
}

function renderToday(user: User) {
  const todayStr = getTodayStr();
  const currentWeekday = new Date().getDay() === 0 ? 6 : new Date().getDay() - 1;
  const tasks = appState.tasks.filter(
    (t) =>
      (t.assignee === user.assignee || t.assignee === 'both') &&
      (t.task_type === 'daily' || (t.task_type === 'weekly' && t.day_of_week === currentWeekday))
  );

  const doneCount = tasks.filter((t) =>
    appState.completions.some(
      (c) => c.task_id === t.id && c.user_id === user.id && c.completed_at === todayStr
    )
  ).length;

  let text = `📋 <b>Задачи на сегодня</b> для <b>${user.display_name}</b>\nВыполнено: ${doneCount}/${tasks.length}\n\n`;
  tasks.forEach((t) => {
    const isDone = appState.completions.some(
      (c) => c.task_id === t.id && c.user_id === user.id && c.completed_at === todayStr
    );
    text += `${isDone ? '✅' : '☐'} ${t.title} — <b>${t.points}💰</b>\n`;
  });

  const keyboard = tasks.map((t) => [
    {
      text: `${t.title} (${t.points}💰)`,
      action: `/complete_${t.id}`,
    },
  ]);

  return { text, keyboard };
}

function applyTaskCompletion(user: User, task: Task) {
  const todayStr = getTodayStr();
  const existing = appState.completions.find(
    (c) => c.user_id === user.id && c.task_id === task.id && c.completed_at === todayStr
  );

  if (existing) {
    return { error: 'Task already completed today' };
  }

  const firstToday = !appState.completions.some(
    (c) => c.user_id === user.id && c.completed_at === todayStr
  );

  const completion: Completion = {
    id: Date.now(),
    user_id: user.id,
    task_id: task.id,
    completed_at: todayStr,
    completed_at_ts: getNowTimestamp(),
  };
  appState.completions.push(completion);

  // Streaks
  if (firstToday) {
    user.streak += 1;
  }

  // Class Bonuses
  const goldGain = task.points + (user.class === 'warrior' && task.points >= 4 ? 1 : 0);
  const xpGain = user.class === 'mage' ? Math.round(task.points * 1.2 * 10) : task.points * 10;

  const oldLevel = Math.floor(user.xp / 100) + 1;
  user.xp += xpGain;
  user.gold += goldGain;
  const newLevel = Math.floor(user.xp / 100) + 1;
  const levelUp = newLevel > oldLevel;

  // Boss Damage
  let bossDefeated = null;
  if (!appState.boss.defeated) {
    appState.boss.damage += task.points;
    if (appState.boss.damage >= appState.boss.hp) {
      appState.boss.defeated = 1;
      // Award +20 gold to both players!
      for (const u of appState.users) {
        u.gold += 20;
      }
      bossDefeated = { ...appState.boss };
    }
  }

  // Check Perfect Day: all scheduled tasks for user done today
  const currentWeekday = new Date().getDay() === 0 ? 6 : new Date().getDay() - 1;
  const userScheduledTasks = appState.tasks.filter(
    (t) =>
      (t.assignee === user.assignee || t.assignee === 'both') &&
      (t.task_type === 'daily' || (t.task_type === 'weekly' && t.day_of_week === currentWeekday))
  );

  const userCompletedIds = appState.completions
    .filter((c) => c.user_id === user.id && c.completed_at === todayStr)
    .map((c) => c.task_id);

  let perfect = false;
  if (
    userScheduledTasks.length > 0 &&
    userScheduledTasks.every((t) => userCompletedIds.includes(t.id))
  ) {
    const alreadyPerfect = appState.perfectDays.some(
      (p) => p.user_id === user.id && p.day === todayStr
    );
    if (!alreadyPerfect) {
      appState.perfectDays.push({ user_id: user.id, day: todayStr });
      user.gold += 5;
      perfect = true;
    }
  }

  // Regenerate +5 MP and +2 HP per task completion
  user.mp = Math.min(user.max_mp || 50, (user.mp || 30) + 5);
  user.hp = Math.min(user.max_hp || 50, (user.hp || 50) + 2);

  // 25% Chance Pet Drop
  let foundPet: Pet | null = null;
  if (Math.random() < 0.25) {
    const ownedPetIds = appState.userPets
      .filter((up) => up.user_id === user.id)
      .map((up) => up.pet_id);
    const unownedPets = appState.pets.filter((p) => !ownedPetIds.includes(p.id));
    if (unownedPets.length > 0) {
      foundPet = unownedPets[Math.floor(Math.random() * unownedPets.length)];
      appState.userPets.push({ user_id: user.id, pet_id: foundPet.id });
    }
  }

  // Check Achievements & Challenges
  const newAchievements = checkAchievements(user.id);
  const challengeResult = checkChallenge(user.id);

  // Send Telegram Push Notification
  sendTelegramPushNotification(
    `✅ <b>${user.display_name}</b> выполнил(а) задачу <b>"${task.title}"</b> (+${goldGain}💰, +${xpGain}⭐)!`
  );

  if (bossDefeated) {
    sendTelegramPushNotification(
      `🎉 <b>СЕМЕЙНЫЙ БОСС ПОВЕРЖЕН!</b> 👾\nГерои ${appState.users.map((u) => u.display_name).join(' и ')} разгромили босса <b>${bossDefeated.emoji} ${bossDefeated.name}</b>! Вся семья получает по +20💰!`
    );
  }

  return {
    goldGain,
    xpGain,
    levelUp,
    newLevel,
    perfect,
    pet: foundPet,
    bossDefeated,
    achievements: newAchievements,
    challengeCompleted: challengeResult,
  };
}

function applySkill(user: User) {
  const todayStr = getTodayStr();
  if (user.skill_date === todayStr) {
    return { error: 'Скилл уже использован сегодня! ⏳' };
  }

  let manaCost = 10;
  if (user.class === 'mage') manaCost = 15;
  if (user.class === 'rogue') manaCost = 12;
  if (user.class === 'healer') manaCost = 15;

  if ((user.mp ?? 30) < manaCost) {
    return { error: `Недостаточно маны MP (требуется ${manaCost} MP)! Выполняйте задачи для восстановления` };
  }

  user.mp = (user.mp ?? 30) - manaCost;
  user.skill_date = todayStr;
  let message = '';
  let bossDefeated = null;

  if (user.class === 'warrior') {
    if (!appState.boss.defeated) {
      appState.boss.damage += 15;
      if (appState.boss.damage >= appState.boss.hp) {
        appState.boss.defeated = 1;
        for (const u of appState.users) {
          u.gold += 20;
        }
        bossDefeated = { ...appState.boss };
        message = `⚔️ Мощный удар Воина! Нанесено 15 урона (-10 MP). БОСС ${appState.boss.emoji} ПОВЕРЖЕН! 🎉 Вся семья получила +20💰!`;
      } else {
        message = `⚔️ Мощный удар Воина! Босс получил 15 урона (${appState.boss.damage}/${appState.boss.hp} HP) [-10 MP].`;
      }
    } else {
      message = '⚔️ Босс уже повержен на этой неделе! Вы нанесли красивый рассекающий удар!';
    }
  } else if (user.class === 'mage') {
    user.xp += 25;
    message = '🔮 Взрыв магии! Персонаж получил +25 ⭐ опыта за -15 MP.';
  } else if (user.class === 'rogue') {
    user.gold += 15;
    message = '🗡️ Карманная кража Разбойника! Добыто +15 💰 золота за -12 MP.';
  } else if (user.class === 'healer') {
    for (const u of appState.users) {
      u.hp = Math.min(u.max_hp || 50, (u.hp || 50) + 20);
    }
    message = '💚 Исцеляющий свет Целителя! Вся семья восстановила +20 HP за -15 MP.';
  } else {
    user.gold += 5;
    message = '⚡ Базовое заклинание применено: +5 💰';
  }

  return { message, bossDefeated };
}

async function startServer() {
  const app = express();
  const httpServer = createHttpServer(app);
  const io = new SocketIOServer(httpServer, { cors: { origin: '*' } });
  app.set('io', io);
  setSocketIO(io);
  onTaskCreate((title, points, chatId) => {
    const newTask = {
      id: Date.now(),
      code: `custom_${Date.now()}`,
      title: title,
      points: points,
      assignee: 'both' as const,
      task_type: 'todo' as const,
      day_of_week: null,
    };
    appState.tasks.push(newTask);
    notifyTaskCreated(chatId, title, points);
    
    // Update DB (async)
    db.insert(schema.tasks).values({
      family_id: 1, // default for now
      code: newTask.code,
      title: newTask.title,
      points: newTask.points,
      assignee: newTask.assignee,
      task_type: newTask.task_type,
      day_of_week: newTask.day_of_week,
      done: false
    }).execute().catch(e => console.error('DB Insert error:', e));
    
    // Broadcast via socket
    const io = app.get('io');
    if (io) io.emit('stateUpdate');
  });

  onTaskApprove((taskId) => {
    // Parent approved via Telegram Bot
    const task = appState.tasks.find(t => t.id === taskId);
    if (!task) return;
    const user = appState.users.find(u => u.assignee === task.assignee || task.assignee === 'both');
    if (user && task) {
       applyTaskCompletion(user, task);
       const io = app.get('io');
       if (io) io.emit('stateUpdate');
    }
  });

  io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);
  });
  app.use(cors());
  app.use(express.json());
  app.use('/api/integrations', integrationsRouter);

  // Initialize PostgreSQL Database Schema
  initializeDatabase();

  // Configure multer for file uploads
  const upload = multer({ dest: path.join(process.cwd(), 'raw_archives') });

  // Upload zip files endpoint
  app.post('/api/upload-zips', upload.array('files'), (req: Request, res: Response) => {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    // Rename uploaded files to keep .zip extension
    const uploadedFiles = req.files as Express.Multer.File[];
    uploadedFiles.forEach(file => {
      const newPath = path.join(process.cwd(), 'raw_archives', file.originalname);
      fs.renameSync(file.path, newPath);
      console.log(`✅ Saved uploaded file: ${file.originalname}`);
    });

    // Automatically unpack assets
    import('child_process').then(({ exec }) => {
      exec('npx tsx scripts/unpack-local.ts', (error, stdout, stderr) => {
        if (error) {
          console.error(`Error unpacking: ${error.message}`);
          return;
        }
        if (stderr) {
          console.error(`Unpack stderr: ${stderr}`);
          return;
        }
        console.log(`Unpack output: ${stdout}`);
      });
    });

    res.json({ success: true, message: 'Files uploaded and unpacking started!' });
  });

  // Secure endpoint using Telegram WebApp initData validation
  app.post('/api/auth/verify', telegramAuthMiddleware, (req: any, res: Response) => {
    res.json({ success: true, user: req.telegramUser, message: 'Успешная авторизация WebApp' });
  });

  // Telegram Bot Webhook Endpoint
  app.post('/api/webhook/telegram', telegramWebhookHandler);

  // GET State
  app.get('/api/db-test', async (req, res) => {
    try {
      const dbUsers = await db.select().from(usersTable);
      const dbTasks = await db.select().from(schema.tasks);
      res.json({ success: true, users: dbUsers });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/state', async (req: Request, res: Response) => {
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
        appState.boss = {
          id: dbBoss.id,
          week_key: dbBoss.week_key || '',
          damage: 10,
          defeated: 0,
          name: dbBoss.name,
          emoji: dbBoss.emoji,
          imageUrl: dbBoss.sprite_url || undefined,
          hp: dbBoss.hp,
          maxHp: dbBoss.max_hp
        };
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

      return {
        ...u,
        equipped,
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

  // Complete Task
  app.post('/api/tasks/complete', (req: Request, res: Response) => {
    const { userId, taskId } = req.body;
    const user = appState.users.find((u) => u.id === Number(userId));
    const task = appState.tasks.find((t) => t.id === Number(taskId));

    if (!user || !task) {
      return res.status(404).json({ error: 'User or task not found' });
    }

    // Check task ownership: User can only complete their own or joint ('both') tasks
    const isAssignedToUser = task.assignee === user.assignee || task.assignee === 'both';
    if (!isAssignedToUser) {
      const assigneeName = task.assignee === 'misha' ? 'Миша' : task.assignee === 'regina' ? 'Регина' : 'Общая';
      return res
        .status(403)
        .json({ error: `Эта задача назначена на (${assigneeName}). Только исполнитель может её выполнить и подтвердить!` });
    }

    const result = applyTaskCompletion(user, task);
    // Update DB (async, non-blocking for now)
    
    const dbUsers = schema.users;
    db.update(dbUsers).set({
      gold: user.gold,
      xp: user.xp,
      hp: user.hp,
      mp: user.mp,
      streak: user.streak,
      skill_date: user.skill_date,
    }).where(eq(dbUsers.id, user.id)).execute().catch(e => console.error('DB Update error:', e));
    if (result.error) {
      return res.status(400).json({ error: result.error });
    }


    // Simulate sending Telegram notification to parent for approval
    // In real app, we use actual Telegram IDs. Here we pass a mock parentId.
    const parentTelegramId = 123456789;
    notifyParentAboutTaskCompletion(parentTelegramId, task.id, task.title, user.display_name).catch(console.error);
    res.json({
      success: true,
      points: task.points,
      title: task.title,
      gold_gain: result.goldGain,
      xp_gain: result.xpGain,
      level_up: result.levelUp,
      new_level: result.newLevel,
      perfect: result.perfect,
      pet: result.pet,
      bossDefeated: result.bossDefeated,
      achievements: result.achievements,
      challengeCompleted: result.challengeCompleted,
    });
  });

  // Toggle/Undo Task Completion
  app.post('/api/tasks/toggle', (req: Request, res: Response) => {
    const { userId, taskId } = req.body;
    const user = appState.users.find((u) => u.id === Number(userId));
    const task = appState.tasks.find((t) => t.id === Number(taskId));

    if (task && user && task.assignee !== user.assignee && task.assignee !== 'both') {
      return res.status(403).json({ error: 'Вы можете отменять отметку только своих задач!' });
    }

    const todayStr = getTodayStr();
    const idx = appState.completions.findIndex(
      (c) => c.user_id === Number(userId) && c.task_id === Number(taskId) && c.completed_at === todayStr
    );

    if (idx !== -1) {
      appState.completions.splice(idx, 1);
      if (user && task) {
        const goldLoss = task.points + (user.class === 'warrior' && task.points >= 4 ? 1 : 0);
        const xpLoss = user.class === 'mage' ? Math.round(task.points * 1.2 * 10) : task.points * 10;
        user.gold = Math.max(0, (user.gold || 0) - goldLoss);
        user.xp = Math.max(0, (user.xp || 0) - xpLoss);
        if (!appState.boss.defeated) {
          appState.boss.damage = Math.max(0, appState.boss.damage - task.points);
        }
      }
      const io = req.app.get('io');
      if (io) io.emit('stateUpdate');
      return res.json({ success: true, action: 'uncompleted' });
    }

    res.status(404).json({ error: 'Completion not found' });
  });

  // Add Task
  app.post('/api/tasks/add', (req: Request, res: Response) => {
    const { title, points, assignee, task_type } = req.body;
    if (!title || !points) {
      return res.status(400).json({ error: 'Title and points required' });
    }

    const newTask: Task = {
      id: Date.now(),
      code: `custom_${Date.now()}`,
      title: String(title).trim(),
      points: Math.max(1, Math.min(10, Number(points))),
      assignee: (assignee as any) || 'both',
      task_type: (task_type as any) || 'todo',
      day_of_week: null,
    };

    appState.tasks.push(newTask);
    res.json({ success: true, task: newTask });
  });

  // Use Daily Habitica RPG Skill
  app.post('/api/skills/use', (req: Request, res: Response) => {
    const { userId } = req.body;
    const user = appState.users.find((u) => u.id === Number(userId));

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const result = applySkill(user);
    // Update DB (async)
    
    const dbUsers = schema.users;
    db.update(dbUsers).set({
      gold: user.gold,
      xp: user.xp,
      hp: user.hp,
      mp: user.mp,
      skill_date: user.skill_date,
    }).where(eq(dbUsers.id, user.id)).execute().catch(e => console.error('DB Update error:', e));
    // If healer was used, all users are updated in appState, but we only persist this user for now unless we do a loop
    for (const u of appState.users) {
      db.update(dbUsers).set({ hp: u.hp, gold: u.gold }).where(eq(dbUsers.id, u.id)).execute().catch(e => console.error('DB Update error:', e));
    }
    if (result.error) {
      return res.status(400).json({ error: result.error });
    }

    sendTelegramPushNotification(
      `⚡ <b>${user.display_name}</b> применил(а) магию: ${result.message}`
    );

    const io = req.app.get('io');
    if (io) io.emit('stateUpdate');
    res.json({
      success: true,
      message: result.message,
      bossDefeated: result.bossDefeated,
      user,
    });
  });

  // Telegram Push Config API



  // Switch/Set Class
  app.post('/api/users/class', (req: Request, res: Response) => {
    const { userId, className } = req.body;
    const user = appState.users.find((u) => u.id === Number(userId));
    if (!user) return res.status(404).json({ error: 'User not found' });

    user.class = className;
    // Update DB (async)
    db.update(schema.users).set({
      class_type: user.class,
      gender: user.gender,
      custom_avatar_url: user.custom_avatar_url,
      character_color: user.character_color,
      skin_tone: user.skin_tone,
      hair_style: user.hair_style,
      hair_color: user.hair_color,
      eye_color: user.eye_color,
    }).where(eq(schema.users.id, user.id)).execute().catch(e => console.error('DB Update error:', e));

    res.json({ success: true, user });
  });

  // Switch/Set Gender
  app.post('/api/users/gender', (req: Request, res: Response) => {
    const { userId, gender } = req.body;
    const user = appState.users.find((u) => u.id === Number(userId));
    if (!user) return res.status(404).json({ error: 'User not found' });

    user.gender = gender === 'female' ? 'female' : 'male';
    // Update DB (async)
    db.update(schema.users).set({
      class_type: user.class,
      gender: user.gender,
      custom_avatar_url: user.custom_avatar_url,
      character_color: user.character_color,
      skin_tone: user.skin_tone,
      hair_style: user.hair_style,
      hair_color: user.hair_color,
      eye_color: user.eye_color,
    }).where(eq(schema.users.id, user.id)).execute().catch(e => console.error('DB Update error:', e));

    res.json({ success: true, user });
  });

  // Update Character Customizations (Skin Tone, Hair Style, Hair Color, Eye Color, Aura, Custom Avatar)
  app.post('/api/users/update-character', (req: Request, res: Response) => {
    const { userId, gender, character_color, skin_tone, hair_style, hair_color, eye_color, custom_avatar_url } = req.body;
    const user = appState.users.find((u) => u.id === Number(userId));
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (gender) user.gender = gender;
    if (character_color) user.character_color = character_color;
    if (skin_tone) user.skin_tone = skin_tone;
    if (hair_style) user.hair_style = hair_style;
    if (hair_color) user.hair_color = hair_color;
    if (eye_color) user.eye_color = eye_color;
    if (custom_avatar_url !== undefined) user.custom_avatar_url = custom_avatar_url;
    // Update DB (async)
    db.update(schema.users).set({
      class_type: user.class,
      gender: user.gender,
      custom_avatar_url: user.custom_avatar_url,
      character_color: user.character_color,
      skin_tone: user.skin_tone,
      hair_style: user.hair_style,
      hair_color: user.hair_color,
      eye_color: user.eye_color,
    }).where(eq(schema.users.id, user.id)).execute().catch(e => console.error('DB Update error:', e));


    res.json({ success: true, user });
  });

  // Buy Reward
  app.post('/api/rewards/buy', (req: Request, res: Response) => {
    const { userId, rewardId } = req.body;
    const user = appState.users.find((u) => u.id === Number(userId));
    const reward = appState.rewards.find((r) => r.id === Number(rewardId));

    if (!user || !reward) return res.status(404).json({ error: 'Not found' });
    if (user.gold < reward.cost) return res.status(400).json({ error: 'Недостаточно золота' });

    user.gold -= reward.cost;
    const purchase = {
      id: Date.now(),
      user_id: user.id,
      reward_id: reward.id,
      reward_title: reward.title,
      created_at: getTodayStr(),
      user_name: user.display_name,
    };
    appState.purchases.push(purchase);

    checkAchievements(user.id);

    sendTelegramPushNotification(
      `🛍 <b>${user.display_name}</b> купил(а) награду <b>"${reward.title}"</b> в Лавке Наград! (-${reward.cost}💰)`
    );

    res.json({ success: true, purchase, gold: user.gold });
  });

  // Add Custom Reward
  app.post('/api/rewards/add', (req: Request, res: Response) => {
    const { title, cost, reward_type } = req.body;
    if (!title || !cost) return res.status(400).json({ error: 'Title and cost required' });

    const newReward: Reward = {
      id: Date.now(),
      title: String(title).trim(),
      cost: Math.max(1, Number(cost)),
      reward_type: (reward_type as any) || 'personal',
      active: 1,
    };

    appState.rewards.push(newReward);
    res.json({ success: true, reward: newReward });
  });


  // Telegram Stars Invoice Generation (Mock)
  app.post('/api/shop/invoice', telegramAuthMiddleware, (req: any, res: Response) => {
    const { userId, productId, amount } = req.body;
    // In a real app, use bot.createInvoiceLink() from node-telegram-bot-api
    // with currency: 'XTR' (Telegram Stars)
    res.json({ 
      success: true, 
      invoiceLink: `https://t.me/$INVOICE_LINK_MOCK_${productId}` 
    });
  });

  // Telegram Stars Webhook (Pre-checkout & Successful Payment)
  app.post('/api/webhook/stars', (req: Request, res: Response) => {
    const { pre_checkout_query, message } = req.body;
    
    // 1. Answer Pre-checkout query
    if (pre_checkout_query) {
      return res.json({
        method: 'answerPreCheckoutQuery',
        pre_checkout_query_id: pre_checkout_query.id,
        ok: true
      });
    }

    // 2. Handle Successful Payment
    if (message?.successful_payment) {
      const payload = message.successful_payment.invoice_payload;
      // Extract userId and productId from payload and grant rewards
      console.log('✅ Telegram Stars payment received:', payload);
      // ... grant gold / premium ...
    }
    
    res.sendStatus(200);
  });
  // Buy Shop Equipment Item
  app.post('/api/shop/buy', (req: Request, res: Response) => {
    const { userId, itemId } = req.body;
    const user = appState.users.find((u) => u.id === Number(userId));
    const item = appState.shopItems.find((s) => s.id === Number(itemId));

    if (!user || !item) return res.status(404).json({ error: 'Not found' });

    const alreadyOwned = appState.userItems.some(
      (ui) => ui.user_id === user.id && ui.item_id === item.id
    );
    if (alreadyOwned) return res.status(400).json({ error: 'Предмет уже куплен' });

    if (user.gold < item.cost) return res.status(400).json({ error: 'Недостаточно золота' });

    user.gold -= item.cost;
    // Update DB (async)
    
    const dbUsers = schema.users;
    db.update(dbUsers).set({
      gold: user.gold
    }).where(eq(dbUsers.id, user.id)).execute().catch(e => console.error('DB Update error:', e));

    // Unequip any other item in the same slot before equipping newly bought item
    for (const ui of appState.userItems) {
      if (ui.user_id === user.id && ui.equipped) {
        const matchingItem = appState.shopItems.find((s) => s.id === ui.item_id);
        if (matchingItem?.slot === item.slot) {
          ui.equipped = 0;
        }
      }
    }

    appState.userItems.push({
      user_id: user.id,
      item_id: item.id,
      equipped: 1,
    });

    res.json({ success: true, item, gold: user.gold });
  });

  // Equip / Unequip Item
  app.post('/api/shop/equip', (req: Request, res: Response) => {
    const { userId, itemId } = req.body;
    const user = appState.users.find((u) => u.id === Number(userId));
    const item = appState.shopItems.find((s) => s.id === Number(itemId));

    if (!user || !item) return res.status(404).json({ error: 'Not found' });

    const userItem = appState.userItems.find(
      (ui) => ui.user_id === user.id && ui.item_id === item.id
    );

    if (!userItem) {
      return res.status(400).json({ error: 'Сначала купите этот предмет в лавке' });
    }

    let message = '';
    const slotNames: Record<string, string> = {
      weapon: 'Оружие',
      head: 'Голова',
      body: 'Тело',
      accessory: 'Аксессуар',
      background: 'Фон окружения',
    };
    const slotName = slotNames[item.slot] || item.slot;

    if (userItem.equipped) {
      userItem.equipped = 0;
      message = `Снят предмет «${item.title}» (слот: ${slotName})`;
    } else {
      // Unequip any existing item in the same slot
      let replacedTitle = '';
      for (const ui of appState.userItems) {
        if (ui.user_id === user.id && ui.equipped) {
          const matchingItem = appState.shopItems.find((s) => s.id === ui.item_id);
          if (matchingItem?.slot === item.slot) {
            ui.equipped = 0;
            replacedTitle = matchingItem.title;
          }
        }
      }
      userItem.equipped = 1;

      if (replacedTitle) {
        message = `Надет «${item.title}»! («${replacedTitle}» снят из слота ${slotName})`;
      } else {
        message = `Надет «${item.title}» (слот: ${slotName})`;
      }
    }

    res.json({ success: true, message });
  });

  // Set Custom Background image URL for User
  app.post('/api/users/custom-background', (req: Request, res: Response) => {
    const { userId, bgUrl } = req.body;
    const user = appState.users.find((u) => u.id === Number(userId));
    if (!user) return res.status(404).json({ error: 'Пользователь не найден' });

    // Create a custom background item in shop, then own & equip it
    const newBackgroundId = appState.shopItems.length + 1000 + Math.floor(Math.random() * 9000);
    const newBgItem: ShopItem = {
      id: newBackgroundId,
      code: bgUrl,
      title: 'Пользовательский Фон',
      emoji: '🎨',
      slot: 'background',
      cost: 0,
    };

    appState.shopItems.push(newBgItem);

    // Unequip current backgrounds for user
    for (const ui of appState.userItems) {
      if (ui.user_id === user.id && ui.equipped) {
        const item = appState.shopItems.find((s) => s.id === ui.item_id);
        if (item && item.slot === 'background') {
          ui.equipped = 0;
        }
      }
    }

    // Add and equip
    appState.userItems.push({
      user_id: user.id,
      item_id: newBackgroundId,
      equipped: 1,
    });

    res.json({ success: true, message: 'Установлен новый AI фон !' });
  });

  // Set Custom Avatar image URL for User
  app.post('/api/users/custom-avatar', (req: Request, res: Response) => {
    const { userId, avatarUrl } = req.body;
    const user = appState.users.find((u) => u.id === Number(userId));
    if (!user) return res.status(404).json({ error: 'Пользователь не найден' });

    user.custom_avatar_url = avatarUrl;
    // Update DB (async)
    db.update(schema.users).set({
      class_type: user.class,
      gender: user.gender,
      custom_avatar_url: user.custom_avatar_url,
      character_color: user.character_color,
      skin_tone: user.skin_tone,
      hair_style: user.hair_style,
      hair_color: user.hair_color,
      eye_color: user.eye_color,
    }).where(eq(schema.users.id, user.id)).execute().catch(e => console.error('DB Update error:', e));

    res.json({ success: true, message: 'Аватар успешно обновлён!' });
  });

  // Reset Progress for Testing
  app.post('/api/user/reset', (req: Request, res: Response) => {
    const { userId } = req.body;
    const user = appState.users.find((u) => u.id === Number(userId));
    if (!user) return res.status(404).json({ error: 'User not found' });

    user.gold = 0;
    user.xp = 0;
    user.streak = 0;
    user.skill_date = null;

    res.json({ success: true, user });
  });

  // Referral System Endpoints
  app.get('/api/referrals/info', (req: Request, res: Response) => {
    const userId = Number(req.query.userId) || 1;
    const user = appState.users.find((u) => u.id === userId);
    if (!user) return res.status(404).json({ error: 'Пользователь не найден' });

    const referralCode = user.referral_code || `ref_${user.id}`;
    if (!user.referral_code) user.referral_code = referralCode;

    const myReferrals = (appState.referrals || []).filter((r) => r.referrer_id === user.id);

    res.json({
      referralCode,
      referralLink: `https://t.me/FamilyChoresBot?start=${referralCode}`,
      referralsCount: user.referrals_count || myReferrals.length,
      referralEarningsGold: user.referral_earnings_gold || myReferrals.reduce((acc, r) => acc + r.bonus_gold, 0),
      referralEarningsCrystals: user.referral_earnings_crystals || myReferrals.reduce((acc, r) => acc + r.bonus_crystals, 0),
      referredBy: user.referred_by ? appState.users.find((u) => u.id === user.referred_by)?.display_name : null,
      referralsList: myReferrals.map((r) => {
        const refUser = appState.users.find((u) => u.id === r.referee_id);
        return {
          id: r.id,
          refereeName: r.referee_name,
          date: r.created_at,
          bonusGold: r.bonus_gold,
          bonusCrystals: r.bonus_crystals,
          userColor: refUser?.character_color || refUser?.color || '#f59e0b',
          userClass: refUser?.class || 'warrior',
        };
      }),
      inviteRewards: {
        referrerGold: 100,
        referrerCrystals: 25,
        refereeGold: 50,
        refereeCrystals: 15,
      },
    });
  });

  app.post('/api/referrals/apply', (req: Request, res: Response) => {
    const { userId, refCode } = req.body;
    const user = appState.users.find((u) => u.id === Number(userId));
    if (!user) return res.status(404).json({ error: 'Пользователь не найден' });

    const result = processReferral(user, refCode);
    if (!result.success) {
      return res.status(400).json({ error: result.message });
    }

    res.json({
      success: true,
      message: result.message,
      user,
      referrer: result.referrer,
    });
  });

  // Register New User Endpoint
  app.post('/api/users/register', (req: Request, res: Response) => {
    const {
      name,
      classKey = 'warrior',
      gender = 'male',
      familyCode = 'FAM-7892',
      customAvatarUrl,
      character_color,
      color,
      refCode,
    } = req.body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'Укажите корректное имя пользователя' });
    }

    const trimmedName = name.trim();

    // Check name uniqueness (case-insensitive)
    const nameExists = appState.users.some(
      (u) => u.display_name.trim().toLowerCase() === trimmedName.toLowerCase()
    );
    if (nameExists) {
      return res.status(400).json({
        error: `Имя «${trimmedName}» уже занято другим героем в семье! Пожалуйста, укажите уникальное имя.`,
      });
    }

    const selectedColor = character_color || color || '#f59e0b';
    const newId = appState.users.length + 1;

    const newUser: User = {
      id: newId,
      telegram_id: 100000 + newId,
      display_name: trimmedName,
      assignee: 'both',
      gold: 50,
      xp: 0,
      crystals: 10,
      streak: 1,
      class: (classKey as any) || 'warrior',
      gender: gender === 'female' ? 'female' : 'male',
      character_color: selectedColor,
      color: selectedColor,
      hp: 50,
      max_hp: 50,
      mp: 30,
      max_mp: 30,
      custom_avatar_url: customAvatarUrl,
      skill_date: null,
      notify_partner: 1,
      equipped: {},
      pets: [],
      referral_code: `ref_${newId}`,
      referrals_count: 0,
      referral_earnings_gold: 0,
      referral_earnings_crystals: 0,
    };

    appState.users.push(newUser);

    // Update DB (async)
    db.insert(schema.users).values({
      telegram_id: newUser.telegram_id,
      family_id: 1, // hardcoded for now
      display_name: newUser.display_name,
      class_type: newUser.class,
      gold: newUser.gold,
      xp: newUser.xp,
      crystals: newUser.crystals || 0,
      hp: newUser.hp || 50,
      max_hp: newUser.max_hp || 50,
      mp: newUser.mp || 30,
      max_mp: newUser.max_mp || 30,
      streak: newUser.streak || 0,
      gender: newUser.gender,
      character_color: newUser.character_color,
      assignee: newUser.assignee,
      notify_partner: newUser.notify_partner,
      referral_code: newUser.referral_code,
      referred_by: newUser.referred_by
    }).execute().catch(e => console.error('DB Insert error (user):', e));

    // Give starter item to new user
    appState.userItems.push({
      user_id: newId,
      item_id: classKey === 'mage' ? 2 : 1, // Staff or Sword
      equipped: 1,
    });

    let referralMessage = '';
    if (refCode) {
      const refResult = processReferral(newUser, refCode);
      if (refResult.success) {
        referralMessage = refResult.message;
      }
    }

    res.json({ success: true, user: newUser, referralMessage });
  });

  // Telegram Bot Simulator Command Execution

  // PixelLab AI Integration State

function generatePixelArtSVG(promptText: string): string {
  const p = (promptText || '').toLowerCase();

  let bgTop = '#0f172a';
  let bgBottom = '#1e1b4b';
  let mountainColor = '#312e81';
  let groundColor = '#065f46';
  let accentColor = '#34d399';
  let skyObj = `<circle cx="200" cy="45" r="16" fill="#fef08a" opacity="0.9" />`;
  let elements = `
    <path d="M20 180 L35 150 L50 180 Z M25 165 L35 140 L45 165 Z" fill="#047857" />
    <path d="M180 190 L200 155 L220 190 Z M188 175 L200 145 L212 175 Z" fill="#065f46" />
    <path d="M100 195 L115 165 L130 195 Z" fill="#047857" />
    <circle cx="80" cy="170" r="3" fill="#a7f3d0" opacity="0.8" />
    <circle cx="150" cy="160" r="2.5" fill="#fde047" opacity="0.8" />
  `;

  if (p.includes('castle') || p.includes('замок') || p.includes('dungeon') || p.includes('крепость')) {
    bgTop = '#1e1b4b';
    bgBottom = '#0f172a';
    mountainColor = '#334155';
    groundColor = '#1e293b';
    accentColor = '#64748b';
    skyObj = `<circle cx="50" cy="50" r="16" fill="#e2e8f0" opacity="0.85" />`;
    elements = `
      <rect x="70" y="100" width="30" height="95" fill="#334155"/>
      <rect x="65" y="90" width="40" height="15" fill="#475569"/>
      <rect x="68" y="80" width="8" height="10" fill="#334155"/>
      <rect x="81" y="80" width="8" height="10" fill="#334155"/>
      <rect x="94" y="80" width="8" height="10" fill="#334155"/>
      <rect x="150" y="80" width="45" height="115" fill="#1e293b"/>
      <rect x="145" y="70" width="55" height="18" fill="#334155"/>
      <rect x="165" y="110" width="15" height="25" rx="7" fill="#fbbf24"/>
    `;
  } else if (p.includes('sunset') || p.includes('закат') || p.includes('beach') || p.includes('пляж')) {
    bgTop = '#ea580c';
    bgBottom = '#312e81';
    mountainColor = '#431407';
    groundColor = '#1e1b4b';
    accentColor = '#f59e0b';
    skyObj = `<circle cx="128" cy="100" r="28" fill="#fef08a" />`;
    elements = `
      <path d="M30 200 Q 40 140 60 110" stroke="#431407" stroke-width="6" fill="none" />
      <path d="M60 110 Q 30 90 10 100 M60 110 Q 80 85 100 100 M60 110 Q 40 130 20 140" stroke="#15803d" stroke-width="4" fill="none" />
    `;
  } else if (p.includes('space') || p.includes('космос') || p.includes('cyber') || p.includes('neon') || p.includes('галактика')) {
    bgTop = '#2e1065';
    bgBottom = '#020617';
    mountainColor = '#581c87';
    groundColor = '#0f172a';
    accentColor = '#06b6d4';
    skyObj = `
      <circle cx="190" cy="65" r="22" fill="#06b6d4" opacity="0.8" />
      <ellipse cx="190" cy="65" rx="36" ry="8" fill="none" stroke="#67e8f9" stroke-width="3" transform="rotate(-20 190 65)" />
    `;
    elements = `
      <line x1="0" y1="195" x2="256" y2="195" stroke="#a855f7" stroke-width="2" />
      <line x1="0" y1="215" x2="256" y2="215" stroke="#ec4899" stroke-width="2" />
      <line x1="0" y1="238" x2="256" y2="238" stroke="#06b6d4" stroke-width="2" />
    `;
  } else if (p.includes('cave') || p.includes('пещера') || p.includes('crystal') || p.includes('кристалл')) {
    bgTop = '#083344';
    bgBottom = '#020617';
    mountainColor = '#164e63';
    groundColor = '#0f172a';
    accentColor = '#22d3ee';
    skyObj = `<circle cx="128" cy="40" r="10" fill="#67e8f9" opacity="0.5" />`;
    elements = `
      <polygon points="30,195 40,160 50,195" fill="#22d3ee" />
      <polygon points="180,195 195,150 210,195" fill="#a855f7" />
      <polygon points="110,195 120,165 130,195" fill="#38bdf8" />
    `;
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256" shape-rendering="crispEdges">
    <defs>
      <linearGradient id="skyGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${bgTop}" />
        <stop offset="100%" stop-color="${bgBottom}" />
      </linearGradient>
    </defs>
    <rect width="256" height="256" fill="url(#skyGrad)" />
    <rect x="20" y="25" width="3" height="3" fill="#ffffff" opacity="0.8" />
    <rect x="80" y="15" width="2" height="2" fill="#fde047" opacity="0.9" />
    <rect x="140" y="35" width="3" height="3" fill="#ffffff" opacity="0.7" />
    <rect x="220" y="20" width="2" height="2" fill="#a7f3d0" opacity="0.8" />
    <rect x="170" y="55" width="2" height="2" fill="#ffffff" opacity="0.6" />
    <rect x="45" y="65" width="3" height="3" fill="#fde047" opacity="0.8" />
    ${skyObj}
    <path d="M0 200 L40 140 L90 180 L160 120 L220 170 L256 130 L256 256 L0 256 Z" fill="${mountainColor}" />
    ${elements}
    <rect x="0" y="195" width="256" height="61" fill="${groundColor}" />
    <rect x="0" y="192" width="256" height="4" fill="${accentColor}" opacity="0.5" />
  </svg>`;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

  // POST Generate Pixel Art via PixelLab API

  app.get('/api/health', (req: Request, res: Response) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Global Error Handler & Sentry Logging
  app.use((err: any, req: Request, res: Response, next: NextFunction) => {
    console.error('💥 [Server Exception Captured]:', err);
    if (process.env.SENTRY_DSN) {
      Sentry.captureException(err);
    }
    res.status(500).json({
      error: 'Внутренняя ошибка сервера (Sentry Logged)',
      message: err?.message || 'Неизвестная ошибка',
    });
  });

  // Vite middleware in dev mode
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`🏠 Family Chores Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
