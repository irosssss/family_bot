import { test } from 'vitest';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { request as httpRequest } from 'node:http';
import { createTelegramPreviewApp } from '../src/preview/app';

test('Telegram preview rejects forged access, isolates testers and deduplicates actions', async () => {
  const botToken = '123456:synthetic_test_token';
  const origin = 'https://preview.example';
  const now = Date.now();
  function auth(id: number, age = 0) {
    const fields = new URLSearchParams({ auth_date: String(Math.floor(now / 1000) - age), user: JSON.stringify({ id, first_name: 'Tester' }) });
    const check = [...fields].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join('\n');
    fields.set('hash', createHmac('sha256', createHmac('sha256', 'WebAppData').update(botToken).digest()).update(check).digest('hex'));
    return `tma ${fields}`;
  }
  const server = createTelegramPreviewApp({ botToken, origin, directory: '/private/tmp/nonexistent-preview-dir', now: () => now }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  async function request(route = '/api/demo/state', authorization?: string, body?: unknown, requestOrigin = origin) {
    return new Promise<Response>((resolve, reject) => {
    const req = httpRequest(base + route, { method: body ? 'POST' : 'GET', headers: { Host: 'preview.example', Origin: requestOrigin,
      ...(authorization ? { Authorization: authorization } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    }, response => {
      const chunks: Buffer[] = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => resolve(new Response(Buffer.concat(chunks), { status: response.statusCode, headers: response.headers as Record<string, string> })));
    });
    req.on('error', reject); req.end(body ? JSON.stringify(body) : undefined);
    });
  }
  try {
    assert.equal((await request()).status, 401);
    assert.equal((await request(undefined, auth(101) + 'x')).status, 401);
    assert.equal((await request(undefined, auth(101, 7201))).status, 401);
    assert.equal((await request(undefined, auth(101), undefined, 'https://foreign.example')).status, 403);
    assert.equal((await request('/api/users', auth(101))).status, 404);
    const first = await request(undefined, auth(101));
    assert.equal(first.headers.get('cache-control'), 'no-store');
    const { state } = await first.json();
    const child = state.users.find((user: { role: string }) => user.role === 'child');
    const task = state.tasks.find((task: { enabled: boolean; assigneeIds: string[] }) => task.enabled && (!task.assigneeIds.length || task.assigneeIds.includes(child.id)));
    const action = { action: 'completeTask', actorId: child.id, taskId: task.id, requestId: 'preview-check-1' };
    const changed = await request('/api/demo/action', auth(101), action);
    assert.equal(changed.status, 200);
    const updated = await changed.json();
    assert.equal(updated.state.revision, state.revision + 1);
    const retry = await (await request('/api/demo/action', auth(101), action)).json();
    assert.equal(retry.state.revision, updated.state.revision);
    const other = await (await request(undefined, auth(102))).json();
    assert.equal(other.state.revision, state.revision);
    assert.equal((await request('/api/demo/action', auth(101), { action: 'saveCatalog' })).status, 403);
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});
