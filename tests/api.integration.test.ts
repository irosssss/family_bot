import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApiApp } from '../src/server/apiApp';
import { appState } from '../src/services/stateService';
import type { User } from '../src/types';
import { createSignedInitData } from './helpers/telegramInitData';

const BOT_TOKEN = '123456:integration-test-token';

describe('production HTTP API authorization', () => {
  let server: Server;
  let baseUrl: string;
  let originalUsers: User[];
  let originalNodeEnv: string | undefined;
  let originalBotToken: string | undefined;
  let originalDemoMode: string | undefined;

  const authFor = (telegramId: number) => ({
    authorization: `tma ${createSignedInitData(telegramId, BOT_TOKEN)}`,
  });

  beforeAll(async () => {
    originalUsers = appState.users;
    originalNodeEnv = process.env.NODE_ENV;
    originalBotToken = process.env.BOT_TOKEN;
    originalDemoMode = process.env.DEMO_MODE;
    process.env.NODE_ENV = 'production';
    process.env.BOT_TOKEN = BOT_TOKEN;
    delete process.env.DEMO_MODE;

    const base = structuredClone(originalUsers[0]);
    const user = (values: Partial<User> & Pick<User, 'id' | 'telegram_id' | 'display_name'>): User => ({
      ...structuredClone(base),
      family_id: 11,
      family_role: 'child',
      is_admin: false,
      equipped: {},
      pets: [],
      ...values,
    });
    appState.users = [
      user({ id: 101, telegram_id: 9101, display_name: 'Parent A', family_id: 11, family_role: 'parent', is_admin: true }),
      user({ id: 102, telegram_id: 9102, display_name: 'Child A', family_id: 11 }),
      user({ id: 201, telegram_id: 9201, display_name: 'Parent B', family_id: 22, family_role: 'parent', is_admin: true }),
      user({ id: 202, telegram_id: 9202, display_name: 'Child B', family_id: 22 }),
    ];

    const app = createApiApp({ rateLimitEnabled: false });
    server = createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    appState.users = originalUsers;
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
    if (originalBotToken === undefined) delete process.env.BOT_TOKEN;
    else process.env.BOT_TOKEN = originalBotToken;
    if (originalDemoMode === undefined) delete process.env.DEMO_MODE;
    else process.env.DEMO_MODE = originalDemoMode;
  });

  it('keeps health public but protects private API routes', async () => {
    const health = await fetch(`${baseUrl}/api/health`);
    expect(health.status).toBe(200);
    expect(await health.json()).toMatchObject({ status: 'ok' });

    const users = await fetch(`${baseUrl}/api/users`);
    expect(users.status).toBe(401);
  });

  it('rejects a forged or unknown Telegram identity', async () => {
    const forged = await fetch(`${baseUrl}/api/users/102`, {
      headers: { authorization: `${authFor(9102).authorization}broken` },
    });
    expect(forged.status).toBe(403);

    const unknown = await fetch(`${baseUrl}/api/users/102`, { headers: authFor(9999) });
    expect(unknown.status).toBe(403);
  });

  it('limits the admin listing to the authenticated family', async () => {
    const response = await fetch(`${baseUrl}/api/users`, { headers: authFor(9101) });
    expect(response.status).toBe(200);
    const body = await response.json() as { data: Array<{ id: number }> };
    expect(body.data.map((candidate) => candidate.id)).toEqual([101, 102]);
  });

  it('does not grant the family admin endpoint to a child', async () => {
    const response = await fetch(`${baseUrl}/api/users`, { headers: authFor(9102) });
    expect(response.status).toBe(403);
  });

  it('allows same-family reads and blocks cross-family reads', async () => {
    const sameFamily = await fetch(`${baseUrl}/api/users/101`, { headers: authFor(9102) });
    expect(sameFamily.status).toBe(200);

    const otherFamily = await fetch(`${baseUrl}/api/users/202`, { headers: authFor(9102) });
    expect(otherFamily.status).toBe(403);
  });

  it('returns JSON 404 for an authenticated unknown API route', async () => {
    const response = await fetch(`${baseUrl}/api/not-a-route`, { headers: authFor(9102) });
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ error: 'API route not found' });
  });
});
