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
import { db } from '../db';
import * as schema from '../db/schema';
import { and, eq, inArray } from 'drizzle-orm';
import { ITEM_LOOK_MAP } from '../utils/shopLookMap';
import { SHOP_TORSO_MAP } from '../utils/ulpcCharacter';

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
shopRoutes.post('/equip', async (req: Request, res: Response) => {
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

    // Снятие тира образа (симметрично надеванию)
    const lookDelta = ITEM_LOOK_MAP[item.code];
    if (lookDelta) {
      const he: any = { ...((user as any).habitica_equipped || {}) };
      if (lookDelta.weaponTier != null) he.weaponTier = 0;
      if (lookDelta.shieldTier != null) he.shieldTier = 0;
      if (lookDelta.headTier != null) he.headTier = 0;
      if (lookDelta.armorTier != null && !SHOP_TORSO_MAP[item.code]) he.armorTier = 0;
      (user as any).habitica_equipped = he;
      await db.update(schema.users).set({ habitica_equipped: he })
        .where(eq(schema.users.id, user.id)).catch((e) => console.error('habitica_equipped persist:', e));
    }
  } else {
    // Unequip any existing item in the same slot
    let replacedTitle = '';
    const replacedCodes: string[] = [];
    for (const ui of appState.userItems) {
      if (ui.user_id === user.id && ui.equipped) {
        const matchingItem = appState.shopItems.find((s) => s.id === ui.item_id);
        if (matchingItem?.slot === item.slot) {
          ui.equipped = 0;
          replacedTitle = matchingItem.title;
          replacedCodes.push(matchingItem.code);
        }
      }
    }
    userItem.equipped = 1;

    // Тир заменённого предмета обнуляется (иначе старая броня «прилипает» к образу)
    for (const rc of replacedCodes) {
      const rd = ITEM_LOOK_MAP[rc];
      if (rd) {
        const he: any = { ...((user as any).habitica_equipped || {}) };
        if (rd.weaponTier != null) he.weaponTier = 0;
        if (rd.shieldTier != null) he.shieldTier = 0;
        if (rd.headTier != null) he.headTier = 0;
        if (rd.armorTier != null && !SHOP_TORSO_MAP[rc]) he.armorTier = 0;
        (user as any).habitica_equipped = he;
      }
    }

    if (replacedTitle) {
      message = `Надет «${item.title}»! («${replacedTitle}» снят из слота ${slotName})`;
    } else {
      message = `Надет «${item.title}» (слот: ${slotName})`;
    }

    // Habitica-тир предмета (weapon/head/shield/старые брони) — в habitica_equipped,
    // чтобы образ собирался на хабе/арене (HabiticaAnimatedAvatar) без доп. запросов.
    const lookDelta = ITEM_LOOK_MAP[item.code];
    if (lookDelta) {
      const he: any = { ...((user as any).habitica_equipped || {}) };
      if (lookDelta.weaponTier != null) he.weaponTier = lookDelta.weaponTier;
      if (lookDelta.shieldTier != null) he.shieldTier = lookDelta.shieldTier;
      if (lookDelta.headTier != null) he.headTier = lookDelta.headTier;
      if (lookDelta.armorTier != null && !SHOP_TORSO_MAP[item.code]) he.armorTier = lookDelta.armorTier;
      (user as any).habitica_equipped = he;
      await db.update(schema.users).set({ habitica_equipped: he })
        .where(eq(schema.users.id, user.id)).catch((e) => console.error('habitica_equipped persist:', e));
    }
    // ULPC-торсы визуализируются через equipped_codes.body (см. stateRoutes) — тут persist не нужен.

    // Persist в БД (character_inventory.is_equipped). Без этого в DB-режиме
    // следующий loadState() перечитывал БД и предмет «снимался сам».
    // Best-effort: DEMO-режим (БД недоступна) должен работать как раньше —
    // память остаётся зеркалом; в DB-режиме запись подтверждается фактом.
    try {
      await db.transaction(async (tx) => {
        const sameSlotIds = appState.shopItems
          .filter((s) => s.slot === item.slot && s.id !== item.id)
          .map((s) => s.id);
        if (sameSlotIds.length > 0) {
          await tx
            .update(schema.character_inventory)
            .set({ is_equipped: false })
            .where(
              and(
                eq(schema.character_inventory.character_id, user.id),
                inArray(schema.character_inventory.item_id, sameSlotIds)
              )
            );
        }
        await tx
          .update(schema.character_inventory)
          .set({ is_equipped: true })
          .where(
            and(
              eq(schema.character_inventory.character_id, user.id),
              eq(schema.character_inventory.item_id, item.id)
            )
          );
      });
    } catch (e) {
      // Не 500: игра продолжается из памяти (демо/офлайн), но факт залогирован.
      console.error('Equip persist error (best-effort):', (e as any)?.message || e);
    }
  }

  res.json({ success: true, message });
});
