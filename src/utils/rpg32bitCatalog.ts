// Каталог доступных 32-bit LPC ассетов для персонажа
// Все пути относительно public/ директории

export type AssetSlot =
  | 'back' | 'legs' | 'body' | 'arms' | 'shirt'
  | 'pants' | 'shoes' | 'mount' | 'head' | 'face'
  | 'back_hair' | 'front_hair' | 'hat' | 'shield'
  | 'back_weapon' | 'front_weapon' | 'effect';

export type EmotionType = 'happy' | 'neutral' | 'sad' | 'excited' | 'tired';

export type GenderType = 'male' | 'female';

// === БАЗОВЫЕ ТЕЛА ===
export const BODY_BASES: Record<GenderType, string> = {
  male: '/assets/game/characters/bases/lpc_body_male.png',
  female: '/assets/game/characters/bases/lpc_body_female_lidia.png',
};

// === ЭМОЦИИ / ЛИЦА ===
// В LPC эмоции встроены в спрайты head — используем базовые
// цвета кожи для разных типов
export const FACE_ASSETS: Record<string, string> = {
  male: '/assets/game/characters/bases/lpc_body_male.png',
  female: '/assets/game/characters/bases/lpc_body_female_lidia.png',
};

// === ВОЛОСЫ ===
export const HAIR_ASSETS: Record<string, string> = {
  blonde: '/assets/game/characters/heads/lpc_head_hair_blonde.png',
};

// === ГОЛОВНЫЕ УБОРЫ ===
export const HEADGEAR_ASSETS: Record<string, string> = {
  chain_helmet: '/assets/game/characters/heads/lpc_head_chain_armor_helmet.png',
  chain_hood: '/assets/game/characters/heads/lpc_head_chain_armor_hood.png',
  leather_hat: '/assets/game/characters/heads/lpc_head_leather_armor_hat.png',
  plate_helmet: '/assets/game/characters/heads/lpc_head_plate_armor_helmet.png',
  robe_hood: '/assets/game/characters/heads/lpc_head_robe_hood.png',
};

// === ТОРС / ОДЕЖДА ВЕРХ ===
export const TORSO_ASSETS: Record<string, string> = {
  chain_armor_jacket: '/assets/game/characters/clothing/lpc_torso_chain_armor_jacket_purple.png',
  chain_armor_torso: '/assets/game/characters/clothing/lpc_torso_chain_armor_torso.png',
  leather_armor_bracers: '/assets/game/characters/clothing/lpc_torso_leather_armor_bracers.png',
  leather_armor_shirt: '/assets/game/characters/clothing/lpc_torso_leather_armor_shirt_white.png',
  leather_armor_shoulders: '/assets/game/characters/clothing/lpc_torso_leather_armor_shoulders.png',
  leather_armor_torso: '/assets/game/characters/clothing/lpc_torso_leather_armor_torso.png',
  plate_armor_torso: '/assets/game/characters/clothing/lpc_torso_plate_armor_torso.png',
  plate_armor_arms: '/assets/game/characters/clothing/lpc_torso_plate_armor_arms_shoulders.png',
  robe_shirt: '/assets/game/characters/clothing/lpc_torso_robe_shirt_brown.png',
};

// === ШТАНЫ / ОДЕЖДА НИЗ ===
export const LEGS_ASSETS: Record<string, string> = {
  pants_greenish: '/assets/game/characters/clothing/lpc_legs_pants_greenish.png',
  plate_pants: '/assets/game/characters/clothing/lpc_legs_plate_armor_pants.png',
  robe_skirt: '/assets/game/characters/clothing/lpc_legs_robe_skirt.png',
};

// === ОБУВЬ ===
export const SHOES_ASSETS: Record<string, string> = {
  plate_armor_shoes: '/assets/game/characters/clothing/lpc_feet_plate_armor_shoes.png',
  shoes_brown: '/assets/game/characters/clothing/lpc_feet_shoes_brown.png',
};

// === ПОЯСА ===
export const BELT_ASSETS: Record<string, string> = {
  leather: '/assets/game/characters/clothing/lpc_belt_leather.png',
  rope: '/assets/game/characters/clothing/lpc_belt_rope.png',
};

// === ОРУЖИЕ ===
export const WEAPON_ASSETS: Record<string, string> = {
  dagger: '/assets/game/equipment/weapons/lpc_weapon_dagger.png',
  bow: '/assets/game/equipment/weapons/lpc_weapon_bow.png',
  spear: '/assets/game/equipment/weapons/lpc_weapon_spear.png',
  staff: '/assets/game/equipment/weapons/lpc_weapon_staff.png',
  arrow: '/assets/game/equipment/weapons/lpc_weapon_arrow.png',
};

// === ЩИТЫ ===
export const SHIELD_ASSETS: Record<string, string> = {
  shield_cutout_body: '/assets/game/equipment/shields/lpc_weapon_shield_cutout_body.png',
  shield_cutout_chain: '/assets/game/equipment/shields/lpc_weapon_shield_cutout_chain_armor_helmet.png',
};

// === ПЛАЩИ / ЗАДНИЙ СЛОЙ ===
export const CLOAK_ASSETS: Record<string, string> = {
  quiver: '/assets/game/equipment/cloaks/lpc_behind_quiver.png',
};

// === СТРУКТУРА Z-ИНДЕКСОВ (согласно APPROVED_SPEC) ===
export const Z_INDEX: Record<string, number> = {
  shadow: 0,
  back: 5,          // плащ/крылья/рюкзак
  legs: 10,         // ноги
  body: 15,         // торс/тело
  arms: 20,         // руки
  shirt: 25,        // одежда верх
  pants: 30,        // одежда низ
  shoes: 35,        // обувь
  mount: 40,        // маунт
  head: 45,         // голова
  face: 50,         // лицо (эмоции)
  back_hair: 55,    // волосы задние
  front_hair: 60,   // волосы передние
  hat: 65,          // головной убор
  shield: 70,       // щит
  back_weapon: 75,  // оружие задней руки
  front_weapon: 80, // оружие передней руки
  effect: 85,       // эффекты/аура
};

// === МАППИНГ СЛОТОВ ЭКИПИРОВКИ → ТИПЫ СЛОЁВ ===
export const EQUIPMENT_SLOT_MAP: Record<string, string> = {
  head: 'hat',
  weapon: 'front_weapon',
  shield: 'shield',
  body: 'shirt',
  cloak: 'back',
  accessory: 'effect',
  mount: 'mount',
};

// === ПОЛУЧИТЬ URL АССЕТА ПО ТИПУ И КЛЮЧУ ===
export function getAssetUrl(category: string, key: string): string | null {
  const catalogs: Record<string, Record<string, string>> = {
    headgear: HEADGEAR_ASSETS,
    torso: TORSO_ASSETS,
    legs: LEGS_ASSETS,
    shoes: SHOES_ASSETS,
    belt: BELT_ASSETS,
    weapon: WEAPON_ASSETS,
    shield: SHIELD_ASSETS,
    cloak: CLOAK_ASSETS,
    hair: HAIR_ASSETS,
  };

  const catalog = catalogs[category];
  if (!catalog) return null;
  return catalog[key] || null;
}