import express, { type ErrorRequestHandler } from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { createTelegramIdentityVerifier } from '../target/access/telegram';
import { createInitialDemoState } from '../demo/catalog';
import { applyDemoAction, demoDay, DemoError } from '../demo/domain';
import type { DemoState } from '../demo/types';

/** Temporary device preview. No legacy database, bot callbacks or target sessions. */
export function createTelegramPreviewApp(config: { botToken: string; origin: string; directory: string; now?: () => number }) {
  const origin = new URL(config.origin);
  if (origin.protocol !== 'https:' || origin.origin !== config.origin) throw new Error('HTTPS origin required');
  const verify = createTelegramIdentityVerifier({
    botId: config.botToken.split(':')[0], botToken: config.botToken, environment: 'production',
    now: config.now ?? Date.now,
    policy: { id: 'device_preview', revision: 1, maxAgeSeconds: 7200, futureSkewSeconds: 30, maxBytes: 8192, maxFields: 32 },
  });
  const worlds = new Map<string, DemoState>();
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet({
    contentSecurityPolicy: { directives: {
      ...helmet.contentSecurityPolicy.getDefaultDirectives(),
      'script-src': ["'self'", 'https://telegram.org'],
      'frame-ancestors': ["'self'", 'https://web.telegram.org', 'https://webk.telegram.org', 'https://webz.telegram.org'],
    } }, crossOriginEmbedderPolicy: false, frameguard: false,
  }));
  app.use((req, res, next) => {
    if (req.headers.host !== origin.host || (req.headers.origin && req.headers.origin !== origin.origin)) {
      res.status(403).json({ error: 'Откройте игру через кнопку бота.' }); return;
    }
    next();
  });
  app.get('/api/health', (_req, res) => { res.json({ status: 'ok', mode: 'isolated-telegram-preview' }); });
  app.use('/api', rateLimit({ windowMs: 60_000, limit: 300, standardHeaders: 'draft-7', legacyHeaders: false,
    validate: { xForwardedForHeader: false } }));
  app.use('/api', (_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
  app.use('/api/demo', (req, res, next) => {
    const header = req.headers.authorization;
    const result = verify(header?.startsWith('tma ') ? header.slice(4) : undefined);
    if (!result.ok) {
      res.status(401).json({ error: 'Откройте бота в Telegram и нажмите «Играть». Если игра уже открыта, закройте и откройте её снова.' }); return;
    }
    const subject = result.identity.subject;
    if (!worlds.has(subject)) {
      if (worlds.size >= 32) { res.status(503).json({ error: 'Тестовая версия заполнена. Попробуйте позже.' }); return; }
      worlds.set(subject, createInitialDemoState(demoDay()));
    }
    res.locals.subject = subject;
    next();
  });
  app.use('/api/demo', express.json({ limit: '24kb' }));
  app.get('/api/demo/state', (_req, res) => {
    const state = worlds.get(res.locals.subject)!;
    res.json({ state: { ...state, day: demoDay(new Date(), state.timezone) } });
  });
  app.post('/api/demo/action', (req, res) => {
    // Custom filesystem assets are configured locally, outside the public preview.
    if (req.body?.action === 'saveCatalog') { res.status(403).json({ error: 'Редактор каталога доступен в локальной версии.' }); return; }
    const result = applyDemoAction(worlds.get(res.locals.subject)!, req.body);
    worlds.set(res.locals.subject, result.state);
    res.json(result);
  });
  app.use('/api', (_req, res) => { res.status(404).json({ error: 'Этот раздел API недоступен в тестовой версии.' }); });
  app.use(express.static(config.directory, { dotfiles: 'deny', index: 'index.html' }));
  const errors: ErrorRequestHandler = (error, _req, res, _next) => {
    const status = error instanceof DemoError ? error.status : error?.type === 'entity.too.large' ? 413 : error instanceof SyntaxError ? 400 : 500;
    res.status(status).json({ error: error instanceof DemoError ? error.message : 'Не удалось выполнить запрос.' });
  };
  app.use(errors);
  return app;
}
