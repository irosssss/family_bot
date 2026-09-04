import { createServer, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { io as createClient, type Socket as ClientSocket } from 'socket.io-client';
import { Server as SocketIOServer, type Socket as ServerSocket } from 'socket.io';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { configureSocketServer } from '../src/server/socketServer';
import { appState } from '../src/services/stateService';
import type { User } from '../src/types';
import { createSignedInitData } from './helpers/telegramInitData';

const BOT_TOKEN = '123456:socket-integration-test-token';

describe('production Socket.IO family isolation', () => {
  let httpServer: HttpServer;
  let io: SocketIOServer;
  let url: string;
  let originalUsers: User[];
  let originalNodeEnv: string | undefined;
  let originalBotToken: string | undefined;
  let originalDemoMode: string | undefined;
  const clients: ClientSocket[] = [];

  beforeAll(async () => {
    originalUsers = appState.users;
    originalNodeEnv = process.env.NODE_ENV;
    originalBotToken = process.env.BOT_TOKEN;
    originalDemoMode = process.env.DEMO_MODE;
    process.env.NODE_ENV = 'production';
    process.env.BOT_TOKEN = BOT_TOKEN;
    delete process.env.DEMO_MODE;

    const base = structuredClone(originalUsers[0]);
    appState.users = [
      { ...base, id: 301, telegram_id: 9301, display_name: 'Family 31', family_id: 31, family_role: 'child', is_admin: false },
      { ...base, id: 401, telegram_id: 9401, display_name: 'Family 41', family_id: 41, family_role: 'child', is_admin: false },
    ];

    httpServer = createServer();
    io = new SocketIOServer(httpServer, { transports: ['websocket'] });
    configureSocketServer(io);
    await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
    const address = httpServer.address() as AddressInfo;
    url = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    for (const client of clients) client.close();
    await new Promise<void>((resolve) => io.close(() => resolve()));
    appState.users = originalUsers;
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
    if (originalBotToken === undefined) delete process.env.BOT_TOKEN;
    else process.env.BOT_TOKEN = originalBotToken;
    if (originalDemoMode === undefined) delete process.env.DEMO_MODE;
    else process.env.DEMO_MODE = originalDemoMode;
  });

  function connect(telegramId: number, initData = createSignedInitData(telegramId, BOT_TOKEN)) {
    const client = createClient(url, {
      auth: { tma: initData },
      forceNew: true,
      reconnection: false,
      transports: ['websocket'],
    });
    clients.push(client);
    return client;
  }

  it('rejects a forged handshake', async () => {
    const client = connect(9301, `${createSignedInitData(9301, BOT_TOKEN)}broken`);
    const error = await new Promise<Error>((resolve) => client.once('connect_error', resolve));
    expect(error.message).toContain('Unauthorized');
  });

  it('binds the room to signed identity and ignores a foreign family id', async () => {
    const serverSocketPromise = new Promise<ServerSocket>((resolve) => io.once('connection', resolve));
    const client = connect(9301);
    await new Promise<void>((resolve, reject) => {
      client.once('connect', resolve);
      client.once('connect_error', reject);
    });
    const serverSocket = await serverSocketPromise;

    expect(serverSocket.rooms.has('family:31')).toBe(true);
    expect(serverSocket.rooms.has('family:41')).toBe(false);

    client.emit('join:family', { familyId: 41 });
    await new Promise<void>((resolve) => setTimeout(resolve, 25));

    expect(serverSocket.data.familyId).toBe(31);
    expect(serverSocket.rooms.has('family:31')).toBe(true);
    expect(serverSocket.rooms.has('family:41')).toBe(false);
  });
});
