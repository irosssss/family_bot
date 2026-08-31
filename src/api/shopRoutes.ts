/**
 * Роуты магазина экипировки.
 * POST /invoice — генерация инвойса Telegram Stars (mock).
 * POST /buy — купить предмет экипировки.
 * POST /equip — экипировать/снять предмет.
 */
import { Request, Response, Router } from 'express';
import { telegramAuthMiddleware } from '../utils/telegramAuth';
import { appState } from '../services/stateService';
import { buyShopItemAtomic } from '../services/walletService';

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

// Buy Shop Equipment Item — атомарно через БД (Фаза 6-lite, H4):
// транзакция со списанием `WHERE gold >= cost` и авто-ROLLBACK.
shopRoutes.post('/buy', async (req: Request, res: Response) => {
  const { userId, itemId } = req.body;

  const result = await buyShopItemAtomic(Number(userId), Number(itemId));
  if (!result.ok) {
    const status = result.reason === 'not_found' ? 404 : 400;
    const msg =
      result.reason === 'insufficient_funds' ? 'Недостаточно золота'
      : result.reason === 'already_owned' ? 'Предмет уже куплен'
      : result.reason === 'db_error' ? 'Ошибка базы данных, попробуйте ещё раз'
      : 'Not found';
    return res.status(status).json({ error: msg });
  }

  const item = appState.shopItems.find((s) => s.id === Number(itemId));
  res.json({ success: true, item, gold: result.gold });
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
