/**
 * Роуты магазина экипировки.
 * POST /buy — купить предмет экипировки.
 * POST /equip — экипировать/снять предмет.
 */
import { Response, Router } from 'express';
import { and, eq, inArray } from 'drizzle-orm';
import { type AuthedRequest, canActOn } from '../utils/apiAuth';
import { appState } from '../services/stateService';
import { buyShopItemAtomic } from '../services/walletService';
import { db } from '../db';
import * as schema from '../db/schema';
import { ITEM_LOOK_MAP } from '../utils/shopLookMap';
import { SHOP_TORSO_MAP } from '../utils/ulpcCharacter';

export const shopRoutes = Router();

shopRoutes.post('/buy', async (req: AuthedRequest, res: Response) => {
  const { userId, itemId } = req.body;
  if (!canActOn(req, Number(userId))) {
    return res.status(403).json({ error: 'Forbidden: cannot act on behalf of another user' });
  }

  const result = await buyShopItemAtomic(Number(userId), Number(itemId));
  if (!result.ok) {
    const status = result.reason === 'not_found' ? 404 : result.reason === 'db_error' ? 500 : 400;
    const message =
      result.reason === 'insufficient_funds' ? 'Недостаточно золота'
      : result.reason === 'already_owned' ? 'Предмет уже куплен'
      : result.reason === 'db_error' ? 'Ошибка базы данных, попробуйте ещё раз'
      : 'Not found';
    return res.status(status).json({ error: message });
  }

  const item = appState.shopItems.find((candidate) => candidate.id === Number(itemId));
  return res.json({ success: true, item, gold: result.gold });
});

shopRoutes.post('/equip', async (req: AuthedRequest, res: Response) => {
  const { userId, itemId } = req.body;
  if (!canActOn(req, Number(userId))) {
    return res.status(403).json({ error: 'Forbidden: cannot act on behalf of another user' });
  }
  const user = appState.users.find((candidate) => candidate.id === Number(userId));
  const item = appState.shopItems.find((candidate) => candidate.id === Number(itemId));
  if (!user || !item) return res.status(404).json({ error: 'Not found' });

  const slotNames: Record<string, string> = {
    weapon: 'Оружие',
    head: 'Голова',
    body: 'Тело',
    accessory: 'Аксессуар',
    background: 'Фон окружения',
  };
  const slotName = slotNames[item.slot] || item.slot;
  const sameSlotItems = appState.shopItems.filter((candidate) => candidate.slot === item.slot);
  const sameSlotIds = sameSlotItems.map((candidate) => candidate.id);

  try {
    const persisted = await db.transaction(async (tx) => {
      const [dbUser] = await tx.select().from(schema.users)
        .where(eq(schema.users.id, user.id)).for('update').limit(1);
      const [owned] = await tx.select().from(schema.character_inventory)
        .where(and(
          eq(schema.character_inventory.character_id, user.id),
          eq(schema.character_inventory.item_id, item.id),
        )).for('update').limit(1);
      if (!dbUser || !owned) return null;

      const equippedRows = await tx.select().from(schema.character_inventory)
        .where(and(
          eq(schema.character_inventory.character_id, user.id),
          inArray(schema.character_inventory.item_id, sameSlotIds),
        )).for('update');
      const shouldEquip = !owned.is_equipped;
      const replacedItems = equippedRows
        .filter((row) => row.is_equipped && row.item_id !== item.id)
        .map((row) => sameSlotItems.find((candidate) => candidate.id === row.item_id))
        .filter((candidate): candidate is NonNullable<typeof candidate> => !!candidate);
      const equipped: Record<string, unknown> = {
        ...((dbUser.habitica_equipped as Record<string, unknown> | null) || {}),
      };
      const clearLook = (code: string) => {
        const delta = ITEM_LOOK_MAP[code];
        if (!delta) return;
        if (delta.weaponTier != null) equipped.weaponTier = 0;
        if (delta.shieldTier != null) equipped.shieldTier = 0;
        if (delta.headTier != null) equipped.headTier = 0;
        if (delta.armorTier != null && !SHOP_TORSO_MAP[code]) equipped.armorTier = 0;
      };

      if (shouldEquip) {
        for (const replaced of replacedItems) clearLook(replaced.code);
        const delta = ITEM_LOOK_MAP[item.code];
        if (delta?.weaponTier != null) equipped.weaponTier = delta.weaponTier;
        if (delta?.shieldTier != null) equipped.shieldTier = delta.shieldTier;
        if (delta?.headTier != null) equipped.headTier = delta.headTier;
        if (delta?.armorTier != null && !SHOP_TORSO_MAP[item.code]) equipped.armorTier = delta.armorTier;
        await tx.update(schema.character_inventory).set({ is_equipped: false })
          .where(and(
            eq(schema.character_inventory.character_id, user.id),
            inArray(schema.character_inventory.item_id, sameSlotIds),
          ));
      } else {
        clearLook(item.code);
      }

      await tx.update(schema.character_inventory).set({ is_equipped: shouldEquip })
        .where(and(
          eq(schema.character_inventory.character_id, user.id),
          eq(schema.character_inventory.item_id, item.id),
        ));
      await tx.update(schema.users).set({ habitica_equipped: equipped })
        .where(eq(schema.users.id, user.id));
      return { shouldEquip, replacedItems, equipped };
    });

    if (!persisted) {
      return res.status(400).json({ error: 'Сначала купите этот предмет в лавке' });
    }
    for (const inventoryItem of appState.userItems) {
      if (inventoryItem.user_id !== user.id || !sameSlotIds.includes(inventoryItem.item_id)) continue;
      inventoryItem.equipped = inventoryItem.item_id === item.id && persisted.shouldEquip ? 1 : 0;
    }
    if (!appState.userItems.some((row) => row.user_id === user.id && row.item_id === item.id)) {
      appState.userItems.push({
        user_id: user.id,
        item_id: item.id,
        equipped: persisted.shouldEquip ? 1 : 0,
      });
    }
    (user as any).habitica_equipped = persisted.equipped;

    const replacedTitle = persisted.replacedItems[0]?.title;
    const message = persisted.shouldEquip
      ? replacedTitle
        ? `Надет «${item.title}»! («${replacedTitle}» снят из слота ${slotName})`
        : `Надет «${item.title}» (слот: ${slotName})`
      : `Снят предмет «${item.title}» (слот: ${slotName})`;
    return res.json({ success: true, message });
  } catch (error) {
    console.error('[shop] equip transaction failed:', error);
    return res.status(500).json({ error: 'Ошибка базы данных, попробуйте ещё раз' });
  }
});
