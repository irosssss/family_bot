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
import { Response, Router } from 'express';
import { type AuthedRequest, canActOn } from '../utils/apiAuth';
import { eq, sql } from 'drizzle-orm';
import { db } from '../db';
import * as schema from '../db/schema';
import { appState } from '../services/stateService';

export const starsRoutes = Router();

const BOT_TOKEN = process.env.BOT_TOKEN || '';

/** Прайс Stars-SKU. Экспортирован для тестов (tests/starsPricing.test.ts). */
export const SKUS: Record<string, { title: string; description: string; stars: number; gems: number; proDays?: number }> = {
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
starsRoutes.post('/create-invoice', async (req: AuthedRequest, res: Response) => {
  try {
    const { userId, sku } = req.body;
    // SEC-03 FIX: мутация от чужого имени запрещена (родителю можно управлять детьми)
    if (!canActOn(req, Number(userId))) {
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
export interface CreditPurchaseResult {
  status: 'credited' | 'duplicate' | 'invalid' | 'not_found' | 'db_error';
  gems?: number;
  proDays?: number;
}

/** Атомарно фиксирует charge_id и начисляет покупку в одной транзакции. */
export async function creditPurchaseAtomic(input: {
  chargeId: string;
  userId: number;
  payerTelegramId: number;
  sku: string;
  amount: number;
  currency: string;
}): Promise<CreditPurchaseResult> {
  const { chargeId, userId, payerTelegramId, sku, amount, currency } = input;
  const skuDef = SKUS[sku];
  if (!chargeId || !skuDef || currency !== 'XTR' || amount !== skuDef.stars) {
    return { status: 'invalid' };
  }

  try {
    const result = await db.transaction(async (tx) => {
      const [lockedUser] = await tx.select().from(schema.users)
        .where(eq(schema.users.id, userId)).for('update');
      if (!lockedUser || lockedUser.telegram_id !== payerTelegramId || lockedUser.family_role !== 'parent') {
        return { status: 'not_found' as const };
      }

      const claimed = await tx.insert(schema.payments).values({
        charge_id: chargeId,
        user_id: userId,
        sku,
        amount,
        currency,
        status: 'pending',
      }).onConflictDoNothing({ target: schema.payments.charge_id })
        .returning({ id: schema.payments.id });
      if (claimed.length === 0) return { status: 'duplicate' as const };

      let proUntil = lockedUser.family_pro_until;
      if (skuDef.proDays) {
        const now = new Date();
        const base = proUntil && proUntil > now ? new Date(proUntil) : now;
        base.setDate(base.getDate() + skuDef.proDays);
        proUntil = base;
      }

      const [updatedUser] = await tx.update(schema.users).set({
        crystals: sql`${schema.users.crystals} + ${skuDef.gems}`,
        ...(skuDef.proDays ? { family_pro_until: proUntil } : {}),
      }).where(eq(schema.users.id, userId)).returning({
        crystals: schema.users.crystals,
        family_pro_until: schema.users.family_pro_until,
      });
      await tx.update(schema.payments).set({ status: 'credited' })
        .where(eq(schema.payments.charge_id, chargeId));
      return {
        status: 'credited' as const,
        crystals: updatedUser.crystals,
        familyProUntil: updatedUser.family_pro_until,
      };
    });

    if (result.status === 'credited') {
      const user = appState.users.find((candidate) => candidate.id === userId);
      if (user) {
        user.crystals = result.crystals;
        (user as any).family_pro_until = result.familyProUntil?.toISOString();
      }
      return { status: 'credited', gems: skuDef.gems, proDays: skuDef.proDays };
    }
    return result;
  } catch (error) {
    console.error('[Stars] atomic credit failed:', error);
    return { status: 'db_error' };
  }
}
