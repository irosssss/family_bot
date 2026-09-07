import express from 'express';

export interface TargetAppDependencies { readonly checkReadiness: () => Promise<void> }

export function createTargetApp(dependencies: TargetAppDependencies) {
  const app = express();
  app.disable('x-powered-by');
  app.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
  app.get('/health', (_req, res) => { res.json({ status: 'ok' }); });
  app.get('/ready', async (_req, res) => {
    try { await dependencies.checkReadiness(); res.json({ status: 'ready' }); }
    catch { res.status(503).json({ error_key: 'target.not_ready' }); }
  });
  app.use((_req, res) => { res.status(404).json({ error_key: 'target.route_not_found' }); });
  return app;
}
