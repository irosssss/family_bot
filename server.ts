/**
 * Family Chores RPG — сервер (bootstrap).
 *
 * Тонкий файл: создаёт Express + HTTP + Socket.IO, монтирует роутеры
 * и запускает сервер. Вся бизнес-логика вынесена в:
 *   src/services/  — игровая логика, уведомления, состояние
 *   src/api/       — Express-роутеры (по доменам)
 *   src/lib/       — чистые утилиты (даты, id)
 *   src/config/    — централизованная конфигурация
 *   src/bot/       — Telegram-бот (вебхуки, коллбэки)
 *   src/db/        — PostgreSQL + Drizzle ORM
 */
import 'dotenv/config';
import express, { Request, Response } from 'express';
import path from 'path';
import * as Sentry from '@sentry/node';
import { createServer as createHttpServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { createServer as createViteServer } from 'vite';
import { eq } from 'drizzle-orm';
import { db } from './src/db/index';
import * as schema from './src/db/schema';
import { initializeDatabase } from './setup_db';
import {
  onTaskCreate,
  onInviteRequest,
  notifyTaskCreated,
} from './src/bot/telegramBot';
import { initializeCronJobs } from './src/bot/cronJobs';
import { appState } from './src/services/stateService';
import { generateId } from './src/lib/ids';
import { initStreakCronJob } from './src/services/streakCronJob';
import { registerTelegramWebhook } from './src/bot/webhookRegistration';
import { getUserFamilyId } from './src/utils/apiAuth';
import { ensureCatalogInDb, hydrateWalletFromDb, backfillProgressFromMemory } from './src/db/backfillCatalog';
import { hydrateUsersFromDb } from './src/services/userStateHydration';
import { hydrateFamilyGameStatesFromDb } from './src/services/familyGameStateService';

import { runMigrations } from './src/db/migrate';
import { createApiApp } from './src/server/apiApp';
import { configureSocketServer } from './src/server/socketServer';

const PORT = parseInt(process.env.PORT || '3000', 10);

// Initialize Sentry Node SDK if DSN is provided
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || 'production',
    tracesSampleRate: 1.0,
  });
  console.log('⚡ Server Sentry initialized successfully');
}

async function startServer() {
  const corsOrigin = process.env.APP_ORIGIN?.replace(/\/$/, '')
    || process.env.VITE_API_URL?.replace(/\/$/, '');
  const app = createApiApp({ corsOrigin });
  const httpServer = createHttpServer(app);
  const socketCorsOrigin = corsOrigin
    ? [corsOrigin]
    : process.env.NODE_ENV === 'production'
      ? false
      : true;
  const io = new SocketIOServer(httpServer, { cors: { origin: socketCorsOrigin } });
  app.set('io', io);
  configureSocketServer(io);

  // --- Telegram-бот коллэки (создание/одобрение задач через бота) ---
  onTaskCreate(async (title, points, chatId, actorTelegramId) => {
    const actor = appState.users.find((user) => user.telegram_id === actorTelegramId);
    const familyId = getUserFamilyId(actor);
    if (!actor || familyId === null || !(actor.is_admin || actor.family_role === 'parent')) {
      return { ok: false, message: 'Только родитель семьи может создавать задачи.' };
    }

    const newTask = {
      id: generateId(),
      family_id: familyId,
      code: `custom_${generateId()}`,
      title: title,
      points: points,
      assignee: 'both' as const,
      task_type: 'todo' as const,
      day_of_week: null,
    };

    // ARC-01: сначала БД (подтверждение), затем память. Ошибка → бот получает
    // ошибку в консоль, задача не «существует» только в памяти.
    try {
      const [created] = await db.insert(schema.tasks).values({
        family_id: familyId,
        code: newTask.code,
        title: newTask.title,
        points: newTask.points,
        assignee: newTask.assignee,
        task_type: newTask.task_type,
        day_of_week: newTask.day_of_week,
        done: false,
      }).returning({ id: schema.tasks.id });
      if (!created) throw new Error('Task creation returned no row');
      newTask.id = created.id;
    } catch (e) {
      console.error('[arc01] DB Insert error (bot task):', e);
      return { ok: false, message: 'Не удалось сохранить задачу. Попробуйте ещё раз.' };
    }

    appState.tasks.push(newTask);
    notifyTaskCreated(chatId, title, points);

    // Broadcast via socket
    io.to(`family:${familyId}`).emit('stateUpdate');
    return { ok: true };
  });

  onInviteRequest(async (actorTelegramId) => {
    const actor = appState.users.find((user) => user.telegram_id === actorTelegramId);
    const familyId = getUserFamilyId(actor);
    if (!actor || familyId === null || !(actor.is_admin || actor.family_role === 'parent')) {
      return { ok: false, message: 'Только родитель семьи может получить инвайт-код.' };
    }
    const [family] = await db.select({ code: schema.families.family_code })
      .from(schema.families)
      .where(eq(schema.families.id, familyId))
      .limit(1);
    return family
      ? { ok: true, code: family.code }
      : { ok: false, message: 'Семья не найдена.' };
  });

  // --- Инициализация БД ---
  // Никаких fire-and-forget: globalApiAuth читает appState.users до первого
  // /api/state. К моменту, когда порт начинает слушать запросы, кэш должен
  // отражать PostgreSQL, иначе любой реальный Telegram-пользователь получает 403.
  await runMigrations();
  await initializeDatabase();
  await ensureCatalogInDb();
  await backfillProgressFromMemory();
  const hydratedUsers = await hydrateUsersFromDb();
  const hydratedFamilies = await hydrateFamilyGameStatesFromDb();
  await hydrateWalletFromDb();
  console.log(`[Server] Hydrated ${hydratedUsers} users and ${hydratedFamilies} families from PostgreSQL.`);

  // --- Инициализация Streak Cron Job ---
  initStreakCronJob(io);

  // --- Инициализация Cron Jobs ---
  initializeCronJobs();

  // --- Vite (dev) / static (prod) - AFTER API routes ---
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
    console.log(`[Server] Family Chores Server running on http://0.0.0.0:${PORT}`);
    // Прод: саморегистрация Telegram-вебхука (идемпотентна; в dev — skip).
    void registerTelegramWebhook();
  });
}

startServer();
