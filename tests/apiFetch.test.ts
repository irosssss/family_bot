import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiFetch } from '../src/utils/apiFetch';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('apiFetch', () => {
  it('adds signed Telegram initData to every request without replacing caller headers', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}'));
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('window', {
      Telegram: { WebApp: { initData: 'user=encoded&hash=signed' } },
    });

    await apiFetch('/api/tasks/complete', {
      method: 'POST',
      headers: { 'X-Request-ID': 'test-request' },
      json: { taskId: 7 },
    });

    const [, init] = fetchMock.mock.calls[0];
    const headers = init.headers as Headers;
    expect(headers.get('Authorization')).toBe('tma user=encoded&hash=signed');
    expect(headers.get('Content-Type')).toBe('application/json');
    expect(headers.get('X-Request-ID')).toBe('test-request');
    expect(init.body).toBe(JSON.stringify({ taskId: 7 }));
  });
});
