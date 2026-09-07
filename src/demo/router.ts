import { Router, type NextFunction, type Request, type Response } from 'express';
import { open, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { DemoError } from './domain';
import { dispatchDemoAction, getDemoState } from './store';
import type { DemoAction } from './types';

export const demoRoutes = Router();
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);
export function isLocalDemoRequest(req: Pick<Request, 'headers' | 'socket'>): boolean {
  const remote = req.socket.remoteAddress ?? '';
  if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(remote)) return false;
  try {
    const host = new URL(`http://${req.headers.host ?? ''}`);
    if (!LOOPBACK_HOSTS.has(host.hostname)) return false;
    if (req.headers.origin) {
      const origin = new URL(req.headers.origin);
      if (!['http:', 'https:'].includes(origin.protocol) || !LOOPBACK_HOSTS.has(origin.hostname)
        || origin.host !== host.host) return false;
    }
    return true;
  } catch { return false; }
}

demoRoutes.use((req: Request, res: Response, next: NextFunction) => {
  if (process.env.NODE_ENV === 'production' && process.env.DEMO_MODE !== 'true') {
    res.status(404).json({ error: 'Демонстрационный режим выключен', code: 'DEMO_DISABLED' }); return;
  }
  if (!isLocalDemoRequest(req)) {
    res.status(403).json({ error: 'Демонстрация доступна только с этого компьютера через localhost', code: 'LOCAL_DEMO_ONLY' }); return;
  }
  res.setHeader('Cache-Control', 'no-store'); next();
});

function respondError(error: unknown, res: Response) {
  if (error instanceof DemoError) res.status(error.status).json({ error: error.message, code: error.code });
  else {
    // Never serialize connection details, request bodies or environment values.
    console.error('[demo] request failed:', error instanceof Error ? error.name : 'UnknownError');
    res.status(503).json({ error: 'Не удалось сохранить демо. Проверьте, что локальная PostgreSQL запущена.', code: 'DEMO_STORAGE_UNAVAILABLE' });
  }
}

demoRoutes.get('/state', async (_req, res) => {
  try { res.json({ state: await getDemoState() }); } catch (error) { respondError(error, res); }
});

demoRoutes.post('/action', async (req, res) => {
  try {
    const action = req.body as DemoAction;
    if (action?.action === 'saveCatalog' && action.entry) for (const field of ['art', 'layerArt'] as const) {
      const art = action.entry[field];
      if (art === undefined) continue;
      // Empty optional layer input is handled by the domain: allowed for decor/builtins,
      // rejected for a new custom costume that actually needs a renderable layer.
      if (field === 'layerArt' && art === '') continue;
      if (typeof art !== 'string' || !art.startsWith('/assets/game/') || art.includes('..')) throw new DemoError('Нужен путь к существующему игровому изображению');
      const runtimeRoot = await realpath(path.resolve('public/assets/game'));
      let asset: string;
      try { asset = await realpath(path.resolve('public', `.${art}`)); }
      catch { throw new DemoError('Изображение не найдено в public/assets/game', 404); }
      if (!asset.startsWith(`${runtimeRoot}${path.sep}`) || !(await stat(asset)).isFile()) throw new DemoError('Изображение должно находиться в public/assets/game');
      if (field === 'layerArt') {
        const file = await open(asset, 'r');
        try {
          const header = Buffer.alloc(33); await file.read(header, 0, 33, 0);
          if (header.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a'
            || header.readUInt32BE(16) !== 256 || header.readUInt32BE(20) !== 320 || ![4, 6].includes(header[25])) {
            throw new DemoError('Слой одежды должен быть PNG 256×320 с прозрачным каналом');
          }
        } finally { await file.close(); }
      }
    }
    res.json(await dispatchDemoAction(action));
  } catch (error) { respondError(error, res); }
});
