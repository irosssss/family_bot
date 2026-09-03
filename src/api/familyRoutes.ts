/**
 * Family Routes (Этап 9): получение состояния семьи + ночная контратака.
 *
 * GET  /api/family/:id             → { id, family_code, name, family_hp, max_family_hp, exhausted_until }
 * POST /api/family/:id/apply-damage { damage } → уменьшает family_hp, если ≤0 — устанавливает exhausted_until
 * POST /api/family/:id/heal { amount } → восстанавливает family_hp (для будущих фич, не используется сейчас)
 */
import { Request, Response, Router } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import * as schema from '../db/schema';
import { appState } from '../services/stateService';
import { AuthedRequest, isAuthEnforced } from '../utils/apiAuth';

export const familyRoutes = Router();

/**
 * GET /api/family/code/:id — код семьи пользователя (для показа родителю
 * и ввода новым участником). ARC-02: код берётся из БД, не из хардкода.
 */
familyRoutes.get('/code/:userId', async (req: Request, res: Response) => {
  try {
    const userId = Number(req.params.userId);
    const user = appState.users.find((u) => u.id === userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    let code = 'FAM-1234'; // dev-fallback (существующая демо-семья)
    try {
      const famRows = await db.select().from(schema.families)
        .where(eq(schema.families.id, (user as any).family_id ?? 1)).limit(1);
      if (famRows.length > 0) code = famRows[0].family_code;
    } catch {
      // БД недоступна — fallback
    }
    res.json({ family_code: code });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/** Получить текущее состояние семьи. ARC-02: только своя семья (или любая в dev). */
familyRoutes.get('/:id', async (req: AuthedRequest, res: Response) => {
  try {
    const familyId = Number(req.params.id);
    // В production пользователь видит только свою семью
    if (isAuthEnforced() && req.auth) {
      const authFamilyId = (req.auth.user as any).family_id ?? 1;
      if (familyId !== authFamilyId && !req.auth.isAdmin) {
        return res.status(403).json({ error: 'Forbidden: not your family' });
      }
    }
    const rows = await db.select().from(schema.families).where(eq(schema.families.id, familyId)).limit(1);
    if (rows.length === 0) {
      // Fallback на appState
      if (appState.family && appState.family.id === familyId) {
        return res.json(appState.family);
      }
      return res.status(404).json({ error: 'Семья не найдена' });
    }
    const f = rows[0];
    const family = {
      id: f.id,
      family_code: f.family_code,
      name: f.name,
      family_hp: f.family_hp ?? 100,
      max_family_hp: f.max_family_hp ?? 100,
      exhausted_until: f.exhausted_until ? f.exhausted_until.toISOString() : null,
    };
    // Синхронизируем с appState для синхронного доступа в taskService
    if (appState.family) {
      appState.family.id = family.id;
      appState.family.family_code = family.family_code;
      appState.family.name = family.name;
      appState.family.family_hp = family.family_hp;
      appState.family.max_family_hp = family.max_family_hp;
      appState.family.exhausted_until = family.exhausted_until;
    }
    res.json(family);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/** Нанести урон Family HP (внутренний — вызывается из cron и taskService) */
familyRoutes.post('/:id/apply-damage', async (req: Request, res: Response) => {
  try {
    const familyId = Number(req.params.id);
    const damage = Math.max(0, Number(req.body.damage || 0));
    if (damage === 0) {
      return res.json({ success: true, damage: 0, family_hp: appState.family?.family_hp ?? 100 });
    }

    const rows = await db.select().from(schema.families).where(eq(schema.families.id, familyId)).limit(1);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Семья не найдена' });
    }
    const f = rows[0];
    let hp = f.family_hp ?? 100;
    let maxHp = f.max_family_hp ?? 100;
    let exhaustedUntil: Date | null = f.exhausted_until ?? null;

    // Снимаем истощение если вышло
    if (exhaustedUntil && exhaustedUntil < new Date()) {
      exhaustedUntil = null;
    }

    hp = Math.max(0, hp - damage);
    let justExhausted = false;

    if (hp <= 0) {
      // Семья истощена: hp сбрасываем в max, ставим exhaustedUntil = +24ч
      hp = maxHp;
      exhaustedUntil = new Date(Date.now() + 24 * 60 * 60 * 1000);
      justExhausted = true;
    }

    await db.update(schema.families)
      .set({ family_hp: hp, exhausted_until: exhaustedUntil })
      .where(eq(schema.families.id, familyId))
      .catch((e) => console.error('Family HP update error:', e));

    if (appState.family) {
      appState.family.family_hp = hp;
      appState.family.exhausted_until = exhaustedUntil ? exhaustedUntil.toISOString() : null;
    }

    // Broadcast событие через io (получим через app.get('io') в server.ts)
    const io = req.app.get('io');
    if (io) {
      io.emit('family:hp_changed', {
        familyId,
        hp,
        maxHp,
        exhaustedUntil: exhaustedUntil ? exhaustedUntil.toISOString() : null,
        justExhausted,
      });
    }

    res.json({
      success: true,
      damage,
      family_hp: hp,
      max_family_hp: maxHp,
      exhausted_until: exhaustedUntil ? exhaustedUntil.toISOString() : null,
      justExhausted,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/** Проверить, активен ли статус «Истощение» (хелпер для UI/тестов) */
familyRoutes.get('/:id/exhausted', async (req: Request, res: Response) => {
  try {
    const familyId = Number(req.params.id);
    const rows = await db.select().from(schema.families).where(eq(schema.families.id, familyId)).limit(1);
    if (rows.length === 0) return res.status(404).json({ error: 'Семья не найдена' });
    const f = rows[0];
    const isExhausted = !!(f.exhausted_until && f.exhausted_until > new Date());
    res.json({
      isExhausted,
      exhaustedUntil: f.exhausted_until ? f.exhausted_until.toISOString() : null,
      family_hp: f.family_hp ?? 100,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});
