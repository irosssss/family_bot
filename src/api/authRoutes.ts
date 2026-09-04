/**
 * Роуты аутентификации.
 * POST /api/auth/verify — проверка Telegram WebApp initData.
 * POST /api/auth/register — регистрация пользователя (Этап R1).
 */
import { Request, Response, Router } from 'express';
import { count, eq } from 'drizzle-orm';
import { telegramAuthMiddleware, validateTelegramWebAppData, parseInitDataUser } from '../utils/telegramAuth';
import { appState } from '../services/stateService';
import { db } from '../db';
import * as schema from '../db/schema';
import { toStateUser } from '../services/userStateHydration';

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
    const { display_name, age, gender, classKey, character_color, customAvatarUrl } = req.body;

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

    const existingUsers = await db.select({ total: count() }).from(schema.users);
    const isFirstUser = Number(existingUsers[0]?.total || 0) === 0;
    const existingNames = await db.select({ display_name: schema.users.display_name }).from(schema.users);
    if (existingNames.some((u) => u.display_name.trim().toLowerCase() === trimmedName.toLowerCase())) {
      return res.status(400).json({ error: 'Имя уже занято' });
    }

    // SEC-01: role НЕ из body. Первый persisted-пользователь — parent/admin.
    // Нельзя выводить это из appState: в dev там могут быть демо-персонажи,
    // а после рестарта кэш лишь зеркало PostgreSQL.
    const effectiveRole: 'parent' | 'child' = isFirstUser ? 'parent' : 'child';
    const isAdmin = isFirstUser;

    // ARC-02: family_id резолвится по invite-коду (family_code), а не хардкод 1.
    // Первый пользователь создаёт семью с новым кодом, остальные вступают по коду.
    let familyId: number;
    const inviteCode = typeof req.body.invite_code === 'string' ? req.body.invite_code.trim() : '';
    let familyCode = inviteCode;
    if (isFirstUser) {
      try {
        familyCode = `FAM-${Date.now().toString(36).toUpperCase().slice(-6)}`;
        const created = await db.insert(schema.families)
          .values({ family_code: familyCode, name: `Семья ${trimmedName}` })
          .returning({ id: schema.families.id });
        if (created.length === 0) throw new Error('Family creation returned no row');
        familyId = created[0].id;
      } catch (e) {
        console.error('[auth/register] family create failed:', e);
        return res.status(500).json({ error: 'Не удалось создать семью. Попробуйте ещё раз.' });
      }
    } else {
      if (!inviteCode) {
        return res.status(400).json({ error: 'Для входа в существующую семью укажите код семьи.' });
      }
      try {
        const fam = await db.select().from(schema.families)
          .where(eq(schema.families.family_code, inviteCode)).limit(1);
        if (fam.length > 0) {
          familyId = fam[0].id;
          familyCode = fam[0].family_code;
        } else {
          return res.status(404).json({ error: 'Код семьи не найден. Проверьте код у родителя.' });
        }
      } catch (e) {
        console.error('[auth/register] family lookup failed:', e);
        return res.status(500).json({ error: 'Не удалось проверить код семьи. Попробуйте ещё раз.' });
      }
    }

    // dev-фолбэк: без tma берём telegram_id из body (dev-песочница)
    const tgId = tgIdFromAuth ?? (Number(req.body.telegram_id) || 100000 + Date.now() % 100000);

    // PostgreSQL создаёт id; только после успешной вставки обновляем кэш.
    try {
      const [createdUser] = await db.insert(schema.users).values({
        telegram_id: tgId,
        family_id: familyId,
        role: effectiveRole === 'parent' ? 'parent' : 'child',
        family_role: effectiveRole,
        is_admin: isAdmin,
        display_name: trimmedName,
        class_type: isFirstUser ? 'warrior' : (classKey || 'warrior'),
        gold: isFirstUser ? 0 : 50,
        xp: 0,
        crystals: isFirstUser ? 0 : 10,
        hp: 50,
        max_hp: 50,
        mp: 30,
        max_mp: 30,
        current_streak: 0,
        best_streak: 0,
        streak_status: isFirstUser ? 'paused' : 'active',
        gender: gender === 'female' ? 'female' : gender === 'male' ? 'male' : undefined,
        character_color: character_color,
        custom_avatar_url: customAvatarUrl,
        assignee: 'both',
        notify_partner: 1,
        age: age && Number(age) > 0 ? Number(age) : 8,
      }).returning();
      if (!createdUser) throw new Error('User creation returned no row');
      const newUser = toStateUser(createdUser);
      appState.users.push(newUser);
      res.json({
        success: true,
        user: newUser,
        family_id: familyId,
        family_code: familyCode,
        message: isFirstUser
          ? 'Вы — первый пользователь. Назначены родителем (админом).'
          : 'Регистрация успешна. Роль: ребёнок.',
      });
    } catch (e) {
      console.error('[auth/register] DB insert failed:', e);
      return res.status(500).json({ success: false, error: 'Ошибка базы данных, попробуйте ещё раз' });
    }
  } catch (error: any) {
    console.error('Error in auth register:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});
