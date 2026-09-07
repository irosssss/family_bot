import { describe, expect, it } from 'vitest';
import { createTargetApp } from '../../src/target/app';

describe('target HTTP boundary (FT11)', () => {
  it('serves health/readiness, rejects game routes and redacts dependency failures', async () => {
    let ready = true;
    const app = createTargetApp({ checkReadiness: async () => { if (!ready) throw new Error('private detail'); } });
    const server = await new Promise<ReturnType<typeof app.listen>>((resolve, reject) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s)); s.once('error', reject);
    });
    try {
      const address = server.address(); if (!address || typeof address === 'string') throw new Error('missing test port');
      const base = `http://127.0.0.1:${address.port}`;
      const health = await fetch(`${base}/health`);
      expect(health.status).toBe(200); expect(health.headers.get('cache-control')).toBe('no-store');
      expect(await health.json()).toEqual({ status: 'ok' });
      expect((await fetch(`${base}/ready`)).status).toBe(200);
      ready = false;
      const failed = await fetch(`${base}/ready`);
      expect(failed.status).toBe(503); expect(await failed.json()).toEqual({ error_key: 'target.not_ready' });
      for (const route of ['/api/tasks', '/api/users', '/api/demo', '/api/shop']) {
        expect((await fetch(`${base}${route}`, { method: 'POST' })).status).toBe(404);
      }
    } finally { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
  });
});
