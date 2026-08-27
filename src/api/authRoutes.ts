/**
 * Роуты аутентификации.
 * POST /api/auth/verify — проверка Telegram WebApp initData.
 * POST /api/auth/register — регистрация пользователя (Этап R1).
 */
import { Request, Response, Router } from 'express';
import { telegramAuthMiddleware } from '../utils/telegramAuth';
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
 * Регистрация пользователя.
 * body: { telegram_id, display_name, family_role?, age?, gender?, invite_code? }
 * Если первый пользователь → parent (admin), остальные по invite → child.
 */
authRoutes.post('/register', async (req: Request, res: Response) => {
  try {
    const { telegram_id, display_name, family_role, age, gender, invite_code } = req.body;

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

    // Первый пользователь — родитель (admin). Остальные — дети.
    const isFirstUser = appState.users.length === 0;
    const effectiveRole: 'parent' | 'child' =
      isFirstUser ? 'parent' : (family_role === 'parent' ? 'parent' : 'child');
    const isAdmin = isFirstUser;

    const newId = Math.max(...appState.users.map((u) => u.id), 0) + 1;
    const tgId = Number(telegram_id) || (100000 + newId);

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
