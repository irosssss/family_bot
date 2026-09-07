import type { DemoBoss, DemoClass, DemoItem, DemoPet, DemoState, DemoSubtype, DemoUser } from './types';

export const DEMO_CLASSES: { id: DemoClass; name: string; description: string; color: string }[] = [
  { id: 'warrior', name: 'Воин', description: 'Смелость заботиться о доме', color: '#a9573f' },
  { id: 'mage', name: 'Маг', description: 'Любопытство и новые открытия', color: '#7360a4' },
  { id: 'healer', name: 'Целитель', description: 'Тепло и забота о близких', color: '#568577' },
  { id: 'rogue', name: 'Разбойник', description: 'Ловкость в маленьких делах', color: '#526f94' },
];

const bossSheets: { sourceRef: string; names: string[]; ids: string[] }[] = [
  { sourceRef: '16_10_51', names: ['Прокрастинация', 'Лень', 'Хаос', 'Скука', 'Бардак', 'Ссора', 'Гаджетный гоблин', 'Пожиратель времени'],
    ids: ['procrastination', 'laziness', 'chaos', 'boredom', 'clutter', 'quarrel', 'gadget-goblin', 'time-eater'] },
  { sourceRef: '16_23_34', names: ['Лесной великан', 'Огненный дракон', 'Ледяной страж', 'Тёмный рыцарь', 'Механический голем', 'Король слизней', 'Пират-призрак', 'Песчаный червь', 'Ведьма теней', 'Небесный страж', 'Древний дракон', 'Повелитель хаоса'],
    ids: ['forest-giant', 'fire-dragon', 'ice-guardian', 'dark-knight', 'mechanical-golem', 'slime-king', 'ghost-pirate', 'sand-worm', 'shadow-witch', 'celestial-guardian', 'ancient-dragon', 'chaos-lord'] },
  { sourceRef: '16_23_40', names: ['Каменный голем', 'Лесной дух', 'Огненный дракон — хранитель', 'Ледяной великан', 'Тёмный рыцарь — страж', 'Король скелетов', 'Пожиратель времени — хранитель', 'Механический титан'],
    ids: ['stone-golem', 'forest-spirit', 'fire-dragon-guardian', 'ice-giant', 'dark-knight-guardian', 'skeleton-king', 'time-eater-guardian', 'mechanical-titan'] },
  { sourceRef: '16_23_45', names: ['Гряземонстр', 'Экранояд', 'Сладкоежка', 'Гневозавр', 'Страхотень', 'Беспорядок', 'Поздноход', 'Забывака', 'Прокрастинация — ленивец', 'Самокритик', 'Сравниватель', 'Финальный босс'],
    ids: ['dirt-monster', 'screen-eater', 'sweet-tooth', 'anger-dino', 'fear-shadow', 'disorder', 'late-snail', 'forgetful-ghost', 'procrastination-sloth', 'self-critic', 'comparer', 'final-boss'] },
  { sourceRef: '16_23_53', names: ['Тёмный экран', 'Повелитель прокрастинации', 'Король сладостей', 'Гора домашки', 'Вирус отвлечений', 'Босс гнева', 'Пластиковый дракон', 'Экзаменационный страж', 'Королева скуки'],
    ids: ['dark-screen', 'procrastination-lord', 'sweet-king', 'homework-mountain', 'distraction-virus', 'anger-boss', 'plastic-dragon', 'exam-guardian', 'boredom-queen'] },
];

export function createBossCatalog(): DemoBoss[] {
  return bossSheets.flatMap((sheet, sheetIndex) => sheet.names.map((name, sourceIndex) => ({
    id: sheet.ids[sourceIndex], name,
    description: `Семейное приключение «${name}». Маленькие полезные дела помогают справиться вместе.`,
    art: `/assets/game/demo/bosses/${sheet.ids[sourceIndex]}.png`,
    enabled: true, order: sheetIndex * 20 + sourceIndex,
    reference: `Изображение Codex 4 сент. 2026 г., ${sheet.sourceRef}.png`,
    sourceRef: sheet.sourceRef, sourceIndex,
    theme: sheetIndex === 0 ? 'Домашние приключения' : sheetIndex < 3 ? 'Сказочные хранители' : 'Маленькие трудности',
    hp: sheetIndex === 0 ? 60 + sourceIndex * 10 : 90 + sourceIndex * 10,
    ability: ['Прячется за незаконченные дела', 'Любит отвлекать от одного маленького шага', 'Становится добрее, когда семья помогает друг другу'][sourceIndex % 3],
    reward: { coins: 25 + Math.floor(sourceIndex / 3) * 5, xp: 20 },
  }))).map((boss, index) => ({ ...boss, art: `/assets/game/demo/boss-b${String(index + 1).padStart(2, '0')}.png` }));
}

export function createPetCatalog(): DemoPet[] {
  const species = [
    ['cat', 'Котёнок Искра'], ['dog', 'Щенок Бублик'], ['fox', 'Лисёнок Рыжик'], ['bunny', 'Кролик Облачко'],
    ['owl', 'Совёнок Буся'], ['dragon', 'Дракончик Уголёк'], ['deer', 'Оленёнок Листик'], ['panda', 'Панда Соня'],
    ['squirrel', 'Белочка Ириска'], ['turtle', 'Черепашка Чай'], ['penguin', 'Пингвин Снежок'], ['raccoon', 'Енотик Плюш'],
    ['hamster', 'Хомячок Пончик'], ['bird', 'Синяя птица Небо'], ['robot', 'Робот Пуговка'], ['axolotl', 'Аксолотль Персик'],
    ['phoenix', 'Феникс Рассвет'], ['parrot', 'Попугай Киви'], ['wolf', 'Волчонок Туман'], ['dinosaur', 'Динозаврик Росток'],
    ['ghostcat', 'Кот-призрак Дымок'], ['puppy', 'Щенок Пятнышко'], ['reddragon', 'Дракончик Огонёк'], ['unicorn', 'Единорог Зефир'],
    ['slime', 'Капелька Росы'], ['catdragon', 'Котодракон Пушок'], ['cloudspirit', 'Дух облака Ветерок'], ['greycat', 'Серый кот Бархат'],
  ];
  return species.map(([id, name], index) => ({
    id, name, description: 'Маленький спутник за настоящую заботу. Выберите яйцо, согрейте и пригласите домой.',
    art: `/assets/game/demo/pet-p${String(index + 1).padStart(2, '0')}.png`, enabled: true, order: index,
    eggName: `Яйцо: ${name}`, hatchCost: 0, price: index < 4 ? 25 : 35 + Math.floor(index / 4) * 5,
  }));
}

export function createItemCatalog(): DemoItem[] {
  const pieces: DemoItem[] = DEMO_CLASSES.flatMap((c, index) => (['body', 'weapon'] as const).flatMap(kind => [
    { id: `starter-${c.id}-${kind}`, name: kind === 'body' ? `Одежда: ${c.name}` : ['Меч добрых дел', 'Посох открытий', 'Посох заботы', 'Лук ловкости'][index],
      description: 'Бесплатный первый комплект класса. Только внешний вид.', art: `/assets/game/demo/items/${c.id}-${kind}.png`,
      kind, classId: c.id, price: 0, currency: 'coins' as const, color: c.color, enabled: true, order: index * 4 + (kind === 'body' ? 0 : 1) },
    { id: `rare-${c.id}-${kind}`, name: kind === 'body' ? `Праздничный наряд: ${c.name}` : ['Меч рассвета', 'Звёздный посох', 'Посох весны', 'Лунный лук'][index],
      description: 'Новый образ за семейные монеты. Сила и опыт не меняются.', art: `/assets/game/demo/items/rare-${c.id}-${kind}.png`,
      kind, classId: c.id, price: kind === 'body' ? 50 : 35, currency: 'coins' as const, color: c.color, enabled: true, order: index * 4 + (kind === 'body' ? 2 : 3) },
  ]));
  return [...pieces, ...([
    ['plant', 'Зелёный друг', 'shelf', 25, 'coins', '#719371'],
    ['books', 'Семейная библиотечка', 'shelf', 35, 'coins', '#aa7e54'],
    ['rug', 'Тёплый коврик', 'floor', 40, 'coins', '#b57b5b'],
    ['lamp', 'Лампа для сказок', 'floor', 50, 'coins', '#e3bc76'],
    ['picture', 'Семейное созвездие', 'wall', 30, 'coins', '#728eaa'],
    ['garland', 'Огни праздника', 'wall', 40, 'decorativeCredits', '#dba965'],
    ['telescope', 'Маленькая обсерватория', 'floor', 80, 'decorativeCredits', '#7385ac'],
  ] as const).map(([id, name, slot, price, currency, color], i) => ({
    id, name, description: currency === 'coins' ? 'Уютная деталь за совместные дела.' : 'Особый декор. Только демонстрационная покупка взрослого.',
    art: `/assets/game/demo/decor/${id}.png`, kind: 'decor' as const, classId: 'all' as const,
    slot, price, currency, color, enabled: true, order: 100 + i,
  }))];
}

export function createDemoUser(id: string, name: string, subtype: DemoSubtype, age: number): DemoUser {
  const classId: DemoClass = ({ father: 'warrior', mother: 'healer', son: 'rogue', daughter: 'mage' } as const)[subtype];
  const parent = subtype === 'father' || subtype === 'mother';
  return {
    id, name, role: parent ? 'parent' : 'child', subtype, age, archived: false,
    appearance: { skin: 'peach', hair: subtype === 'mother' ? 'long' : subtype === 'daughter' ? 'bob' : 'short',
      hairColor: subtype === 'daughter' ? 'ginger' : 'chestnut', beard: subtype === 'father' ? 'short' : 'none', classId,
      bodyId: `starter-${classId}-body`, weaponId: `starter-${classId}-weapon` },
    xp: 0, gold: 0, energy: 0, level: 1, bonusDay: null,
    ownedItemIds: [`starter-${classId}-body`, `starter-${classId}-weapon`], eggIds: [], petIds: [], activePetId: null,
  };
}

export function createInitialDemoState(day: string): DemoState {
  const bosses = createBossCatalog();
  return {
    version: 1, revision: 0, timezone: 'Europe/Moscow', day, dailyBonusDay: null, taskDayBudgets: {},
    users: [createDemoUser('father', 'Папа', 'father', 36), createDemoUser('mother', 'Мама', 'mother', 34),
      createDemoUser('son', 'Миша', 'son', 9), createDemoUser('daughter', 'Регина', 'daughter', 7)],
    tasks: [
      { id: 'teeth', title: 'Почистить зубы', description: 'Две минуты заботы о себе.', category: 'care', requiresApproval: false, shared: false, assigneeIds: [], reward: { xp: 10, gold: 5, energy: 10, coins: 5 }, enabled: true, order: 0 },
      { id: 'bed', title: 'Заправить кровать', description: 'Пусть утро начинается с маленькой победы.', category: 'home', requiresApproval: false, shared: false, assigneeIds: [], reward: { xp: 12, gold: 6, energy: 10, coins: 6 }, enabled: true, order: 1 },
      { id: 'reading', title: 'Почитать 15 минут', description: 'Любимая книга и немного тихого времени.', category: 'learning', requiresApproval: false, shared: false, assigneeIds: [], reward: { xp: 15, gold: 8, energy: 10, coins: 8 }, enabled: true, order: 2 },
      { id: 'tidy', title: 'Навести порядок в комнате', description: 'Убрать игрушки и освободить место для нового дня.', category: 'home', requiresApproval: true, shared: false, assigneeIds: [], reward: { xp: 20, gold: 10, energy: 15, coins: 12 }, enabled: true, order: 3 },
      { id: 'trash', title: 'Вынести мусор', description: 'Взрослый проверит, что всё получилось безопасно.', category: 'home', requiresApproval: true, shared: false, assigneeIds: [], reward: { xp: 20, gold: 10, energy: 15, coins: 12 }, enabled: true, order: 4 },
      { id: 'family-table', title: 'Накрыть стол вместе', description: 'Каждый помогает своей маленькой частью. Общий результат складывается из вкладов детей.', category: 'together', requiresApproval: true, shared: true, assigneeIds: [], reward: { xp: 20, gold: 10, energy: 15, coins: 10 }, enabled: true, order: 5 },
    ], completions: [], wallet: { coins: 60, decorativeCredits: 0 },
    ownedThemeIds: ['fireplace'], ownedDecorIds: [], home: { themeId: 'fireplace', decor: {} },
    catalog: { bosses, pets: createPetCatalog(), items: createItemCatalog(), themes: [
      { id: 'fireplace', layoutPresetId: 'fireplace', name: 'Дом у камина', description: 'Тёплый свет, дерево и вся семья рядом.', art: '/assets/game/demo/home-fireplace.webp', price: 0, currency: 'coins', palette: '#9b6346', enabled: true, order: 0 },
      { id: 'library', layoutPresetId: 'library', name: 'Семейная библиотека', description: 'Мягкое кресло, сказки и открытия.', art: '/assets/game/demo/home-library.webp', price: 50, currency: 'coins', palette: '#668779', enabled: true, order: 1 },
      { id: 'conservatory', layoutPresetId: 'conservatory', name: 'Зимний сад', description: 'Дом, полный света и зелени.', art: '/assets/game/demo/home-conservatory.webp', price: 75, currency: 'coins', palette: '#789967', enabled: true, order: 2 },
    ] },
    battle: { bossId: bosses[0].id, hp: bosses[0].hp, round: 1, rewarded: false, participants: [] },
    defeatedBossIds: [], activity: [{ id: 'welcome', text: 'Добро пожаловать домой. 60 стартовых семейных монет — подарок для знакомства с демо.', at: `${day}T09:00:00+03:00` }],
    processedRequestIds: [], simulatedPurchases: [],
  };
}
