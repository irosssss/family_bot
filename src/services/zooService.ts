/**
 * Habitica Зоопарк (Этап 5): яйцо + зелье = питомец.
 * 82 вида x 10 окрасов = 820 комбинаций.
 *
 * Спрайты: /assets/game/habitica/pets/Pet-{Species}-{Potion}.png
 */

export const HABITICA_BASE = '/assets/game/habitica';

/** Яйца (10 стандартных) — цена в золоте */
export const EGGS: Array<{ id: string; name: string; cost: number }> = [
  { id: 'Base', name: 'Обычное яйцо', cost: 30 },
  { id: 'White', name: 'Белое яйцо', cost: 30 },
  { id: 'Desert', name: 'Песчаное яйцо', cost: 35 },
  { id: 'Red', name: 'Красное яйцо', cost: 35 },
  { id: 'Golden', name: 'Золотое яйцо', cost: 60 },
  { id: 'Shade', name: 'Теневое яйцо', cost: 50 },
  { id: 'Skeleton', name: 'Костяное яйцо', cost: 45 },
  { id: 'Zombie', name: 'Яйцо зомби', cost: 45 },
  { id: 'CottonCandyBlue', name: 'Голубое яйцо', cost: 40 },
  { id: 'CottonCandyPink', name: 'Розовое яйцо', cost: 40 },
];

/** Инкубационные зелья */
export const POTIONS: Array<{ id: string; name: string; cost: number }> = [
  { id: 'Base', name: 'Обычное зелье', cost: 20 },
  { id: 'White', name: 'Белое зелье', cost: 20 },
  { id: 'Desert', name: 'Пустынное зелье', cost: 25 },
  { id: 'Red', name: 'Красное зелье', cost: 25 },
  { id: 'Golden', name: 'Золотое зелье', cost: 40 },
  { id: 'Shade', name: 'Теневое зелье', cost: 35 },
  { id: 'Skeleton', name: 'Костяное зелье', cost: 30 },
  { id: 'Zombie', name: 'Зомби-зелье', cost: 30 },
  { id: 'CottonCandyBlue', name: 'Голубное зелье', cost: 22 },
  { id: 'CottonCandyPink', name: 'Розовое зелье', cost: 22 },
];

/** Виды питомцев с русскими именами */
/**
 * Виды питомцев с русскими именами.
 * Соответствие пакету HabitRPG/habitica-images (eggs.js): ключ = ключ яйца.
 * Несуществующие виды пакета заменены (Seal→Otter, Duck→Platypus,
 * Stoneworking→Rock, MammothRider→Mammoth); регистр TRex — как в пакете.
 */
export const SPECIES_RU: Record<string, string> = {
  Wolf: 'Волчонок', Dragon: 'Дракончик', BearCub: 'Медвежонок', Fox: 'Лисёнок',
  TigerCub: 'Тигрёнок', LionCub: 'Львёнок', Cat: 'Котик', Bunny: 'Кролик',
  PandaCub: 'Пандочка', Owl: 'Совёнок', Penguin: 'Пингвинчик', Turtle: 'Черепашка',
  Squirrel: 'Бельчонок', Hedgehog: 'Ёжик', Dog: 'Щенок', Falcon: 'Соколёнок',
  Deer: 'Оленёнок', FlyingPig: 'Поросёнок', Frog: 'Лягушонок', Monkey: 'Обезьянка',
  Rat: 'Мышонок', Snail: 'Улиточка', Spider: 'Паучок', Whale: 'Китик',
  Octopus: 'Осьминожек', Crab: 'Крабик', Otter: 'Тюлёнок', Sheep: 'Ягнёнок',
  Horse: 'Жеребёнок', Cow: 'Телёнок', Alligator: 'Крокодильчик', Alpaca: 'Альпачка',
  Armadillo: 'Броненосик', Axolotl: 'Аксолотлик', Badger: 'Барсучок', Beetle: 'Жучок',
  Butterfly: 'Бабочка', Cactus: 'Кактусик', Chameleon: 'Хамелеончик', Cheetah: 'Гепардик',
  Cuttlefish: 'Каракатица', Giraffe: 'Жирафик', Gryphon: 'Грифончик', GuineaPig: 'Свинка',
  Pterodactyl: 'Птеродактиль', TRex: 'Рексик', Triceratops: 'Трицератопсик',
  Velociraptor: 'Велосирик', Sabretooth: 'Саблезубик', Ferret: 'Хорёк',
  Rooster: 'Петушок', Rock: 'Камнешек',
};

export function speciesRu(species: string): string {
  return SPECIES_RU[species] || species;
}

export function petSpriteUrl(species: string, potion: string): string {
  return `${HABITICA_BASE}/pets/Pet-${species}-${potion}.png`;
}

export function mountIconUrl(species: string, potion: string): string {
  return `${HABITICA_BASE}/stable/mounts/icon/Mount_Icon_${species}-${potion}.png`;
}

export interface PetCombo {
  species: string;
  potion: string;
  spriteUrl: string;
  nameRu: string;
  colorRu: string;
}

/** Все доступные комбинации (820 шт), детерминированный порядок */
export function allCombinations(): PetCombo[] {
  const combos: PetCombo[] = [];
  for (const sp of Object.keys(SPECIES_RU).sort()) {
    for (const pot of POTIONS) {
      combos.push({
        species: sp,
        potion: pot.id,
        spriteUrl: petSpriteUrl(sp, pot.id),
        nameRu: speciesRu(sp),
        colorRu: pot.name.replace(' зелье', ''),
      });
    }
  }
  return combos;
}

/**
 * Инкубация: яйцо + зелье = питомец.
 * Возвращает спрайт и русское описание.
 */
/**
 * Инкубация: яйцо + зелье = окрас питомца.
 * Проверка существования комбинации — на фронте (img.onerror → fallback Base).
 */
export function hatch(eggId: string, potionId: string): { eggId: string; potionId: string; eggName: string; potionName: string } {
  const egg = EGGS.find((e) => e.id === eggId);
  const pot = POTIONS.find((p) => p.id === potionId);
  return {
    eggId,
    potionId,
    eggName: egg?.name || 'Обычное яйцо',
    potionName: pot?.name || 'Обычное зелье',
  };
}
