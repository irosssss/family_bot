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
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
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
  telegramWebhookHandler,
  notifyParentAboutTaskCompletion,
  setSocketIO,
  onTaskApprove,
  onTaskCreate,
  notifyTaskCreated,
} from './src/bot/telegramBot';
import { appState } from './src/services/stateService';
import { applyTaskCompletion } from './src/services/taskService';
import { generateId } from './src/lib/ids';

// Роутеры
import { integrationsRouter } from './src/api/integrations';
import { stateRoutes } from './src/api/stateRoutes';
import { authRoutes } from './src/api/authRoutes';
import { webhookRoutes } from './src/api/webhookRoutes';
import { taskRoutes } from './src/api/taskRoutes';
import { skillRoutes } from './src/api/skillRoutes';
import { userRoutes } from './src/api/userRoutes';
import { rewardRoutes } from './src/api/rewardRoutes';
import { shopRoutes } from './src/api/shopRoutes';
import { referralRoutes } from './src/api/referralRoutes';
import { assetRoutes } from './src/api/assetRoutes';

const PORT = 3000;

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
  const app = express();
  const httpServer = createHttpServer(app);
  const io = new SocketIOServer(httpServer, { cors: { origin: '*' } });
  app.set('io', io);
  setSocketIO(io);

  // --- Telegram-бот коллэки (создание/одобрение задач через бота) ---
  onTaskCreate((title, points, chatId) => {
    const newTask = {
      id: generateId(),
      code: `custom_${generateId()}`,
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

  // --- Socket.IO ---
  io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);
  });

  // --- Middleware ---
  app.use(cors());
  app.use(express.json());

  // --- Монтирование роутеров ---
  app.use('/api/integrations', integrationsRouter);
  app.use('/api/state', stateRoutes);
  app.use('/api/auth', authRoutes);
  app.use('/api/webhook', webhookRoutes);
  app.use('/api/tasks', taskRoutes);
  app.use('/api/skills', skillRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/rewards', rewardRoutes);
  app.use('/api/shop', shopRoutes);
  app.use('/api/referrals', referralRoutes);
  app.use('/api', assetRoutes);         // → POST /api/upload-zips (роутер сам содержит путь)

  // Health check на оригинальном пути (для мониторинга/деплоя)
  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // --- Инициализация БД ---
  initializeDatabase();

  // --- Глобальный error handler ---
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

  // --- Vite (dev) / static (prod) ---
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
