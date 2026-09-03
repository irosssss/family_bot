/**
 * Глобальный API-guard: Telegram Mini App initData (HMAC через bot token).
 *
 * Модель:
 *  - Фронт шлёт заголовок `Authorization: tma <initData>` (см. src/utils/apiFetch.ts).
 *  - Middleware верифицирует подпись и резолвит игрового пользователя по telegram_id.
 *  - req.auth = { userId, telegramId, user, isAdmin } — роутеры читают отсюда.
 *  - DEMO MODE (нет BOT_TOKEN): контроль отключён — сохраняется поведение песочницы
 *    (npm run dev без .env должен работать как раньше).
 *  - Публичные пути: /api/health, /api/webhook/* (свои проверки secret-token),
 *    /api/integrations/* (свой Google Bearer), /api/auth/verify и /api/auth/register
 *    (вход до появления сессии).
 */
import { NextFunction, Request, Response } from 'express';
import { validateTelegramWebAppData, parseInitDataUser } from './telegramAuth';
import { appState } from '../services/stateService';
import type { User } from '../types';

export interface ApiAuth {
  userId: number;
  telegramId: number;
  user: User;
  isAdmin: boolean;
}

export interface AuthedRequest extends Request {
  auth?: ApiAuth;
}

/** Пути, доступные без tma-заголовка (webhooks, health, auth-вход).
 *  SEC-02 FIX: /api/integrations/* УДАЛЕН из публичных — требует tma + admin
 *  (свой Bearer Google остаётся, но поверх обязательной tma-сессии). */
export const PUBLIC_API_PREFIXES = [
  '/api/health',
  '/api/webhook/',
  '/api/auth/verify',
  '/api/auth/register',
];

export function isPublicApiPath(originalUrl: string): boolean {
  const pathOnly = originalUrl.split('?')[0];
  return PUBLIC_API_PREFIXES.some((p) => pathOnly === p || pathOnly.startsWith(p));
}

/**
 * Auth принудителен ТОЛЬКО в production (NODE_ENV=production, как в Docker).
 * В dev (npm run dev) API остаётся открытым — браузерное тестирование без
 * Telegram работает как раньше.
 *
 * SEC-04 FIX (fail-closed): в production без BOT_TOKEN — упать на старте,
 * а не открывать API всем. DEMO включается явным DEMO_MODE=true.
 */
export function isAuthEnforced(): boolean {
  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) return false;
  if (process.env.DEMO_MODE === 'true') return false;
  if (!process.env.BOT_TOKEN) {
    // Fail-closed: ошибка конфигурации не должна превращаться в открытый API.
    console.error('[auth] FATAL: NODE_ENV=production без BOT_TOKEN. Задай BOT_TOKEN или DEMO_MODE=true.');
    process.exit(1);
  }
  return true;
}

/**
 * Глобальный middleware для всех /api/*, кроме публичных путей.
 * В DEMO MODE пропускает всех (req.auth остаётся undefined).
 */
export function globalApiAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  if (isPublicApiPath(req.originalUrl)) return next();
  if (!isAuthEnforced()) return next();

  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('tma ')) {
    return res.status(401).json({ error: 'Unauthorized: missing tma credentials' });
  }
  const initData = authHeader.slice(4).trim();
  const botToken = process.env.BOT_TOKEN as string;

  if (!validateTelegramWebAppData(initData, botToken)) {
    return res.status(403).json({ error: 'Forbidden: invalid initData signature' });
  }

  const tgUser = parseInitDataUser(initData);
  if (!tgUser) {
    return res.status(403).json({ error: 'Forbidden: no user in initData' });
  }

  const user = appState.users.find((u) => u.telegram_id === tgUser.id);
  if (!user) {
    return res.status(403).json({ error: 'Forbidden: unknown user, complete registration first' });
  }

  req.auth = {
    userId: user.id,
    telegramId: user.telegram_id,
    user,
    isAdmin: user.is_admin || user.family_role === 'parent',
  };
  next();
}

/** Мутации /api/users/* и загрузка ассетов — только parent/admin. */
export function requireAdmin(req: AuthedRequest): boolean {
  if (!isAuthEnforced()) return true;
  return !!req.auth?.isAdmin;
}

/**
 * Мутация от имени targetUserId разрешена, если подписана этим же пользователем
 * или родителем (родители сами не играют — им можно управлять детьми).
 */
export function canActOn(req: AuthedRequest, targetUserId: number): boolean {
  if (!isAuthEnforced()) return true;
  if (!req.auth) return false;
  return req.auth.userId === targetUserId || req.auth.isAdmin;
}
