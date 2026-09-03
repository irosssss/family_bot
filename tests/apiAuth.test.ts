/**
 * Тесты auth-матрицы (SEC-01..04): isAuthEnforced fail-closed, isPublicApiPath,
 * canActOn (SEC-03 IDOR-защита). Env-сценарии через vi.stubEnv.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { AuthedRequest } from '../src/utils/apiAuth';

// apiAuth читает process.env на каждом вызове (не при импорте) —
// поэтому достаточно vi.stubEnv без resetModules.
import * as apiAuth from '../src/utils/apiAuth';

afterEach(() => {
  vi.unstubAllEnvs();
});

const req = (over: Partial<AuthedRequest> = {}): AuthedRequest =>
  ({
    headers: {},
    originalUrl: '/api/tasks',
    ...over,
  } as AuthedRequest);

describe('isAuthEnforced (SEC-04 fail-closed)', () => {
  it('dev (NODE_ENV != production) — auth не принудителен', () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('BOT_TOKEN', 'x');
    expect(apiAuth.isAuthEnforced()).toBe(false);
  });

  it('production + BOT_TOKEN — auth enforced', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('BOT_TOKEN', 'real-token');
    vi.stubEnv('DEMO_MODE', '');
    expect(apiAuth.isAuthEnforced()).toBe(true);
  });

  it('SEC-04: production без BOT_TOKEN — process.exit(1)', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('BOT_TOKEN', '');
    vi.stubEnv('DEMO_MODE', '');
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('EXIT');
    }) as never);
    expect(() => apiAuth.isAuthEnforced()).toThrow('EXIT');
    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
  });

  it('DEMO_MODE=true в production — auth не принудителен (явный opt-out)', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('BOT_TOKEN', '');
    vi.stubEnv('DEMO_MODE', 'true');
    expect(apiAuth.isAuthEnforced()).toBe(false);
  });
});

describe('isPublicApiPath', () => {
  it('публичные пути: health, webhook, auth/verify, auth/register', () => {
    expect(apiAuth.isPublicApiPath('/api/health')).toBe(true);
    expect(apiAuth.isPublicApiPath('/api/webhook/telegram')).toBe(true);
    expect(apiAuth.isPublicApiPath('/api/auth/verify')).toBe(true);
    expect(apiAuth.isPublicApiPath('/api/auth/register')).toBe(true);
  });

  it('SEC-02: /api/integrations НЕ публичный', () => {
    expect(apiAuth.isPublicApiPath('/api/integrations/drive/backup')).toBe(false);
  });

  it('игровые роутеры не публичные', () => {
    expect(apiAuth.isPublicApiPath('/api/tasks')).toBe(false);
    expect(apiAuth.isPublicApiPath('/api/state')).toBe(false);
    expect(apiAuth.isPublicApiPath('/api/users')).toBe(false);
  });
});

describe('canActOn (SEC-03)', () => {
  it('себе — можно', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('BOT_TOKEN', 'tok');
    const r = req({ auth: { userId: 1, telegramId: 100, user: {} as never, isAdmin: false } });
    expect(apiAuth.canActOn(r, 1)).toBe(true);
  });

  it('чужому без admin — нельзя (IDOR закрыт)', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('BOT_TOKEN', 'tok');
    const r = req({ auth: { userId: 1, telegramId: 100, user: {} as never, isAdmin: false } });
    expect(apiAuth.canActOn(r, 2)).toBe(false);
  });

  it('родителю (isAdmin) за ребёнка — можно', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('BOT_TOKEN', 'tok');
    const r = req({ auth: { userId: 3, telegramId: 300, user: {} as never, isAdmin: true } });
    expect(apiAuth.canActOn(r, 1)).toBe(true);
  });

  it('без req.auth — нельзя', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('BOT_TOKEN', 'tok');
    expect(apiAuth.canActOn(req(), 1)).toBe(false);
  });

  it('в dev (auth не enforced) — все проверки пропущены', () => {
    vi.stubEnv('NODE_ENV', 'development');
    expect(apiAuth.canActOn(req(), 999)).toBe(true);
  });
});
