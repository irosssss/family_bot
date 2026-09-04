/**
 * Маппинг кодов предметов магазина на Habitica-тиры (прослойка «предмет → образ»).
 *
 * Два мира спрайтов:
 *  - ULPC-торсы (slot body, SHOP_TORSO_MAP) сохраняют отдельный shop mapping;
 *    гардероб использует его для живой примерки;
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
  /** Тир существует для конкретного класса (path содержит класс) — подсказка.
   *  'special' = спрайт вне классовой сетки (shield_special_N). */
  cls?: 'warrior' | 'mage' | 'rogue' | 'healer' | 'special';
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

  // --- ЩИТЫ (shield_<cls>_<tier>.png; у wizard щитов нет — special_1) ---
  shield: { shieldTier: 1, cls: 'warrior' },
  dragon_shield: { shieldTier: 3, cls: 'warrior' },
  magic_orb: { shieldTier: 1, cls: 'special' },
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

/**
 * ИКОНКА ВЕЩИ — только Habitica-стиль (дизайн-канон: один стиль ассетов).
 * Возвращает спрайт того же тира, что реально надевается на персонажа,
 * т.е. иконка в магазине = визуал на герое. Fallback — иконка воина 1-го тира.
 */
import { CLASS_MAP } from './habiticaAssets';

export function habiticaItemIcon(code: string | undefined, slot: string | undefined): string {
  const delta = code ? ITEM_LOOK_MAP[code] : undefined;
  const cls = delta?.cls || 'warrior';
  const B = '/assets/game/habitica/gear/';
  if (delta?.weaponTier != null) return `${B}weapon/weapon_${CLASS_MAP[cls] || cls}_${delta.weaponTier}.png`;
  if (delta?.shieldTier != null) return `${B}shield/shield_${cls}_${delta.shieldTier}.png`;
  if (delta?.headTier != null) return `${B}head/head_${CLASS_MAP[cls] || cls}_${delta.headTier}.png`;
  if (delta?.armorTier != null) return `${B}armor/broad_armor_${CLASS_MAP[cls] || cls}_${delta.armorTier}.png`;
  // ULPC-торсы и предметы без тира: ближайшая Habitica-броня
  if (slot === 'body') {
    const tier = code && ULPC_TORSO_TIER[code] ? ULPC_TORSO_TIER[code] : 1;
    return `${B}armor/broad_armor_${CLASS_MAP[cls] || cls}_${tier}.png`;
  }
  return `${B}weapon/weapon_warrior_1.png`;
}

/** ULPC-торс → Habitica armorTier (синхронизировано с unifiedLook.ts). */
export const ULPC_TORSO_TIER: Record<string, number> = {
  leather_armor_shop: 1,
  suspenders: 1,
  overalls: 1,
  chainmail: 2,
  legion_armor: 3,
  plate_armor_shop: 5,
};

/** Фон карточки: код bg_* → Habitica background; иначе (URL/прочее) — как есть. */
const BG_MAP: Record<string, string> = {
  bg_forest: 'background_autumn_forest.png',
  bg_castle: 'background_amid_ancient_ruins.png',
  bg_sunset: 'background_beach.png',
  bg_cottage: 'background_farmhouse.png',
  bg_space: 'background_midnight_clouds.png',
  bg_cave: 'background_crystal_cave.png',
  bg_volcano: 'background_beach_with_volcano.png',
  bg_ocean: 'background_among_giant_anemones.png',
  bg_cyberpunk: 'background_habit_city_streets.png',
  bg_ruins: 'background_amid_ancient_ruins.png',
  bg_dragon_peak: 'background_mountain_lake.png',
  bg_lantern: 'background_lake_with_floating_lanterns.png',
};

export function habiticaBgUrl(bgEquipped: string): string {
  if (BG_MAP[bgEquipped]) return `/assets/game/habitica/backgrounds/${BG_MAP[bgEquipped]}`;
  // может прийти item.code (bg_XXX) или imageUrl — пробуем вытащить код
  const m = /bg_[a-z_]+/.exec(bgEquipped || '');
  if (m && BG_MAP[m[0]]) return `/assets/game/habitica/backgrounds/${BG_MAP[m[0]]}`;
  return bgEquipped || '';
}

/** Питомец → Habitica stable/pets спрайт (81×99, канон). */
const PET_SPECIES: Record<string, string> = {
  cat: 'Cat',
  dog: 'Dog',
  fox: 'Fox',
  wolf: 'Wolf',
  panda: 'PandaCub',
  dragon: 'Dragon',
  gold_dragon: 'Dragon',
  unicorn: 'Unicorn',
  owl: 'Owl',
  turtle: 'Turtle',
  hedgehog: 'Hedgehog',
  rabbit: 'Bunny',
  tiger: 'TigerCub',
  panther: 'LionCub',
  griffin: 'Gryphon',
  phoenix: 'Phoenix',
  slime: 'Slime',
  pegasus: 'FlyingPig',
  cerberus: 'Wolf',
  mech_bear: 'BearCub',
  cloud: 'Butterfly',
  chinchilla: 'GuineaPig',
};

export function habiticaPetSprite(code: string | undefined): string {
  const c = code || '';
  // Зоопарк (zooService): код вида habitica_<Species>_<Potion> — рисуем родной окрас
  const m = /^habitica_([A-Za-z]+)_([A-Za-z]+)$/.exec(c);
  if (m) return `/assets/game/habitica/pets/Pet-${m[1]}-${m[2]}.png`;
  const species = PET_SPECIES[c] || 'Cat';
  return `/assets/game/habitica/pets/Pet-${species}-Base.png`;
}
