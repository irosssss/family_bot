/**
 * ============================================================
 * ULPC Character Builder
 * ============================================================
 * Сборка слоёв персонажа из ULPC-ассетов.
 * Порядок слоёв критичен (снизу вверх):
 * body → legs → feet → torso → head → eyes → hair_bg → hair → weapon_bg → weapon_fg
 */

import type { UlpcLayer } from '../components/UlpcAvatar';

const B = '/assets/game/characters/ulpc/';

export interface UlpcCharacterConfig {
  sex: 'male' | 'female';
  /** Причёска: путь относительно ULPC (напр. 'male/hair_brown', 'hair/bangs') */
  hair: string;
  /**
   * Какие части волос существуют на диске:
   * 'main'  — только основной слой (hair/idle.png)
   * 'bg_fg' — только задняя + передняя (hair_bg, hair_fg), БЕЗ основного
   * 'full'  — все три (bg + main + fg)
   * По умолчанию 'full' (старое поведение)
   */
  hairMode?: 'main' | 'bg_fg' | 'full';
  /** Торс: 'shirt' | 'leather_armor' */
  torso: string;
  /** Штаны */
  legs?: string;
  /** Обувь */
  feet?: string;
  /** Оружие: 'weapons/sword_iron' | null */
  weapon?: string | null;
}

/** Дефолтные конфигурации семьи */
export const FAMILY_CHARACTERS: Record<string, UlpcCharacterConfig> = {
  papa: {
    sex: 'male', hair: 'male/hair_brown', hairMode: 'main', torso: 'shirt',
    legs: 'cuffed_pants', feet: 'basic', weapon: 'weapons/sword_iron',
  },
  mama: {
    sex: 'female', hair: 'female/hair_black', hairMode: 'main', torso: 'shirt',
    legs: 'cuffed_pants', feet: 'sara', weapon: null,
  },
  misha: {
     sex: 'male', hair: 'male/hair_dark', torso: 'leather_armor',
     legs: 'cuffed_pants', feet: 'ghillies', weapon: 'weapons/sword_iron',
   },
  regina: {
    sex: 'female', hair: 'female/hair_blonde', hairMode: 'bg_fg', torso: 'shirt',
    legs: 'cuffed_pants', feet: 'sara', weapon: null,
  },
};

/**
 * Собирает упорядоченный список слоёв для UlpcAvatar.
 * ponytail2-стили имеют fg/bg части — обрабатываются автоматически.
 */
export function buildUlpcLayers(cfg: UlpcCharacterConfig, anim: string = 'idle'): UlpcLayer[] {
  const layers: UlpcLayer[] = [];
  let z = 0;
  const add = (path: string) => {
    layers.push({ url: `${B}${path}/${anim}.png`, z: z++ });
  };

  // 1. Тело
  add(`${cfg.sex}/body`);
  // 2. Штаны
  add(`${cfg.sex}/legs/${cfg.legs || 'cuffed_pants'}`);
  // 3. Обувь
  if (cfg.feet) add(`${cfg.sex}/feet/${cfg.feet}`);
  // 4. Торс. Магазинные ULPC-торсы лежат в torso_shop/<name>/<sex>/idle.png —
  //    отдельная структура (не {sex}/torso/<name>/), поэтому собираем путь напрямую.
  if (cfg.torso.startsWith('torso_shop/')) {
    add(`${cfg.torso}/${cfg.sex}`);
  } else {
    add(`${cfg.sex}/torso/${cfg.torso}`);
  }
  // 4b. Голова
  add(`${cfg.sex}/head`);
  // 6. Глаза (только idle — в LPC глаза статичны вне idle)
  layers.push({ url: `${B}eyes/default/idle.png`, z: z++ });
  // 7. Волосы — по режиму (bg-часть если есть — за головой)
  const hairBase = cfg.hair;
  const hairMode = cfg.hairMode || 'full';

  // bg-часть: для 'full' и 'bg_fg'
  if (hairMode === 'full' || hairMode === 'bg_fg') {
    layers.push({ url: `${B}${hairBase}_bg/${anim}.png`, z: z++ });
  }
  // 8. Оружие ЗА спиной (bg) — до передних волос
  if (cfg.weapon) {
    layers.push({ url: `${B}${cfg.weapon}/bg/${anim}.png`, z: z++ });
  }
  // Основная часть волос: для 'full' и 'main'
  if (hairMode === 'full' || hairMode === 'main') {
    layers.push({ url: `${B}${hairBase}/${anim}.png`, z: z++ });
  }
  // fg-часть: для 'full' и 'bg_fg'
  if (hairMode === 'full' || hairMode === 'bg_fg') {
    layers.push({ url: `${B}${hairBase}_fg/${anim}.png`, z: z++ });
  }
  // 10. Оружие В РУКЕ (fg) — поверх всего
  if (cfg.weapon) {
    layers.push({ url: `${B}${cfg.weapon}/fg/${anim}.png`, z: z++ });
  }

  // Фильтруем несуществующие (404 слои просто не отрисуются — img.onerror → null)
  return layers.filter((l) => l.url);
}

/** Удобная обёртка: конфиг по имени члена семьи */
export function getFamilyLayers(name: string): UlpcLayer[] {
  const cfg = FAMILY_CHARACTERS[name.toLowerCase()];
  if (!cfg) return [];
  return buildUlpcLayers(cfg);
}

/**
 * Маппинг code предмета из магазина → путь ULPC торса.
 * Магазин (initialData INITIAL_SHOP_ITEMS, slot 'body') хранит
 * новые вещи с code = имени папки в torso_shop/.
 */
export const SHOP_TORSO_MAP: Record<string, string> = {
  // Путь ОТНОСИТЕЛЬНО characters/ulpc/ (папки torso_shop/{name}/{sex}/, не {sex}/torso/):
  // файлы лежат в torso_shop/<name>/<male|female>/idle.png, а базовый шаблон слоёв
  // строит {sex}/torso/<torso> — поэтому для магазинных торсов используем
  // специальную обработку в buildUlpcLayers (см. torsoIsShop).
  leather_armor_shop: 'torso_shop/leather',
  legion_armor: 'torso_shop/legion',
  plate_armor_shop: 'torso_shop/plate',
  chainmail: 'torso_shop/chainmail',
  overalls: 'torso_shop/overalls',
  suspenders: 'torso_shop/suspenders',
};

/**
 * Проверяет, является ли equipped.body ULPC-торсом (новый магазин).
 * Возвращает путь папки или null.
 */
export function resolveUlpcTorso(bodyCode: string | undefined): string | null {
  if (!bodyCode) return null;
  return SHOP_TORSO_MAP[bodyCode] || null;
}

/**
 * Маппинг пользователя игры → персонаж.
 * display_name/роль определяют внешний вид.
 * Если пользователь выбрал ULPC-причёску в редакторе (ulpc_hair) — она приоритетна.
 */
export function getUserCharacter(user: {
  display_name?: string;
  family_role?: string;
  gender?: string;
  is_admin?: boolean;
  ulpc_hair?: string;
  ulpc_hair_color?: string;
  equipped_body?: string; // equipped.body — если это ULPC-торс, подставляем в cfg.torso
}): { name: string; cfg: UlpcCharacterConfig } {
  const n = (user.display_name || '').toLowerCase();

  let result: { name: string; cfg: UlpcCharacterConfig };
  if (n.includes('папа') || n === 'papa') result = { name: 'papa', cfg: { ...FAMILY_CHARACTERS.papa } };
  else if (n.includes('мама') || n === 'mama') result = { name: 'mama', cfg: { ...FAMILY_CHARACTERS.mama } };
  else if (n.includes('миша') || n === 'misha') result = { name: 'misha', cfg: { ...FAMILY_CHARACTERS.misha } };
  else if (n.includes('регина') || n === 'regina') result = { name: 'regina', cfg: { ...FAMILY_CHARACTERS.regina } };
  else if (user.family_role === 'parent') {
    result = {
      name: 'parent',
      cfg: { ...(user.gender === 'female' ? FAMILY_CHARACTERS.mama : FAMILY_CHARACTERS.papa) },
    };
  } else {
    result = {
      name: 'child',
      cfg: { ...(user.gender === 'female' ? FAMILY_CHARACTERS.regina : FAMILY_CHARACTERS.misha) },
    };
  }

  // Кастомная причёска из редактора — приоритет над дефолтом семьи
  if (user.ulpc_hair && user.ulpc_hair_color) {
    result.cfg.hair = `hair_colors/${user.ulpc_hair}_${user.ulpc_hair_color}`;
    result.cfg.hairMode = 'main';
  }

  // Надетый ULPC-торс из магазина — переопределяет дефолтный торс семьи.
  // Это ядро примерки: сменили equipped.body → cfg.torso → слои пересобрались.
  const shopTorso = resolveUlpcTorso(user.equipped_body);
  if (shopTorso) {
    result.cfg.torso = shopTorso;
  }

  return result;
}