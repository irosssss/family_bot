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
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
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
import { initializeCronJobs } from './src/bot/cronJobs';
import { appState } from './src/services/stateService';
import { applyTaskCompletion } from './src/services/taskService';
import { generateId } from './src/lib/ids';
import { initStreakCronJob } from './src/services/streakCronJob';
import { globalApiAuth } from './src/utils/apiAuth';
import rateLimit from 'express-rate-limit';

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
import { habitRoutes } from './src/api/habitRoutes';
import { zooRoutes } from './src/api/zooRoutes';
import { armoireRoutes } from './src/api/armoireRoutes';
import { starsRoutes, creditPurchase } from './src/api/starsRoutes';
import { familyRoutes } from './src/api/familyRoutes';

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

    // === Этап 10: комната семьи ===
    // Клиент после авторизации шлёт `join:family` с { familyId } →
    // мы добавляем сокет в комнату `family:N` для party-событий.
    socket.on('join:family', (data: { familyId?: number }) => {
      const familyId = Number(data?.familyId) || 1;
      socket.join(`family:${familyId}`);
      console.log(`Socket ${socket.id} joined family:${familyId}`);
    });

    // Дисконнект
    socket.on('disconnect', () => {
      console.log('Client disconnected:', socket.id);
    });
  });

  // --- Middleware ---
  // CORS: allowlist (Mini App живёт на том же origin; VITE_API_URL — для внешнего фронта).
  const corsOrigin = process.env.VITE_API_URL?.replace(/\/$/, '');
  app.use(cors({ origin: corsOrigin ? [corsOrigin] : false }));
  // Security-заголовки (этап 5 аудита). CSP ослаблен только для dev-VM Vite.
  // CSP в проде настроен под Telegram Mini App:
  //  - script-src разрешает telegram.org (telegram-web-app.js обязателен);
  //  - frame-ancestors разрешает web.telegram.org (Mini App живёт в iframe
  //    Telegram Web/Desktop); X-Frame-Options отключён — он бы блокировал iframe.
  app.use(helmet({
    contentSecurityPolicy: process.env.NODE_ENV === 'production' ? {
      directives: {
        ...helmet.contentSecurityPolicy.getDefaultDirectives(),
        'script-src': ["'self'", 'https://telegram.org'],
        'frame-ancestors': ["'self'", 'https://web.telegram.org', 'https://webk.com', 'https://web.t.me'],
      },
    } : false,
    crossOriginEmbedderPolicy: false,
    frameguard: false,
  }));
  app.use(express.json());

  // --- Rate limit: API-запросы (этап 5 аудита) ---
  const apiLimiter = rateLimit({
    windowMs: 60_000,
    limit: 300,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
  });
  app.use('/api', apiLimiter);

  // --- Глобальный auth-guard API (этап 1 аудита) ---
  // Telegram Mini App: Authorization: tma <initData> → req.auth.
  // DEMO MODE (нет BOT_TOKEN) работает как раньше, без auth.
  app.use(globalApiAuth);

  // --- Инициализация БД ---
  initializeDatabase();

  // --- Инициализация Streak Cron Job ---
  initStreakCronJob(io);

  // --- Инициализация Cron Jobs ---
  initializeCronJobs();

  // --- API ROUTES (BEFORE Vite middleware) ---
  app.use('/api/integrations', integrationsRouter);
  app.use('/api/state', stateRoutes);
  app.use('/api/auth', authRoutes);
  app.use('/api/webhook', webhookRoutes);
  app.use('/api/tasks', taskRoutes);
  app.use('/api/habits', habitRoutes);
  app.use('/api/zoo', zooRoutes);
  app.use('/api/armoire', armoireRoutes);
  app.use('/api/stars', starsRoutes);
  app.use('/api/family', familyRoutes);
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

  // --- API 404: неизвестные /api/* пути должны вернуть JSON, а не SPA-fallback (баг #6) ---
  app.use('/api', (_req: Request, res: Response) => {
    res.status(404).json({ error: 'API route not found', path: _req.originalUrl });
  });

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
  });
}

startServer();
