/**
 * Роуты аутентификации.
 * POST /api/auth/verify — проверка Telegram WebApp initData.
 * POST /api/auth/register — регистрация пользователя (Этап R1).
 */
import { Request, Response, Router } from 'express';
import { telegramAuthMiddleware, validateTelegramWebAppData, parseInitDataUser } from '../utils/telegramAuth';
import { appState } from '../services/stateService';
import { db } from '../db';
import * as schema from '../db/schema';
import type { User } from '../types';

export const authRoutes = Router();

authRoutes.post('/verify', telegramAuthMiddleware, (req: any, res: Response) => {
  res.json({ success: true, user: req.telegramUser, message: 'Успешная авторизация WebApp' });
});

/**
 * POST /api/auth/register
 * Регистрация пользователя (Этап R1).
 *
 * SEC-01 FIX (эскалация привилегий закрыта):
 *  - telegram_id берётся ТОЛЬКО из проверенного initData (заголовок tma),
 *    а не из body — подделать сессию нельзя.
 *  - family_role из body ИГНОРИРУЕТСЯ: первый пользователь семьи — parent,
 *    все последующие — child (родители добавляются существующим родителем).
 *  - В production эндпоинт требует валидный tma-заголовок (фолбэк на
 *    initData в body только в dev для тестов без Telegram).
 */
authRoutes.post('/register', async (req: Request, res: Response) => {
  try {
    const { display_name, age, gender } = req.body;

    // SEC-01: telegram_id ТОЛЬКО из проверенной подписи
    const authHeader = req.headers.authorization || '';
    let tgIdFromAuth: number | null = null;
    if (authHeader.startsWith('tma ')) {
      const initData = authHeader.slice(4).trim();
      const botToken = process.env.BOT_TOKEN as string;
      if (botToken && validateTelegramWebAppData(initData, botToken)) {
        const tgUser = parseInitDataUser(initData);
        if (tgUser) tgIdFromAuth = tgUser.id;
      }
    }

    const isProd = process.env.NODE_ENV === 'production';
    if (isProd && !tgIdFromAuth) {
      return res.status(401).json({ error: 'Требуется авторизация Telegram (tma initData)' });
    }

    if (!display_name || typeof display_name !== 'string' || !display_name.trim()) {
      return res.status(400).json({ error: 'Укажите имя' });
    }
    const trimmedName = display_name.trim();

    const nameExists = appState.users.some(
      (u) => u.display_name.trim().toLowerCase() === trimmedName.toLowerCase()
    );
    if (nameExists) {
      return res.status(400).json({ error: 'Имя уже занято' });
    }

    // SEC-01: role НЕ из body. Первый — parent/admin, остальные — child.
    const isFirstUser = appState.users.length === 0;
    const effectiveRole: 'parent' | 'child' = isFirstUser ? 'parent' : 'child';
    const isAdmin = isFirstUser;

    // dev-фолбэк: без tma берём telegram_id из body (dev-песочница)
    const tgId = tgIdFromAuth ?? (Number(req.body.telegram_id) || 100000 + Date.now() % 100000);

    const newId = Math.max(...appState.users.map((u) => u.id), 0) + 1;

    const newUser: User = {
      id: newId,
      telegram_id: tgId,
      display_name: trimmedName,
      family_role: effectiveRole,
      is_admin: isAdmin,
      assignee: 'both',
      gender: gender === 'female' ? 'female' : gender === 'male' ? 'male' : undefined,
      age: age && Number(age) > 0 ? Number(age) : 8,
      gold: isFirstUser ? 0 : 50,
      xp: 0,
      crystals: isFirstUser ? 0 : 10,
      current_streak: 0,
      best_streak: 0,
      streak_status: isFirstUser ? 'paused' : 'active',
      class: isFirstUser ? '' : 'warrior',
      skill_date: null,
      notify_partner: 1,
      equipped: {},
      pets: [],
    };

    appState.users.push(newUser);

    db.insert(schema.users).values({
      telegram_id: tgId,
      family_id: 1,
      role: effectiveRole === 'parent' ? 'parent' : 'child',
      family_role: effectiveRole,
      is_admin: isAdmin,
      display_name: trimmedName,
      class_type: newUser.class || 'warrior',
      gold: newUser.gold,
      xp: 0,
      crystals: newUser.crystals || 0,
      hp: 50,
      max_hp: 50,
      mp: 30,
      max_mp: 30,
      current_streak: 0,
      best_streak: 0,
      streak_status: newUser.streak_status || 'active',
      gender: newUser.gender,
      assignee: 'both',
      notify_partner: 1,
      age: newUser.age,
    }).execute().catch((e) => console.error('DB Insert error (auth register):', e));

    res.json({
      success: true,
      user: newUser,
      message: isFirstUser
        ? 'Вы — первый пользователь. Назначены родителем (админом).'
        : 'Регистрация успешна. Роль: ребёнок.',
    });
  } catch (error: any) {
    console.error('Error in auth register:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});
