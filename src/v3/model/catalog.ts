import { MODEL_STATUS_V01 } from './balance.ts';

export type CatalogItemV01 = Readonly<{
  version: 'v0.1'; status: 'proposed'; simulationOnly: true;
  id: string;
  title: string;
  kind: 'outfit' | 'item' | 'known_egg' | 'home' | 'real_reward';
  priceGold: number;
  assetSlotId: string | null;
  ownership: 'personal' | 'family';
  eligibility: 'players' | 'adults' | 'children';
  repeatable: boolean;
  description: string;
  acquisition: 'gold' | 'starter_choice' | 'configured_real_reward';
  knownPetId?: string;
}>;

/** Proposed prices for analysis. This catalogue cannot purchase, claim, equip or grant. */
export const catalogV01: readonly CatalogItemV01[] = Object.freeze([
  {
    id: 'v3.egg.starter-cat', title: 'Стартовое яйцо котёнка', kind: 'known_egg', priceGold: 0,
    assetSlotId: 'pet.egg', ownership: 'personal', eligibility: 'players', repeatable: false,
    acquisition: 'starter_choice', knownPetId: 'v3.pet.cat',
    description: 'Бесплатный известный выбор после первого принятого дела. Одно право на котёнка ИЛИ щенка; бесплатный уголок после вылупления.',
  },
  {
    id: 'v3.egg.starter-dog', title: 'Стартовое яйцо щенка', kind: 'known_egg', priceGold: 0,
    assetSlotId: 'pet.egg', ownership: 'personal', eligibility: 'players', repeatable: false,
    acquisition: 'starter_choice', knownPetId: 'v3.pet.dog',
    description: 'Альтернатива стартовому котёнку за то же единственное бесплатное право. Результат известен, случайной выдачи нет.',
  },
  {
    id: 'v3.outfit.traveler', title: 'Одежда путешественника', kind: 'outfit', priceGold: 60,
    assetSlotId: 'item.outfit', ownership: 'personal', eligibility: 'players', repeatable: false,
    acquisition: 'gold', description: 'Постоянный внешний вид. Примерка и применение отдельны от покупки; дополнительных наград или силы нет.',
  },
  {
    id: 'v3.item.adventure-kit', title: 'Набор путешественника', kind: 'item', priceGold: 100,
    assetSlotId: 'item.weapon', ownership: 'personal', eligibility: 'players', repeatable: false,
    acquisition: 'gold', description: 'Косметический предмет в руке, без множителей XP, Gold и вклада. Повторная покупка не нужна.',
  },
  {
    id: 'v3.egg.fox', title: 'Известное яйцо лисёнка', kind: 'known_egg', priceGold: 180,
    assetSlotId: 'pet.egg', ownership: 'personal', eligibility: 'players', repeatable: false,
    acquisition: 'gold', knownPetId: 'v3.pet.fox',
    description: 'Дополнительный вид за заработанные Gold. Бесплатный стартовый выбор доступен отдельно. Из яйца всегда лисёнок; вылупление и базовый уголок без доплаты.',
  },
  {
    id: 'v3.home.reading-lamp', title: 'Лампа для семейного уголка', kind: 'home', priceGold: 240,
    assetSlotId: 'home.furniture', ownership: 'family', eligibility: 'adults', repeatable: false,
    acquisition: 'gold', description: 'В предложении v0.1 взрослый расходует свои Gold, владение получает семья. Одну лампу не покупает повторно каждый участник.',
  },
  {
    id: 'v3.real-reward.choose-activity', title: 'Выбрать особое семейное занятие', kind: 'real_reward', priceGold: 120,
    assetSlotId: null, ownership: 'personal', eligibility: 'children', repeatable: true,
    acquisition: 'configured_real_reward',
    description: 'Пример условия, которое взрослый отдельно включает и может исполнить. Только детям. Одобрение, лимиты, резерв и фактическая выдача требуют контракта; обычное внимание и базовые потребности бесплатны.',
  },
].map(item => Object.freeze({ ...MODEL_STATUS_V01, ...item }) as CatalogItemV01));

export const starterChoicesV01 = Object.freeze(catalogV01.filter(item => item.acquisition === 'starter_choice'));

export function getCatalogItem(id: string): CatalogItemV01 | undefined {
  return catalogV01.find(item => item.id === id);
}
