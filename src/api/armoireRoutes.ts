/**
 * Enchanted Armoire (Этап 6): сундук-казино за 100 золота.
 *
 * Таблица дропа (MASTER_SPECIFICATION §5.2):
 *   45% — Буст опыта (50–150 XP)
 *   25% — Случайная еда для питомца (+15 золота обратно, еда = кормление)
 *   20% — Эксклюзивный предмет Armoire Gear (из habitica/gear/armoire/)
 *   10% — Редкое яйцо питомца (даёт случайное золотое/теневое яйцо)
 */

import { Response, Router } from 'express';
import { type AuthedRequest, canActOn } from '../utils/apiAuth';
import { db } from '../db';
import * as schema from '../db/schema';
import { eq } from 'drizzle-orm';
import { appState } from '../services/stateService';

export const armoireRoutes = Router();

const ARMOIRE_COST = 100;

interface DropResult {
  type: 'xp' | 'food' | 'gear' | 'egg';
  label: string;
  xp?: number;
  goldBack?: number;
  eggId?: string;
  gearUrl?: string;
}

function rollDrop(): DropResult {
  const roll = Math.random() * 100;

  if (roll < 45) {
    // XP буст
    const xp = 50 + Math.floor(Math.random() * 101); // 50–150
    return { type: 'xp', label: `Буст опыта: +${xp} XP`, xp };
  }
  if (roll < 70) {
    // Еда для питомца — возврат части золота (еда = 5 золота x3 кормления)
    const goldBack = 15;
    return { type: 'food', label: 'Еда для питомца (хватит на 3 кормления)', goldBack };
  }
  if (roll < 90) {
    // Armoire Gear — случайный предмет из каталога
    const gearUrl = pickArmoireGear();
    return { type: 'gear', label: 'Эксклюзивный предмет Armoire!', gearUrl };
  }
  // Редкое яйцо
  const eggs = ['Golden', 'Shadow', 'Skeleton'];
  const eggId = eggs[Math.floor(Math.random() * eggs.length)];
  return { type: 'egg', label: `Редкое яйцо: ${eggId}!`, eggId };
}

/** Случайный предмет из armoire-каталога */
function pickArmoireGear(): string | undefined {
  try {
    // Каталог генерируется из известной структуры нейминга Habitica armoire
    const shapes = ['broad_armor', 'slim_armor'];
    const classes = ['warrior', 'wizard', 'rogue', 'healer'];
    // Используем фиксированный набор известных армор-типов
    const tier = Math.floor(Math.random() * 5) + 1;
    const shape = shapes[Math.floor(Math.random() * shapes.length)];
    const cls = classes[Math.floor(Math.random() * classes.length)];
    return `/assets/game/habitica/gear/armor/${shape}_armor_${cls}_${tier}.png`;
  } catch {
    return undefined;
  }
}

/** Открытие сундука */
armoireRoutes.post('/open', async (req: AuthedRequest, res: Response) => {
  try {
    const { userId } = req.body;
    // SEC-03 FIX: мутация от чужого имени запрещена (родителю можно управлять детьми)
    if (!canActOn(req, Number(userId))) {
      return res.status(403).json({ error: 'Forbidden: cannot act on behalf of another user' });
    }
    const user = appState.users.find((u) => u.id === Number(userId));
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.family_role === 'parent') return res.status(403).json({ error: 'Родители не играют' });

    const persisted = await db.transaction(async (tx) => {
      const [dbUser] = await tx.select().from(schema.users)
        .where(eq(schema.users.id, user.id)).for('update').limit(1);
      if (!dbUser) return { status: 'missing' as const };
      if (dbUser.family_role === 'parent') return { status: 'parent' as const };
      if (dbUser.gold < ARMOIRE_COST) return { status: 'insufficient' as const };

      const drop = rollDrop();
      let gold = dbUser.gold - ARMOIRE_COST;
      let xp = dbUser.xp;
      let equipped = { ...((dbUser.habitica_equipped as Record<string, unknown> | null) || {}) };
      if (drop.type === 'xp' && drop.xp) {
        xp += drop.xp;
      } else if (drop.type === 'food' && drop.goldBack) {
        gold += drop.goldBack;
      } else if (drop.type === 'gear' && drop.gearUrl && !dbUser.custom_avatar_url) {
        const match = drop.gearUrl.match(/armor_\w+_(\d)\.png/);
        if (match) equipped = { ...equipped, armorTier: Number(match[1]) };
      } else if (drop.type === 'egg') {
        const freeEggs = Number(equipped.free_eggs || 0) + 1;
        equipped = { ...equipped, free_eggs: freeEggs };
      }

      await tx.update(schema.users).set({
        gold,
        xp,
        habitica_equipped: equipped,
      }).where(eq(schema.users.id, user.id));
      return { status: 'opened' as const, drop, gold, xp, equipped };
    });

    if (persisted.status === 'missing') return res.status(404).json({ error: 'User not found' });
    if (persisted.status === 'parent') return res.status(403).json({ error: 'Родители не играют' });
    if (persisted.status === 'insufficient') {
      return res.status(400).json({ error: `Недостаточно золота (нужно ${ARMOIRE_COST})` });
    }

    user.gold = persisted.gold;
    user.xp = persisted.xp;
    (user as any).habitica_equipped = persisted.equipped;

    res.json({
      success: true,
      drop: persisted.drop,
      gold: user.gold,
      xp: user.xp,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});
