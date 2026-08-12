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
import { appState } from './src/services/stateService';
import { sendTelegramPushNotification } from './src/services/notificationService';
import { processReferral } from './src/services/referralService';
import { checkAchievements } from './src/services/achievementService';
import { applyTaskCompletion } from './src/services/taskService';
import { applySkill } from './src/services/skillService';
import { persistProfile } from './src/services/userService';
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

import { Completion, FeedEntry, Reward, ShopItem, Task, User } from './src/types';

const PORT = 3000;

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
    // Сохранить профиль в БД
    persistProfile(user);

    res.json({ success: true, user });
  });

  // Switch/Set Gender
  app.post('/api/users/gender', (req: Request, res: Response) => {
    const { userId, gender } = req.body;
    const user = appState.users.find((u) => u.id === Number(userId));
    if (!user) return res.status(404).json({ error: 'User not found' });

    user.gender = gender === 'female' ? 'female' : 'male';
    // Сохранить профиль в БД
    persistProfile(user);

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
    // Сохранить профиль в БД
    persistProfile(user);


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
    // Сохранить профиль в БД
    persistProfile(user);

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
