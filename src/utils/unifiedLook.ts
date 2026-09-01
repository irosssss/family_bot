/**
 * ЕДИНАЯ сборка образа персонажа («один персонаж — один образ — везде»).
 *
 * Проблема, которую решает: образ размазан по экранам — хаб/арена собирают
 * Habitica-тиры из habitica_equipped, Обзор (PlayerCard) — ULPC-слои из
 * equipped_codes, гардероб — что-то своё. Надел предмет в одном месте — в других
 * не менялось. Теперь все экраны вызывают getUnifiedLook(user) и рисуют
 * HabiticaAnimatedAvatar'ом (Habitica-стиль — канон: у него есть вся линейка
 * оружия/шляп/щитов; ULPC-линейка ограничена двумя голыми торсами).
 *
 * Приоритет источников (верхние перекрывают нижние):
 *   1. ULPC-торс из магазина (equipped_codes.body ∈ SHOP_TORSO_MAP)
 *      → маппится в ближайший Habitica-тир брони (look.armorTier).
 *   2. habitica_equipped (skin/hairBase/hairBangs/hairColor/beard + тиры
 *      из CharacterEditorModal, армороя и /equip).
 *   3. Дефолт семьи по display_name/роли.
 */
import { User } from '../types';
import {
  DEFAULT_LOOKS,
  HabiticaLook,
} from './habiticaAssets';
import { SHOP_TORSO_MAP } from './ulpcCharacter';
import { applyItemLook } from './shopLookMap';

/** ULPC-торс → Habitica-тир брони (визуальная близость комплектов). */
const ULPC_TORSO_TO_ARMOR_TIER: Record<string, number> = {
  leather_armor_shop: 1, // кожанка ~ стартовый сет
  suspenders: 1,
  overalls: 1,
  chainmail: 2,          // кольчуга ~ второй сет
  legion_armor: 3,       // легион ~ третий
  plate_armor_shop: 5,   // латы ~ топовый
};

function familyKey(user: User): keyof typeof DEFAULT_LOOKS {
  const n = (user.display_name || '').toLowerCase();
  if (n.includes('миша') || n.includes('misha')) return 'misha';
  if (n.includes('регина') || n.includes('regina')) return 'regina';
  if (n.includes('папа') || n.includes('papa')) return 'papa';
  if (n.includes('мама') || n.includes('mama')) return 'mama';
  return (user.gender === 'female' ? 'regina' : 'misha');
}

/** Базовый look: дефолт семьи, перекрытый habitica_equipped. */
export function getBaseLook(user: User): HabiticaLook {
  const key = familyKey(user);
  return { ...DEFAULT_LOOKS[key], ...((user as any).habitica_equipped || {}) } as HabiticaLook;
}

/**
 * Финальный look со всей экипировкой:
 *  - тиры из habitica_equipped уже в base;
 *  - ULPC-торс из магазина поднимает armorTier (если он выше текущего);
 *  - класс определяет форму брони (broad/slim) внутри HabiticaAnimatedAvatar.
 */
export function getUnifiedLook(user: User): HabiticaLook {
  let look = getBaseLook(user);
  const codes = ((user as any).equipped_codes || {}) as Record<string, string | undefined>;

  // Тиры ВСЕХ надетых предметов: оружие/щит/шляпa/старые брони (ITEM_LOOK_MAP).
  // items.code — стабильный ключ; render-time резолв (не миграция БД).
  look = applyItemLook(look, codes.weapon);
  look = applyItemLook(look, codes.shield);
  look = applyItemLook(look, codes.head);
  look = applyItemLook(look, codes.body);

  // ULPC-броня из магазина → armorTier (броня «сильнее» дефолта — показываем её)
  const bodyCode = codes.body;
  if (bodyCode && SHOP_TORSO_MAP[bodyCode]) {
    const tier = ULPC_TORSO_TO_ARMOR_TIER[bodyCode];
    if (tier != null && tier > (look.armorTier ?? 0)) {
      look.armorTier = tier;
    }
  }

  return look;
}

/** Нужен ли пользователю ULPC-рендер (для экранов, где он остаётся: Обзор). */
export function usesUlpcBody(user: User): boolean {
  const bodyCode = ((user as any).equipped_codes || {}).body as string | undefined;
  return !!(bodyCode && SHOP_TORSO_MAP[bodyCode]);
}
