/**
 * Хелпер сборки URL спрайтов Habitica.
 * Ассеты: /assets/game/habitica/ (пак HabitRPG/habitica-images).
 *
 * Фактический нейминг файлов (проверено по пакету):
 *  - Кожа:      customize/skin/skin_{hex}.png            (62 тона, hex без #)
 *  - Причёска:  customize/hair/hair_base_{n}_{color}.png (20 стилей)
 *               customize/hair/hair_bangs_{n}_{color}.png (4 стиля чёлки)
 *  - Борода:    customize/beards/hair_beard_{n}_{color}.png
 *  - Броня:     gear/armor/broad_armor_{cls}_{tier}.png | slim_armor_...
 *               cls: warrior|wizard|rogue|healer; tier 1-5. special — отдельные имена.
 *  - Шлем:      gear/head/head_{cls}_{tier}.png          (base: head_0.png = лысая голова)
 *  - Оружие:    gear/weapon/weapon_{cls}_{tier}.png      (tier от 0)
 *  - Щит:       gear/shield/shield_{cls}_{tier}.png      (warrior/rogue/healer; у wizard нет)
 *  - Питомец:   stable/pets/Pet-{Species}-{Potion}.png   (81×99)
 *  - Маунт:     stable/mounts/icon/Mount_Icon_{Species}-{Potion}.png
 *  - Босс:      quests/bosses/quest_{id}.png
 */

export const HABITICA_BASE = '/assets/game/habitica/';

/** Классы игры → классы Habitica (у Habitica mage = wizard) */
export const CLASS_MAP: Record<string, 'warrior' | 'wizard' | 'rogue' | 'healer'> = {
  warrior: 'warrior',
  mage: 'wizard',
  wizard: 'wizard',
  rogue: 'rogue',
  healer: 'healer',
};

export type HabiticaClass = 'warrior' | 'wizard' | 'rogue' | 'healer';

/** Образ персонажа (сохраняется в users.habitica_equipped jsonb) */
export interface HabiticaLook {
  skin: string;              // hex без '#', напр. 'c76b2e'
  hairBase: number;          // стиль 1..20
  hairBangs?: number;        // чёлка 1..4
  hairColor: string;         // 'blond', 'brown', ...
  beard?: number;            // борода 1..3 (опционально)
  armorTier?: number;        // 0..5 (0 = базовая одежда)
  headTier?: number;         // 0 = нет шлема
  weaponTier?: number;
  shieldTier?: number;
}

/** Дефолтные образы семьи (кожа — из фактических тонов пакета) */
export const DEFAULT_LOOKS: Record<string, HabiticaLook> = {
  misha: { skin: 'ea8349', hairBase: 3, hairColor: 'blond', armorTier: 0, headTier: 0, weaponTier: 1 },
  regina: { skin: 'f5a76e', hairBase: 12, hairBangs: 2, hairColor: 'red', armorTier: 0, headTier: 0, weaponTier: 1 },
  papa: { skin: 'c06534', hairBase: 1, beard: 1, hairColor: 'brown', armorTier: 1, headTier: 0, weaponTier: 0 },
  mama: { skin: 'f5d70f', hairBase: 5, hairColor: 'brown', armorTier: 1, headTier: 0, weaponTier: 0 },
};

/** Универсальный сборщик пути спрайта */
export function getHabiticaSpritePath(
  category: 'skin' | 'hair_base' | 'hair_bangs' | 'beard' | 'armor' | 'head' | 'weapon' | 'shield' | 'pet' | 'mount_icon' | 'boss',
  id: string,
): string {
  switch (category) {
    case 'skin':
      return `${HABITICA_BASE}customize/skin/skin_${id}.png`;
    case 'hair_base':
      // id: "{style}_{color}" напр. "3_blond"
      return `${HABITICA_BASE}customize/hair/hair_base_${id}.png`;
    case 'hair_bangs':
      return `${HABITICA_BASE}customize/hair/hair_bangs_${id}.png`;
    case 'beard':
      return `${HABITICA_BASE}customize/beards/hair_beard_${id}.png`;
    case 'pet':
      return `${HABITICA_BASE}stable/pets/Pet-${id}.png`;
    case 'mount_icon':
      return `${HABITICA_BASE}stable/mounts/icon/Mount_Icon-${id}.png`;
    case 'boss':
      return `${HABITICA_BASE}quests/bosses/quest_${id}.png`;
  }
  return '';
}

/**
 * Слои образа в порядке Z (снизу вверх) для HabiticaAnimatedAvatar.
 * Возвращает список {zIndex, url}; пустые опции пропускаются.
 */
export function buildHabiticaLayers(look: HabiticaLook, cls: string): Array<{ z: number; url: string }> {
  const hcls = CLASS_MAP[cls] || 'warrior';
  const layers: Array<{ z: number; url: string }> = [];

  layers.push({ z: 30, url: getHabiticaSpritePath('skin', look.skin) });

  const armorShape = hcls === 'rogue' ? 'slim' : 'broad';
  if ((look.armorTier ?? 0) > 0) {
    layers.push({ z: 40, url: `${HABITICA_BASE}gear/armor/${armorShape}_armor_${hcls}_${look.armorTier}.png` });
  }

  if (look.hairBase > 0 && look.hairColor) {
    layers.push({ z: 60, url: getHabiticaSpritePath('hair_base', `${look.hairBase}_${look.hairColor}`) });
  }
  if (look.hairBangs && look.hairColor) {
    layers.push({ z: 61, url: getHabiticaSpritePath('hair_bangs', `${look.hairBangs}_${look.hairColor}`) });
  }
  if (look.beard && look.hairColor) {
    layers.push({ z: 62, url: getHabiticaSpritePath('beard', `${look.beard}_${look.hairColor}`) });
  }

  if ((look.headTier ?? 0) > 0) {
    layers.push({ z: 70, url: `${HABITICA_BASE}gear/head/head_${hcls}_${look.headTier}.png` });
  }
  if ((look.shieldTier ?? 0) > 0 && hcls !== 'wizard') {
    layers.push({ z: 80, url: `${HABITICA_BASE}gear/shield/shield_${hcls}_${look.shieldTier}.png` });
  }
  if ((look.weaponTier ?? 0) > 0) {
    layers.push({ z: 90, url: `${HABITICA_BASE}gear/weapon/weapon_${hcls}_${look.weaponTier}.png` });
  }

  return layers.sort((a, b) => a.z - b.z);
}
