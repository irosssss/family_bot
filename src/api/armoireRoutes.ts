/**
 * Enchanted Armoire (Этап 6): сундук-казино за 100 золота.
 *
 * Таблица дропа (MASTER_SPECIFICATION §5.2):
 *   45% — Буст опыта (50–150 XP)
 *   25% — Случайная еда для питомца (+15 золота обратно, еда = кормление)
 *   20% — Эксклюзивный предмет Armoire Gear (из habitica/gear/armoire/)
 *   10% — Редкое яйцо питомца (даёт случайное золотое/теневое яйцо)
 */

import { Request, Response, Router } from 'express';
import { AuthedRequest, canActOn } from '../utils/apiAuth';
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
armoireRoutes.post('/open', async (req: Request, res: Response) => {
  try {
    const { userId } = req.body;
    // SEC-03 FIX: мутация от чужого имени запрещена (родителю можно управлять детьми)
    const __req = req as any;
    if (process.env.NODE_ENV === 'production' && !canActOn(__req, Number(userId))) {
      return res.status(403).json({ error: 'Forbidden: cannot act on behalf of another user' });
    }
    const user = appState.users.find((u) => u.id === Number(userId));
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.family_role === 'parent') return res.status(403).json({ error: 'Родители не играют' });

    if ((user.gold ?? 0) < ARMOIRE_COST) {
      return res.status(400).json({ error: `Недостаточно золота (нужно ${ARMOIRE_COST})` });
    }

    user.gold -= ARMOIRE_COST;
    const drop = rollDrop();

    if (drop.type === 'xp' && drop.xp) {
      user.xp += drop.xp;
      await db.update(schema.users).set({ xp: user.xp })
        .where(eq(schema.users.id, user.id)).catch(() => {});
    } else if (drop.type === 'food' && drop.goldBack) {
      user.gold += drop.goldBack;
      await db.update(schema.users).set({ gold: user.gold })
        .where(eq(schema.users.id, user.id)).catch(() => {});
    } else if (drop.type === 'gear' && drop.gearUrl && !user.custom_avatar_url) {
      // Сохраняем найденный сет как habitica_equipped.armorTier
      const m = drop.gearUrl.match(/armor_\w+_(\d)\.png/);
      if (m) {
        const he = { ...((user as any).habitica_equipped || {}), armorTier: Number(m[1]) };
        (user as any).habitica_equipped = he;
        await db.update(schema.users).set({ habitica_equipped: he })
          .where(eq(schema.users.id, user.id)).catch(() => {});
      }
    } else if (drop.type === 'egg') {
      // Яйцо добавляется как "кредит" — флаг в habitica_equipped.free_eggs
      const he = (user as any).habitica_equipped || {};
      he.free_eggs = (he.free_eggs || 0) + 1;
      (user as any).habitica_equipped = he;
      await db.update(schema.users).set({ habitica_equipped: he })
        .where(eq(schema.users.id, user.id)).catch(() => {});
    }

    // Золото списываем всегда (кроме food где есть возврат)
    await db.update(schema.users).set({ gold: user.gold })
      .where(eq(schema.users.id, user.id)).catch(() => {});

    res.json({
      success: true,
      drop,
      gold: user.gold,
      xp: user.xp,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});
