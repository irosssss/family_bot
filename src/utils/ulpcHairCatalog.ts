/**
 * ============================================================
 * ULPC Каталог причёсок и цветов для гардероба
 * ============================================================
 * Сгенерировано по фактическим файлам hair_colors/ (63 стиля × 6 цветов = 378).
 * Все стили однослойные (hairMode: 'main').
 */

export interface UlpcHairStyle {
  id: string;
  name: string;
}

export interface UlpcHairColor {
  id: string;
  name: string;
}

/** Причёски — точно по папкам hair_colors/ */
export const ULPC_HAIR_STYLES: UlpcHairStyle[] = [
  { id: 'afro', name: 'Афро' },
  { id: 'balding', name: 'Лысеющий' },
  { id: 'bangs', name: 'Чёлка' },
  { id: 'bangs_bun', name: 'Чёлка с пучком' },
  { id: 'bangslong', name: 'Длинная чёлка' },
  { id: 'bangsshort', name: 'Короткая чёлка' },
  { id: 'bedhead', name: 'Растрёпанные' },
  { id: 'bob', name: 'Каре' },
  { id: 'bob_side_part', name: 'Каре на бок' },
  { id: 'buzzcut', name: 'Ёжик' },
  { id: 'cornrows', name: 'Корнроу' },
  { id: 'cowlick', name: 'Хохолок' },
  { id: 'cowlick_tall', name: 'Высокий хохолок' },
  { id: 'curly_long', name: 'Длинные кудри' },
  { id: 'curly_short', name: 'Короткие кудри' },
  { id: 'curly_short2', name: 'Кудри 2' },
  { id: 'curtains', name: 'Шторы' },
  { id: 'curtains_long', name: 'Длинные шторы' },
  { id: 'dreadlocks_long', name: 'Дреды длинные' },
  { id: 'dreadlocks_short', name: 'Дреды короткие' },
  { id: 'flat_top_fade', name: 'Флэт-топ фейд' },
  { id: 'flat_top_straight', name: 'Флэт-топ прямой' },
  { id: 'half_up', name: 'Мальвинка' },
  { id: 'halfmessy', name: 'Полураспущенные' },
  { id: 'high_and_tight', name: 'Милитари' },
  { id: 'idol', name: 'Айдол' },
  { id: 'jewfro', name: 'Джуфро' },
  { id: 'lob', name: 'Лонг-боб' },
  { id: 'long', name: 'Длинные' },
  { id: 'long_messy', name: 'Длинные небрежные' },
  { id: 'long_messy2', name: 'Длинные небрежные 2' },
  { id: 'long_straight', name: 'Длинные прямые' },
  { id: 'longhawk', name: 'Длинный ирокез' },
  { id: 'loose', name: 'Распущенные' },
  { id: 'messy1', name: 'Небрежные 1' },
  { id: 'messy2', name: 'Небрежные 2' },
  { id: 'messy3', name: 'Небрежные 3' },
  { id: 'mop', name: 'Шапка волос' },
  { id: 'natural', name: 'Натуральные' },
  { id: 'page', name: 'Стрижка паж' },
  { id: 'page2', name: 'Паж 2' },
  { id: 'parted', name: 'На пробор' },
  { id: 'parted2', name: 'Пробор 2' },
  { id: 'parted3', name: 'Пробор 3' },
  { id: 'parted_side_bangs', name: 'Боковой пробор с чёлкой' },
  { id: 'parted_side_bangs2', name: 'Боковой пробор 2' },
  { id: 'pigtails', name: 'Хвостики' },
  { id: 'pigtails_bangs', name: 'Хвостики с чёлкой' },
  { id: 'pixie', name: 'Пикси' },
  { id: 'plain', name: 'Прямые' },
  { id: 'relm_short', name: 'Короткие Рельм' },
  { id: 'shorthawk', name: 'Короткий ирокез' },
  { id: 'spiked', name: 'Шипы' },
  { id: 'spiked2', name: 'Шипы 2' },
  { id: 'spiked_beehive', name: 'Шипы улей' },
  { id: 'spiked_liberty', name: 'Либерти-шипы' },
  { id: 'spiked_liberty2', name: 'Либерти 2' },
  { id: 'spiked_porcupine', name: 'Дикобраз' },
  { id: 'swoop', name: 'Взмах' },
  { id: 'swoop_side', name: 'Взмах набок' },
  { id: 'twists_fade', name: 'Твисты фейд' },
  { id: 'twists_straight', name: 'Твисты прямые' },
  { id: 'unkempt', name: 'Неухоженные' },
];

/** Цвета волос */
export const ULPC_HAIR_COLORS: UlpcHairColor[] = [
  { id: 'blonde', name: 'Блонд' },
  { id: 'red', name: 'Рыжий' },
  { id: 'brown', name: 'Каштановый' },
  { id: 'dark', name: 'Тёмный' },
  { id: 'black', name: 'Чёрный' },
  { id: 'gray', name: 'Седой' },
];

/**
 * Путь к причёске: hair_colors/<style>_<color>
 * Все стили однослойные (hairMode 'main').
 */
export function getUlpcHairPath(styleId: string, colorId: string): string {
  return `hair_colors/${styleId}_${colorId}`;
}

/**
 * Конфиг волос для UlpcCharacterConfig.
 */
export function buildHairConfig(
  styleId: string,
  colorId: string
): { hair: string; hairMode: 'main' } {
  return {
    hair: getUlpcHairPath(styleId, colorId),
    hairMode: 'main',
  };
}