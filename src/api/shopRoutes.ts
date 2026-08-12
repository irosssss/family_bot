/**
 * Роуты магазина экипировки.
 * POST /invoice — генерация инвойса Telegram Stars (mock).
 * POST /buy — купить предмет экипировки.
 * POST /equip — экипировать/снять предмет.
 */
import { Request, Response, Router } from 'express';
import { db } from '../db';
import * as schema from '../db/schema';
import { eq } from 'drizzle-orm';
import { telegramAuthMiddleware } from '../utils/telegramAuth';
import { appState } from '../services/stateService';

export const shopRoutes = Router();

// Telegram Stars Invoice Generation (Mock) — требует авторизации
shopRoutes.post('/invoice', telegramAuthMiddleware, (req: any, res: Response) => {
  const { userId, productId, amount } = req.body;
  // In a real app, use bot.createInvoiceLink() from node-telegram-bot-api
  // with currency: 'XTR' (Telegram Stars)
  res.json({
    success: true,
    invoiceLink: `https://t.me/$INVOICE_LINK_MOCK_${productId}`
  });
});

// Buy Shop Equipment Item
shopRoutes.post('/buy', (req: Request, res: Response) => {
  const { userId, itemId } = req.body;
  const user = appState.users.find((u) => u.id === Number(userId));
  const item = appState.shopItems.find((s) => s.id === Number(itemId));

  if (!user || !item) return res.status(404).json({ error: 'Not found' });

  const alreadyOwned = appState.userItems.some(
    (ui) => ui.user_id === user.id && ui.item_id === item.id
  );
  if (alreadyOwned) return res.status(400).json({ error: 'Предмет уже куплен' });

  if (user.gold < item.cost) return res.status(400).json({ error: 'Недостаточно золота' });

  user.gold -= item.cost;
  // Update DB (async)

  const dbUsers = schema.users;
  db.update(dbUsers).set({
    gold: user.gold
  }).where(eq(dbUsers.id, user.id)).execute().catch(e => console.error('DB Update error:', e));

  // Unequip any other item in the same slot before equipping newly bought item
  for (const ui of appState.userItems) {
    if (ui.user_id === user.id && ui.equipped) {
      const matchingItem = appState.shopItems.find((s) => s.id === ui.item_id);
      if (matchingItem?.slot === item.slot) {
        ui.equipped = 0;
      }
    }
  }

  appState.userItems.push({
    user_id: user.id,
    item_id: item.id,
    equipped: 1,
  });

  res.json({ success: true, item, gold: user.gold });
});

// Equip / Unequip Item
shopRoutes.post('/equip', (req: Request, res: Response) => {
  const { userId, itemId } = req.body;
  const user = appState.users.find((u) => u.id === Number(userId));
  const item = appState.shopItems.find((s) => s.id === Number(itemId));

  if (!user || !item) return res.status(404).json({ error: 'Not found' });

  const userItem = appState.userItems.find(
    (ui) => ui.user_id === user.id && ui.item_id === item.id
  );

  if (!userItem) {
    return res.status(400).json({ error: 'Сначала купите этот предмет в лавке' });
  }

  let message = '';
  const slotNames: Record<string, string> = {
    weapon: 'Оружие',
    head: 'Голова',
    body: 'Тело',
    accessory: 'Аксессуар',
    background: 'Фон окружения',
  };
  const slotName = slotNames[item.slot] || item.slot;

  if (userItem.equipped) {
    userItem.equipped = 0;
    message = `Снят предмет «${item.title}» (слот: ${slotName})`;
  } else {
    // Unequip any existing item in the same slot
    let replacedTitle = '';
    for (const ui of appState.userItems) {
      if (ui.user_id === user.id && ui.equipped) {
        const matchingItem = appState.shopItems.find((s) => s.id === ui.item_id);
        if (matchingItem?.slot === item.slot) {
          ui.equipped = 0;
          replacedTitle = matchingItem.title;
        }
      }
    }
    userItem.equipped = 1;

    if (replacedTitle) {
      message = `Надет «${item.title}»! («${replacedTitle}» снят из слота ${slotName})`;
    } else {
      message = `Надет «${item.title}» (слот: ${slotName})`;
    }
  }

  res.json({ success: true, message });
});
