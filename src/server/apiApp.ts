import * as Sentry from '@sentry/node';
import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import type { Server as SocketIOServer } from 'socket.io';
import { armoireRoutes } from '../api/armoireRoutes';
import { assetRoutes } from '../api/assetRoutes';
import { authRoutes } from '../api/authRoutes';
import { familyRoutes } from '../api/familyRoutes';
import { habitRoutes } from '../api/habitRoutes';
import { integrationsRouter } from '../api/integrations';
import { referralRoutes } from '../api/referralRoutes';
import { rewardRoutes } from '../api/rewardRoutes';
import { shopRoutes } from '../api/shopRoutes';
import { skillRoutes } from '../api/skillRoutes';
import { starsRoutes } from '../api/starsRoutes';
import { stateRoutes } from '../api/stateRoutes';
import { taskRoutes } from '../api/taskRoutes';
import { userRoutes } from '../api/userRoutes';
import { webhookRoutes } from '../api/webhookRoutes';
import { zooRoutes } from '../api/zooRoutes';
import { globalApiAuth } from '../utils/apiAuth';

export interface ApiAppOptions {
  corsOrigin?: string;
  io?: SocketIOServer;
  rateLimitEnabled?: boolean;
}

/**
 * Собирает только HTTP API. Здесь нет миграций, cron-задач, Vite и listen(),
 * поэтому тот же production middleware stack можно проверять интеграционными
 * тестами на временном HTTP-порту.
 */
export function createApiApp(options: ApiAppOptions = {}) {
  const app = express();
  if (options.io) app.set('io', options.io);

  app.use(cors({ origin: options.corsOrigin ? [options.corsOrigin] : false }));
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

  if (options.rateLimitEnabled !== false) {
    app.use('/api', rateLimit({
      windowMs: 60_000,
      limit: 300,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
    }));
  }

  app.use(globalApiAuth);

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
  app.use('/api', assetRoutes);

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.error('[Server Exception Captured]:', err);
    if (process.env.SENTRY_DSN) Sentry.captureException(err);
    const message = err instanceof Error ? err.message : 'Неизвестная ошибка';
    res.status(500).json({
      error: 'Внутренняя ошибка сервера',
      message,
    });
  });

  app.use('/api', (req: Request, res: Response) => {
    res.status(404).json({ error: 'API route not found', path: req.originalUrl });
  });

  return app;
}
