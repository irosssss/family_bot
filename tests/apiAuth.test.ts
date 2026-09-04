/**
 * Тесты auth-матрицы (SEC-01..04): isAuthEnforced fail-closed, isPublicApiPath,
 * canActOn (SEC-03 IDOR-защита). Env-сценарии через vi.stubEnv.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { AuthedRequest } from '../src/utils/apiAuth';
import type { User } from '../src/types';
import { appState } from '../src/services/stateService';

// apiAuth читает process.env на каждом вызове (не при импорте) —
// поэтому достаточно vi.stubEnv без resetModules.
import * as apiAuth from '../src/utils/apiAuth';

const originalUsers = appState.users;

const familyUser = (id: number, familyId: number, isAdmin = false): User => ({
  id,
  telegram_id: 1000 + id,
  family_id: familyId,
  display_name: `User ${id}`,
  family_role: isAdmin ? 'parent' : 'child',
  is_admin: isAdmin,
  assignee: 'both',
  gold: 0,
  xp: 0,
  current_streak: 0,
  class: isAdmin ? '' : 'warrior',
  skill_date: null,
  notify_partner: 1,
  equipped: {},
  pets: [],
});

beforeEach(() => {
  appState.users = [familyUser(1, 10), familyUser(2, 20), familyUser(3, 10, true)];
});

afterEach(() => {
  vi.unstubAllEnvs();
  appState.users = originalUsers;
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

  it('не считает похожие префиксы публичными', () => {
    expect(apiAuth.isPublicApiPath('/api/healthcheck')).toBe(false);
    expect(apiAuth.isPublicApiPath('/api/auth/verify-anything')).toBe(false);
    expect(apiAuth.isPublicApiPath('/api/auth/register-anything')).toBe(false);
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
    const r = req({ auth: { userId: 1, telegramId: 100, user: familyUser(1, 10), isAdmin: false } });
    expect(apiAuth.canActOn(r, 1)).toBe(true);
  });

  it('чужому без admin — нельзя (IDOR закрыт)', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('BOT_TOKEN', 'tok');
    const r = req({ auth: { userId: 1, telegramId: 100, user: familyUser(1, 10), isAdmin: false } });
    expect(apiAuth.canActOn(r, 2)).toBe(false);
  });

  it('родителю (isAdmin) за ребёнка — можно', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('BOT_TOKEN', 'tok');
    const r = req({ auth: { userId: 3, telegramId: 300, user: familyUser(3, 10, true), isAdmin: true } });
    expect(apiAuth.canActOn(r, 1)).toBe(true);
  });

  it('родителю нельзя управлять ребёнком из другой семьи', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('BOT_TOKEN', 'tok');
    const r = req({ auth: { userId: 3, telegramId: 300, user: familyUser(3, 10, true), isAdmin: true } });
    expect(apiAuth.canActOn(r, 2)).toBe(false);
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

describe('family isolation', () => {
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('BOT_TOKEN', 'tok');
  });

  it('член семьи может читать профиль другого члена той же семьи', () => {
    const r = req({ auth: { userId: 1, telegramId: 101, user: familyUser(1, 10), isAdmin: false } });
    expect(apiAuth.canAccessUser(r, 3)).toBe(true);
  });

  it('член семьи не может читать профиль другой семьи', () => {
    const r = req({ auth: { userId: 1, telegramId: 101, user: familyUser(1, 10), isAdmin: false } });
    expect(apiAuth.canAccessUser(r, 2)).toBe(false);
  });

  it('admin не получает доступ к чужой семье', () => {
    const r = req({ auth: { userId: 3, telegramId: 103, user: familyUser(3, 10, true), isAdmin: true } });
    expect(apiAuth.canAccessFamily(r, 10)).toBe(true);
    expect(apiAuth.canAdministerFamily(r, 10)).toBe(true);
    expect(apiAuth.canAccessFamily(r, 20)).toBe(false);
    expect(apiAuth.canAdministerFamily(r, 20)).toBe(false);
  });
});
