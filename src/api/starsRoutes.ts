/**
 * Telegram Stars (Этап 7): покупка кристаллов за XTR.
 *
 * SKU:
 *   gems_small  : 50 Stars  → 20 Gems
 *   gems_medium : 100 Stars → 50 Gems
 *   gems_large  : 250 Stars → 150 Gems + Dragon Egg
 *   family_pro  : 350 Stars → подписка Family Pro (30 дней)
 *
 * Поток: /create-invoice → Bot API createInvoiceLink → пользователь платит
 *        → Telegram шлёт webhook /api/webhook/stars → pre_checkout → successful_payment
 */
import { Request, Response, Router } from 'express';
import { AuthedRequest, canActOn } from '../utils/apiAuth';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import * as schema from '../db/schema';
import { appState } from '../services/stateService';

export const starsRoutes = Router();

const BOT_TOKEN = process.env.BOT_TOKEN || '';

const SKUS: Record<string, { title: string; description: string; stars: number; gems: number; proDays?: number }> = {
  gems_small: { title: '20 кристаллов', description: 'Набор из 20 кристаллов для Family Chores RPG', stars: 50, gems: 20 },
  gems_medium: { title: '50 кристаллов', description: 'Набор из 50 кристаллов + бонус', stars: 100, gems: 50 },
  gems_large: { title: '150 кристаллов + Драконье яйцо', description: 'Большой набор: 150 кристаллов и редкое яйцо', stars: 250, gems: 150 },
  family_pro: { title: 'Family Pro (месяц)', description: 'Заморозка стриков, тематические боссы, аналитика', stars: 350, gems: 0, proDays: 30 },
};

/**
 * POST /api/stars/create-invoice
 * body: { userId, sku }
 * Создаёт invoice-ссылку через Telegram Bot API.
 */
starsRoutes.post('/create-invoice', async (req: Request, res: Response) => {
  try {
    const { userId, sku } = req.body;
    // SEC-03 FIX: мутация от чужого имени запрещена (родителю можно управлять детьми)
    const __req = req as any;
    if (process.env.NODE_ENV === 'production' && !canActOn(__req, Number(userId))) {
      return res.status(403).json({ error: 'Forbidden: cannot act on behalf of another user' });
    }
    const user = appState.users.find((u) => u.id === Number(userId));
    if (!user) return res.status(404).json({ error: 'User not found' });
    // Покупает родитель
    if (user.family_role !== 'parent') {
      return res.status(403).json({ error: 'Покупки доступны только родителям' });
    }

    const skuDef = SKUS[sku];
    if (!skuDef) return res.status(400).json({ error: 'Неизвестный SKU' });

    if (!BOT_TOKEN) {
      return res.status(500).json({ error: 'BOT_TOKEN не настроен на сервере' });
    }
    if (!user.telegram_id) {
      return res.status(400).json({ error: 'У пользователя нет telegram_id' });
    }

    // Реальный вызов Telegram Bot API createInvoiceLink
    const payload = JSON.stringify({ userId: user.id, sku });
    const tgResp = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/createInvoiceLink`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: skuDef.title,
        description: skuDef.description,
        payload,
        currency: 'XTR',
        prices: [{ label: skuDef.title, amount: skuDef.stars }],
      }),
    });
    const tgJson: any = await tgResp.json();
    if (!tgJson.ok) {
      return res.status(500).json({ error: `Telegram API: ${tgJson.description}` });
    }

    res.json({ success: true, invoiceLink: tgJson.result, sku });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * Внутренняя функция: начислить купленное (вызывается из webhook при successful_payment).
 * expectedStars — сумма из платежа; сверяется с прайсом SKU, при расхождении
 * начисление отклоняется (защита от подделки payload, этап 2 аудита).
 */
export function creditPurchase(
  userId: number,
  sku: string,
  expectedStars: number = SKUS[sku]?.stars ?? -1
): { gems: number; proDays?: number } | null {
  const skuDef = SKUS[sku];
  if (!skuDef) return null;
  if (expectedStars !== skuDef.stars) {
    console.error(`[Stars] amount mismatch for ${sku}: paid ${expectedStars}, price ${skuDef.stars}`);
    return null;
  }

  const user = appState.users.find((u) => u.id === userId);
  if (!user) return null;

  user.crystals = (user.crystals || 0) + skuDef.gems;
  let proDays: number | undefined;

  if (skuDef.proDays) {
    proDays = skuDef.proDays;
    const current = (user as any).family_pro_until ? new Date((user as any).family_pro_until) : new Date();
    current.setDate(current.getDate() + proDays);
    (user as any).family_pro_until = current.toISOString();
  }

  // Фаза 6: кристаллы И Family Pro — в PostgreSQL (раньше Pro терялся при
  // рестарте: колонки не было, писал только crystals).
  db.update(schema.users).set({
    crystals: user.crystals,
    ...(proDays ? { family_pro_until: new Date((user as any).family_pro_until) } : {}),
  }).where(eq(schema.users.id, userId)).catch((e) => console.error('Stars credit DB error:', e));

  return { gems: skuDef.gems, proDays };
}
