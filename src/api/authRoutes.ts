/**
 * Роуты аутентификации.
 * POST /api/auth/verify — проверка Telegram WebApp initData.
 */
import { Request, Response, Router } from 'express';
import { telegramAuthMiddleware } from '../utils/telegramAuth';

export const authRoutes = Router();

authRoutes.post('/verify', telegramAuthMiddleware, (req: any, res: Response) => {
  res.json({ success: true, user: req.telegramUser, message: 'Успешная авторизация WebApp' });
});
