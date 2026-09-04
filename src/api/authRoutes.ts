/**
 * Роуты аутентификации.
 * POST /api/auth/verify — проверка Telegram WebApp initData.
 * POST /api/auth/register — регистрация пользователя (Этап R1).
 */
import { Request, Response, Router } from 'express';
import crypto from 'crypto';
import { eq } from 'drizzle-orm';
import { telegramAuthMiddleware, validateTelegramWebAppData, parseInitDataUser } from '../utils/telegramAuth';
import { appState } from '../services/stateService';
import { db } from '../db';
import * as schema from '../db/schema';
import { toStateUser } from '../services/userStateHydration';
import { isAuthEnforced } from '../utils/apiAuth';
import { INITIAL_CHALLENGES, INITIAL_TASKS } from '../data/initialData';
import { getWeekKey } from '../lib/dateUtils';
import { getWeeklyBoss } from '../utils/habiticaCatalog';
import { hydrateFamilyGameStatesFromDb } from '../services/familyGameStateService';

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
 *  - family_role из body ИГНОРИРУЕТСЯ: без invite создаётся новая семья и
 *    parent/admin; по invite пользователь входит ребёнком.
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

    if (isAuthEnforced() && !tgIdFromAuth) {
      return res.status(401).json({ error: 'Требуется авторизация Telegram (tma initData)' });
    }

    if (!display_name || typeof display_name !== 'string' || !display_name.trim()) {
      return res.status(400).json({ error: 'Укажите имя' });
    }
    const trimmedName = display_name.trim();

    // dev-фолбэк: без tma берём telegram_id из body (локальная песочница).
    const tgId = tgIdFromAuth ?? (Number(req.body.telegram_id) || 100000 + Date.now() % 100000);
    const [existingUser] = await db.select().from(schema.users)
      .where(eq(schema.users.telegram_id, tgId)).limit(1);
    if (existingUser) {
      const [existingFamily] = existingUser.family_id
        ? await db.select().from(schema.families)
          .where(eq(schema.families.id, existingUser.family_id)).limit(1)
        : [];
      return res.json({
        success: true,
        already_registered: true,
        user: toStateUser(existingUser),
        family_id: existingUser.family_id,
        family_code: existingFamily?.family_code ?? null,
      });
    }

    // ARC-02: invite → ребёнок существующей семьи; пустой invite → новая семья
    // и родитель. Так каждая семья получает собственного администратора.
    const inviteCode = typeof req.body.invite_code === 'string' ? req.body.invite_code.trim() : '';
    try {
      const created = await db.transaction(async (tx) => {
        let familyId: number;
        let familyCode = inviteCode;
        const effectiveRole: 'parent' | 'child' = inviteCode ? 'child' : 'parent';

        if (inviteCode) {
          const [family] = await tx.select().from(schema.families)
            .where(eq(schema.families.family_code, inviteCode)).limit(1);
          if (!family) throw Object.assign(new Error('FAMILY_NOT_FOUND'), { status: 404 });
          familyId = family.id;
          familyCode = family.family_code;
        } else {
          familyCode = `FAM-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
          const [family] = await tx.insert(schema.families)
            .values({ family_code: familyCode, name: `Семья ${trimmedName}` })
            .returning({ id: schema.families.id });
          if (!family) throw new Error('Family creation returned no row');
          familyId = family.id;

          await tx.insert(schema.tasks).values(INITIAL_TASKS.map((task) => ({
            family_id: familyId,
            code: task.code,
            title: task.title,
            description: task.description ?? '',
            points: task.points,
            assignee: task.assignee,
            task_type: task.task_type,
            day_of_week: Array.isArray(task.day_of_week) ? null : task.day_of_week,
            done: false,
            category: task.category,
            assignee_type: task.assignee_type,
            age_min: task.age_min,
            age_max: task.age_max,
            schedule_type: task.schedule_type,
            is_required: task.is_required,
            is_repeatable: task.is_repeatable,
            max_daily: task.max_daily,
            icon: task.icon,
            recommended_class: task.recommendedClass,
            value: task.value,
          })));

          const weeklyBoss = getWeeklyBoss();
          await tx.insert(schema.bosses).values({
            family_id: familyId,
            week_key: getWeekKey(),
            name: weeklyBoss.name,
            emoji: '',
            sprite_url: weeklyBoss.spriteUrl,
            max_hp: 90,
            hp: 90,
            damage: 0,
            defeated: 0,
          });
          await tx.insert(schema.family_challenges).values({
            family_id: familyId,
            challenge_code: INITIAL_CHALLENGES[0].code,
            progress: 0,
            completed: false,
          });
        }

        const familyUsers = await tx.select({ display_name: schema.users.display_name })
          .from(schema.users).where(eq(schema.users.family_id, familyId));
        if (familyUsers.some((user) => user.display_name.trim().toLowerCase() === trimmedName.toLowerCase())) {
          throw Object.assign(new Error('NAME_TAKEN'), { status: 409 });
        }

        const [createdUser] = await tx.insert(schema.users).values({
          telegram_id: tgId,
          family_id: familyId,
          role: effectiveRole,
          family_role: effectiveRole,
          is_admin: effectiveRole === 'parent',
          display_name: trimmedName,
          class_type: effectiveRole === 'parent' ? 'warrior' : (classKey || 'warrior'),
          gold: effectiveRole === 'parent' ? 0 : 50,
          xp: 0,
          crystals: effectiveRole === 'parent' ? 0 : 10,
          hp: 50,
          max_hp: 50,
          mp: 30,
          max_mp: 30,
          current_streak: 0,
          best_streak: 0,
          streak_status: effectiveRole === 'parent' ? 'paused' : 'active',
          gender: gender === 'female' ? 'female' : gender === 'male' ? 'male' : undefined,
          character_color,
          custom_avatar_url: customAvatarUrl,
          assignee: 'both',
          notify_partner: 1,
          age: age && Number(age) > 0 ? Number(age) : 8,
        }).returning();
        if (!createdUser) throw new Error('User creation returned no row');
        const referralCode = `ref_${createdUser.id}`;
        await tx.update(schema.users).set({ referral_code: referralCode })
          .where(eq(schema.users.id, createdUser.id));
        return {
          createdUser: { ...createdUser, referral_code: referralCode },
          familyId,
          familyCode,
          effectiveRole,
        };
      });

      const { createdUser, familyId, familyCode, effectiveRole } = created;
      if (!createdUser) throw new Error('User creation returned no row');
      const newUser = toStateUser(createdUser);
      appState.users.push(newUser);
      if (effectiveRole === 'parent') await hydrateFamilyGameStatesFromDb();
      res.json({
        success: true,
        user: newUser,
        family_id: familyId,
        family_code: familyCode,
        message: effectiveRole === 'parent'
          ? 'Новая семья создана. Вы назначены родителем (админом).'
          : 'Регистрация успешна. Роль: ребёнок.',
      });
    } catch (e: any) {
      console.error('[auth/register] DB insert failed:', e);
      if (e?.message === 'FAMILY_NOT_FOUND') {
        return res.status(404).json({ error: 'Код семьи не найден. Проверьте код у родителя.' });
      }
      if (e?.message === 'NAME_TAKEN') {
        return res.status(409).json({ error: 'Имя уже занято в этой семье' });
      }
      return res.status(500).json({ success: false, error: 'Ошибка базы данных, попробуйте ещё раз' });
    }
  } catch (error: any) {
    console.error('Error in auth register:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});
