/**
 * Маппинг кодов предметов магазина на Habitica-тиры (прослойка «предмет → образ»).
 *
 * Два мира спрайтов:
 *  - ULPC-торсы (slot body, SHOP_TORSO_MAP) рендерятся UlpcAvatar'ом —
 *    гардероб показывает их живой примеркой;
 *  - оружие/щиты/шляпы (и старые 16-bit вещи) рендерятся Habitica-аватаром
 *    через tiers (weaponTier/shieldTier/headTier/armorTier) в users.habitica_equipped.
 *
 * Tier-спрайты проверены на диске: habitica/gear/{weapon,shield,head}/...
 */
import type { HabiticaLook } from './habiticaAssets';

export interface ItemLookDelta {
  weaponTier?: number;
  shieldTier?: number;
  headTier?: number;
  armorTier?: number;
  /** Тир существует для конкретного класса (path содержит класс) — подсказка */
  cls?: 'warrior' | 'mage' | 'rogue' | 'healer';
}

/** code предмета → тир образа. Пустой tier-объект = предмет визуально нейтрален. */
export const ITEM_LOOK_MAP: Record<string, ItemLookDelta> = {
  // --- ОРУЖИЕ (weapon_<cls>_<tier>.png) ---
  sword: { weaponTier: 1, cls: 'warrior' },
  golden_axe: { weaponTier: 2, cls: 'warrior' },
  obsidian_blade: { weaponTier: 3, cls: 'warrior' },
  laser_saber: { weaponTier: 4, cls: 'warrior' },
  phoenix_scythe: { weaponTier: 5, cls: 'warrior' },
  light_crossbow: { weaponTier: 6, cls: 'warrior' },
  staff: { weaponTier: 1, cls: 'mage' },
  frost_staff: { weaponTier: 2, cls: 'mage' },
  spellbook: { weaponTier: 3, cls: 'mage' },
  dagger: { weaponTier: 1, cls: 'rogue' },
  scepter: { weaponTier: 1, cls: 'healer' },
  lightning_trident: { weaponTier: 2, cls: 'healer' },

  // --- ЩИТЫ (shield_<cls>_<tier>.png) ---
  shield: { shieldTier: 1, cls: 'warrior' },
  dragon_shield: { shieldTier: 3, cls: 'warrior' },
  magic_orb: { shieldTier: 2, cls: 'mage' },
  lantern_light: { shieldTier: 2, cls: 'healer' },

  // --- ШЛЯПЫ (head_<cls>_<tier>.png) ---
  cap: { headTier: 1, cls: 'warrior' },
  tophat: { headTier: 2, cls: 'warrior' },
  crown: { headTier: 5, cls: 'warrior' },
  dragon_helm: { headTier: 4, cls: 'warrior' },
  viking_helm: { headTier: 4, cls: 'warrior' },
  horns: { headTier: 4, cls: 'warrior' },
  cyber_headphones: { headTier: 3, cls: 'warrior' },
  witch_hat: { headTier: 2, cls: 'mage' },
  shadow_hood: { headTier: 2, cls: 'rogue' },
  ninja_mask: { headTier: 3, cls: 'rogue' },
  cat_ears: { headTier: 2, cls: 'rogue' },
  halo: { headTier: 4, cls: 'healer' },
  tiara: { headTier: 3, cls: 'healer' },

  // --- Старые 16-bit брони (armor_<cls>_<tier>.png) — обратная совместимость ---
  robe: { armorTier: 1, cls: 'mage' },
  dark_mantle: { armorTier: 2, cls: 'mage' },
  holy_robe: { armorTier: 2, cls: 'healer' },
  armor: { armorTier: 1, cls: 'warrior' },
  knight_tabard: { armorTier: 2, cls: 'warrior' },
  dragon_scale: { armorTier: 4, cls: 'warrior' },
  cyber_exosuit: { armorTier: 5, cls: 'warrior' },
  ninja_gi: { armorTier: 2, cls: 'rogue' },
};

/** Надеть предмет: мержит тир в образ. Возвращает НОВЫЙ объект look. */
export function applyItemLook(look: HabiticaLook, code: string | undefined): HabiticaLook {
  const delta = code ? ITEM_LOOK_MAP[code] : undefined;
  if (!delta) return look;
  return { ...look, ...delta };
}

/** Снять предмет: обнуляет его тир. Возвращает НОВЫЙ объект look. */
export function removeItemLook(look: HabiticaLook, code: string | undefined): HabiticaLook {
  const delta = code ? ITEM_LOOK_MAP[code] : undefined;
  if (!delta) return look;
  const next = { ...look };
  if (delta.weaponTier != null) next.weaponTier = 0;
  if (delta.shieldTier != null) next.shieldTier = 0;
  if (delta.headTier != null) next.headTier = 0;
  if (delta.armorTier != null) next.armorTier = 0;
  return next;
}
