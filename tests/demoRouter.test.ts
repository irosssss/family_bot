import { createServer, request, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import express, { type Request } from 'express';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createInitialDemoState } from '../src/demo/catalog';
import { applyDemoAction } from '../src/demo/domain';
import type { DemoAction } from '../src/demo/types';

const memory = vi.hoisted(() => ({ state: null as any }));
vi.mock('../src/demo/store', () => ({
  getDemoState: async () => structuredClone(memory.state),
  dispatchDemoAction: async (action: DemoAction) => {
    const result = applyDemoAction(memory.state, action, new Date('2026-09-05T10:00:00Z'));
    memory.state = result.state;
    return result;
  },
}));
import { demoRoutes, isLocalDemoRequest } from '../src/demo/router';

describe('local demo HTTP boundary', () => {
  let server: Server;
  let baseUrl: string;
  const oldEnv = process.env.NODE_ENV;
  const oldDemoMode = process.env.DEMO_MODE;

  beforeAll(async () => {
    const app = express(); app.use(express.json()); app.use('/api/demo', demoRoutes);
    server = createServer(app);
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => { server.removeListener('error', reject); resolve(); });
    });
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  beforeEach(() => {
    process.env.NODE_ENV = 'test'; delete process.env.DEMO_MODE;
    memory.state = createInitialDemoState('2026-09-05');
  });
  afterAll(async () => {
    if (server?.listening) await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    if (oldEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = oldEnv;
    if (oldDemoMode === undefined) delete process.env.DEMO_MODE; else process.env.DEMO_MODE = oldDemoMode;
  });
  const post = (body: unknown, headers: Record<string, string> = {}) => fetch(`${baseUrl}/api/demo/action`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body),
  });

  it('returns persistent-shape state and no-store headers only on loopback', async () => {
    const response = await fetch(`${baseUrl}/api/demo/state`);
    expect(response.status).toBe(200); expect(response.headers.get('cache-control')).toBe('no-store');
    expect((await response.json()).state.catalog.bosses).toHaveLength(49);
  });
  it('rejects a hostile browser origin and a non-local Host', async () => {
    expect((await post({ actorId: 'father', action: 'claimDaily', requestId: 'origin-1' }, { Origin: 'https://evil.example' })).status).toBe(403);
    const spoofedHostStatus = await new Promise<number>((resolve, reject) => {
      const call = request(`${baseUrl}/api/demo/state`, { headers: { Host: 'public.example' } }, response => {
        response.resume(); resolve(response.statusCode ?? 0);
      }); call.on('error', reject); call.end();
    });
    expect(spoofedHostStatus).toBe(403);
    expect((await post({ actorId: 'father', action: 'claimDaily', requestId: 'origin-2' }, { Origin: `${baseUrl}0` })).status).toBe(403);
    expect((await post({ actorId: 'father', action: 'claimDaily', requestId: 'origin-3' }, { Origin: baseUrl })).status).toBe(200);
  });
  it('rejects non-loopback peer IP even when Host is forged to localhost', () => {
    const request = { headers: { host: 'localhost:3000' }, socket: { remoteAddress: '192.168.1.12' } } as Pick<Request, 'headers' | 'socket'>;
    expect(isLocalDemoRequest(request)).toBe(false);
  });
  it('is off in production without explicit local demonstration override', async () => {
    process.env.NODE_ENV = 'production';
    expect((await fetch(`${baseUrl}/api/demo/state`)).status).toBe(404);
    process.env.DEMO_MODE = 'true';
    expect((await fetch(`${baseUrl}/api/demo/state`)).status).toBe(200);
  });
  it('rejects missing request IDs and enforces role checks through the HTTP route', async () => {
    expect((await post({ actorId: 'son', action: 'claimDaily' })).status).toBe(400);
    const response = await post({ actorId: 'son', action: 'saveUser', requestId: 'forged-parent', user: { id: 'son', subtype: 'father', age: 18 } });
    expect(response.status).toBe(403); expect((await response.json()).error).toContain('взрослому');
  });
  it('returns once-only simulated purchase across repeated HTTP requests', async () => {
    const body = { actorId: 'father', action: 'simulatePurchase', requestId: 'purchase-1' };
    expect((await post(body)).status).toBe(200);
    const retry = await post(body);
    const result = await retry.json(); expect(result.state.wallet.decorativeCredits).toBe(120);
    expect(result.state.simulatedPurchases).toHaveLength(1);
  });
  it('rejects absent local image paths without creating a catalog entry', async () => {
    const response = await post({ actorId: 'father', action: 'saveCatalog', requestId: 'bad-art', catalog: 'pets', entry: { id: 'cat', art: '/assets/game/definitely-missing-pet.png' } });
    expect(response.status).toBe(404); expect(memory.state.revision).toBe(0);
  });
  it('rejects a thumbnail as a custom full-character layer and accepts a real alpha layer', async () => {
    const entry = { id: 'custom-cape', name: 'Плащ для путешествий', kind: 'body', classId: 'all', price: 20, art: '/assets/game/demo/items/warrior-body.png' };
    const invalid = await post({ actorId: 'father', action: 'saveCatalog', requestId: 'bad-layer', catalog: 'items', entry: { ...entry, layerArt: '/assets/game/demo/items/warrior-body.png' } });
    expect(invalid.status).toBe(400); expect((await invalid.json()).error).toContain('256×320');
    const valid = await post({ actorId: 'father', action: 'saveCatalog', requestId: 'good-layer', catalog: 'items', entry: { ...entry, layerArt: '/assets/game/demo/characters/starter-warrior-body-peach.png' } });
    expect(valid.status).toBe(200);
    expect((await valid.json()).state.catalog.items.find((i: { id: string }) => i.id === 'custom-cape').layerArt).toContain('/characters/');
  });
  it('accepts empty optional layer input for decor but still rejects a custom outfit without its layer', async () => {
    const decor = await post({ actorId: 'father', action: 'saveCatalog', requestId: 'empty-decor-layer', catalog: 'items', entry: { id: 'plant', layerArt: '' } });
    expect(decor.status).toBe(200);
    const builtin = await post({ actorId: 'father', action: 'saveCatalog', requestId: 'empty-builtin-layer', catalog: 'items', entry: { id: 'starter-rogue-body', layerArt: '' } });
    expect(builtin.status).toBe(200);
    const custom = await post({ actorId: 'father', action: 'saveCatalog', requestId: 'empty-custom-layer', catalog: 'items', entry: {
      id: 'custom-missing-layer', name: 'Новый плащ', kind: 'body', classId: 'all', art: '/assets/game/demo/items/warrior-body.png', layerArt: '',
    } });
    expect(custom.status).toBe(400); expect((await custom.json()).error).toContain('нужен прозрачный слой');
  });
});
