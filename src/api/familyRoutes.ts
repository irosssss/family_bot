/**
 * Family Routes (Этап 9): получение состояния семьи + ночная контратака.
 *
 * GET  /api/family/:id             → { id, family_code, name, family_hp, max_family_hp, exhausted_until }
 * POST /api/family/:id/apply-damage { damage } → уменьшает family_hp, если ≤0 — устанавливает exhausted_until
 * POST /api/family/:id/heal { amount } → восстанавливает family_hp (для будущих фич, не используется сейчас)
 */
import { Response, Router } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import * as schema from '../db/schema';
import { appState } from '../services/stateService';
import { getFamilyGameState } from '../services/familyGameStateService';
import {
  canAccessFamily,
  canAccessUser,
  canAdministerFamily,
  getUserFamilyId,
  isAuthEnforced,
  type AuthedRequest,
} from '../utils/apiAuth';

export const familyRoutes = Router();

/**
 * GET /api/family/code/:id — код семьи пользователя (для показа родителю
 * и ввода новым участником). ARC-02: код берётся из БД, не из хардкода.
 */
familyRoutes.get('/code/:userId', async (req: AuthedRequest, res: Response) => {
  try {
    const userId = Number(req.params.userId);
    const user = appState.users.find((u) => u.id === userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!canAccessUser(req, userId)) return res.status(403).json({ error: 'Forbidden: not your family' });

    const familyId = getUserFamilyId(user);
    if (familyId === null) return res.status(404).json({ error: 'Family not found' });
    if (!canAdministerFamily(req, familyId)) {
      return res.status(403).json({ error: 'Forbidden: family admin required' });
    }
    let code = getFamilyGameState(familyId)?.family.family_code || '';
    try {
      const famRows = await db.select().from(schema.families)
        .where(eq(schema.families.id, familyId)).limit(1);
      if (famRows.length > 0) code = famRows[0].family_code;
    } catch (error) {
      if (isAuthEnforced()) throw error;
    }
    if (!code) return res.status(404).json({ error: 'Family not found' });
    res.json({ family_code: code });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/** Получить текущее состояние семьи. ARC-02: только своя семья (или любая в dev). */
familyRoutes.get('/:id', async (req: AuthedRequest, res: Response) => {
  try {
    const familyId = Number(req.params.id);
    if (!Number.isInteger(familyId) || familyId <= 0) return res.status(400).json({ error: 'Invalid family id' });
    if (!canAccessFamily(req, familyId)) return res.status(403).json({ error: 'Forbidden: not your family' });
    const rows = await db.select().from(schema.families).where(eq(schema.families.id, familyId)).limit(1);
    if (rows.length === 0) {
      // Fallback на appState
      const cached = getFamilyGameState(familyId)?.family;
      if (cached) {
        return res.json(cached);
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
    const gameState = getFamilyGameState(familyId);
    if (gameState) {
      gameState.family = family;
    }
    res.json(family);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/** Нанести урон Family HP (внутренний — вызывается из cron и taskService) */
familyRoutes.post('/:id/apply-damage', async (req: AuthedRequest, res: Response) => {
  try {
    const familyId = Number(req.params.id);
    if (!Number.isInteger(familyId) || familyId <= 0) return res.status(400).json({ error: 'Invalid family id' });
    if (!canAdministerFamily(req, familyId)) {
      return res.status(403).json({ error: 'Forbidden: family admin required' });
    }
    const damage = Math.max(0, Number(req.body.damage || 0));
    if (damage === 0) {
      return res.json({
        success: true,
        damage: 0,
        family_hp: getFamilyGameState(familyId)?.family.family_hp ?? 100,
      });
    }

    const persisted = await db.transaction(async (tx) => {
      const [family] = await tx.select().from(schema.families)
        .where(eq(schema.families.id, familyId)).for('update').limit(1);
      if (!family) return null;
      let hp = family.family_hp ?? 100;
      const maxHp = family.max_family_hp ?? 100;
      let exhaustedUntil: Date | null = family.exhausted_until ?? null;
      if (exhaustedUntil && exhaustedUntil < new Date()) exhaustedUntil = null;
      hp = Math.max(0, hp - damage);
      let justExhausted = false;
      if (hp <= 0) {
        hp = maxHp;
        exhaustedUntil = new Date(Date.now() + 24 * 60 * 60 * 1000);
        justExhausted = true;
      }
      await tx.update(schema.families)
        .set({ family_hp: hp, exhausted_until: exhaustedUntil })
        .where(eq(schema.families.id, familyId));
      return { hp, maxHp, exhaustedUntil, justExhausted };
    });
    if (!persisted) {
      return res.status(404).json({ error: 'Семья не найдена' });
    }
    const { hp, maxHp, exhaustedUntil, justExhausted } = persisted;

    const gameState = getFamilyGameState(familyId);
    if (gameState) {
      gameState.family.family_hp = hp;
      gameState.family.exhausted_until = exhaustedUntil ? exhaustedUntil.toISOString() : null;
    }

    // Broadcast событие через io (получим через app.get('io') в server.ts)
    const io = req.app.get('io');
    if (io) {
      io.to(`family:${familyId}`).emit('family:hp_changed', {
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
familyRoutes.get('/:id/exhausted', async (req: AuthedRequest, res: Response) => {
  try {
    const familyId = Number(req.params.id);
    if (!Number.isInteger(familyId) || familyId <= 0) return res.status(400).json({ error: 'Invalid family id' });
    if (!canAccessFamily(req, familyId)) return res.status(403).json({ error: 'Forbidden: not your family' });
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
