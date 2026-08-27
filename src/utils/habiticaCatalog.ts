/**
 * Каталог ассетов Habitica (github.com/HabitRPG/habitica-images).
 * Ассеты лежат в /assets/game/habitica/ — см. docs/ASSET_MANIFEST.md.
 *
 * Нейминг Habitica: quest_{id}.png (боссы), Pet-{Species}-{Potion}.png (питомцы),
 * {slot}_{class}_{tier}.png (экипировка), background_{id}.png (фоны).
 */

export const HABITICA_BASE = '/assets/game/habitica/';

// ============ БОССЫ: 117 шт + ротация по неделям ============

export interface BossDef {
  id: string;           // 'slime', 'trex', 'kraken'
  name: string;         // русское имя для UI
  spriteUrl: string;    // полный путь
}

/** Русские имена боссов. Ключи — id из нейминга quest_{id}.png */
const BOSS_NAMES_RU: Record<string, string> = {
  alien: 'Пришелец из Запущенных Дел',
  alligator: 'Аллигатор Лени',
  alpaca: 'Альпака Хаоса',
  armadillo: 'Броненосец Прокрастинации',
  atom1: 'Атом Беспорядка',
  axolotl: 'Аксолотль Забытых Дел',
  badger: 'Барсук Срывающих Сроков',
  basilist: 'Базилиск Вечного Завтра',
  beetle: 'Жук-Разрушитель Рутины',
  bewilder: 'Дух Растерянности',
  blackPearl: 'Чёрная Жемчужина Глубин',
  bronze: 'Бронзовый Голем Откладывания',
  bunny: 'Кролик-Времяубийца',
  butterfly: 'Мотылёк Хаоса',
  cat: 'Кот Прокрастинации',
  chameleon: 'Хамелеон Уклонения',
  cheetah: 'Гепард Спешки Впустую',
  cow: 'Корова Непокорности',
  crab: 'Краб-Откладыватель',
  dilatory: 'Ужас Города Дилатори',
  dilatory_derby: 'Дерби Дилатори',
  dilatoryDistress1: 'Беда Дилатори I',
  dilatoryDistress2: 'Беда Дилатори II',
  dilatoryDistress3: 'Беда Дилатори III',
  dog: 'Пёс Упущенного Времени',
  dolphin: 'Дельфин-Прокрастинатор',
  dustbunnies: 'Пылевые Кролики Хаоса',
  egg: 'Яйцо-Обломыш Планов',
  evilsanta: 'Злой Санта Недели',
  evilsanta2: 'Злой Санта: Возвращение',
  falcon: 'Сокол Срывающих План',
  ferret: 'Хорёк-Хаосит',
  fluorite: 'Флюоритовый Пожиратель',
  frog: 'Жаба Застоя',
  fungi: 'Грибной Туман Лени',
  ghost_stag: 'Призрачный Олень',
  giraffe: 'Жираф Высоких Отговорок',
  goldenknight1: 'Золотой Рыцарь I',
  goldenknight2: 'Золотой Рыцарь II',
  goldenknight3: 'Золотой Рыцарь III',
  gryphon: 'Грифон Беспорядка',
  guineapig: 'Морская Свинка Сомнений',
  harpy: 'Гарпия Напоминаний',
  hedgehog: 'Ёж Отложенных Дел',
  hippo: 'Гиппопотам Лени',
  horse: 'Конь Непослушания',
  jade: 'Нефритовый Поглотитель',
  kangaroo: 'Кенгуру-Перекладыватель',
  kraken: 'Кракен Несделанных Дел',
  lostMasterclasser1: 'Забытый Мастер I',
  lostMasterclasser2: 'Забытый Мастер II',
  lostMasterclasser3: 'Забытый Мастер III',
  lostMasterclasser4: 'Забытый Мастер IV',
  mayhemMistiflying1: 'Майхем Мистификатор I',
  mayhemMistiflying2: 'Майхем Мистификатор II',
  mayhemMistiflying3: 'Майхем Мистификатор III',
  monkey: 'Обезьяна-Срыватель',
  moon1: 'Лунный Разрушитель I',
  moon2: 'Лунный Разрушитель II',
  moon3: 'Лунный Разрушитель III',
  moonstone1: 'Лунный Камень I',
  moonstone2: 'Лунный Камень II',
  moonstone3: 'Лунный Камень III',
  nudibranch: 'Нудибранч-Отвлекатель',
  octopus: 'Осьминог Многозадачности',
  onyx: 'Ониксовый Ужас',
  opal: 'Опаловый Лентяй',
  otter: 'Выдра Откладываний',
  owl: 'Сова Ночных Сидений',
  peacock: 'Павлин Гордости',
  penguin: 'Пингвин Замороженных Дел',
  pinkMarble: 'Розовый Мраморный Пожиратель',
  platypus: 'Утконос Путаницы',
  pterodactyl: 'Птеродактиль Дедлайнов',
  raccoon: 'Енот-Расхититель Времени',
  rat: 'Крыса Сваленных Задач',
  robot: 'Робот-Автоматизатор Лени',
  rock: 'Каменный Испытатель',
  rooster: 'Петух-Напоминальщик',
  ruby: 'Рубиновый Опустошитель',
  sabretooth: 'Саблезубый Сроков',
  seaserpent: 'Морской Змей Прокрастинации',
  sheep: 'Овечка-Отсыпальщица',
  slime: 'Слизневый Король',
  sloth: 'Ленивец-Чемпион',
  snail: 'Улитка Медленного Старта',
  snake: 'Змея-Запутыватель',
  solarSystem: 'Солнечная Система Сбоев',
  spider: 'Паук Запутанных Дел',
  squirrel: 'Белка-Накопитель Отговорок',
  stoikalmCalamity1: 'Стоикальмская Беда I',
  stoikalmCalamity2: 'Стоикальмская Беда II',
  stoikalmCalamity3: 'Стоикальмская Беда III',
  stone: 'Каменный Голем Рутины',
  taskwoodsTerror1: 'Террор Тасквудса I',
  taskwoodsTerror2: 'Террор Тасквудса II',
  taskwoodsTerror3: 'Террор Тасквудса III',
  treeling: 'Древесный Призрак',
  trex: 'Ти-Рекс Невыполнимых',
  trex_undead: 'Зомби Ти-Рекс',
  triceratops: 'Трицератопс Упрямства',
  turquoise: 'Бирюзовый Разрушитель',
  turtle: 'Черепаха-Замедлитель',
  unicorn: 'Единорог Иллюзий',
  velociraptor: 'Велоцираптор Быстрых Отговорок',
  vice1: 'Порочный Дух I',
  vice2: 'Порочный Дух II',
  vice3: 'Порочный Дух III',
  virtualpet: 'Виртуальный Питомец-Обманщик',
  waffle: 'Вафля-Пожиратель Времени',
  whale: 'Кит Огромных Дел',
  windup: 'Заводная Игрушка Хаоса',
  yarn: 'Клубок Запутанности',
};

/** Все боссы (исключая TEMPLATE_FOR_MISSING_IMAGE) */
export const HABITICA_BOSSES: BossDef[] = Object.entries(BOSS_NAMES_RU)
  .map(([id, name]) => ({
    id,
    name,
    spriteUrl: `${HABITICA_BASE}bosses/quest_${id}.png`,
  }))
  .filter((b) => b.id !== 'TEMPLATE_FOR_MISSING_IMAGE');

/**
 * Детерминированная недельная ротация: индекс = номер недели с эпохи % длина.
 * Одна неделя — один босс. Начало недели — понедельник.
 */
export function getWeeklyBoss(date: Date = new Date()): BossDef {
  const startOfYear = new Date(date.getFullYear(), 0, 1);
  const weekMs = 7 * 24 * 60 * 60 * 1000;
  const weekIndex = Math.floor((date.getTime() - startOfYear.getTime()) / weekMs);
  return HABITICA_BOSSES[weekIndex % HABITICA_BOSSES.length];
}

/** Босс по id (для выбора конкретного родителем) */
export function getBossById(id: string): BossDef | undefined {
  return HABITICA_BOSSES.find((b) => b.id === id);
}

// ============ ПИТОМЦЫ ============

/**
 * URL спрайта питомца по виду и окрасу.
 * Вид: Wolf, Dragon-Creature, BearCub, Fox... (250+ видов)
 * Окрас: Base, Golden, Zombie, Skeleton, Shade, White, Red, Desert,
 *        CottonCandyBlue, CottonCandyPink
 */
export function habiticaPetUrl(species: string, potion = 'Base'): string {
  return `${HABITICA_BASE}pets/Pet-${species}-${potion}.png`;
}

/** Популярные виды для зоопарка (русские имена) */
export const PET_SPECIES_RU: Record<string, string> = {
  Wolf: 'Волчонок',
  DragonCreature: 'Дракончик',
  BearCub: 'Медвежонок',
  Fox: 'Лисёнок',
  Tiger: 'Тигрёнок',
  Lion: 'Львёнок',
  Cat: 'Котёнок',
  DogCorgi: 'Корги',
  Owl: 'Совёнок',
  Penguin: 'Пингвинёнок',
  Turtle: 'Черепашка',
  Rabbit: 'Кролик',
  Squirrel: 'Белочка',
  Hedgehog: 'Ёжик',
};

// ============ ФОНЫ ЛОКАЦИЙ ============

export function habiticaBgUrl(id: string): string {
  return `${HABITICA_BASE}backgrounds/background_${id}.png`;
}

// ============ ARMOIRE (сундук) ============

/** Все предметы зачарованного сундука (598 шт) */
export function habiticaArmoireUrls(): string[] {
  // Заполняется лениво при интеграции магазина (Этап 6)
  return [];
}
