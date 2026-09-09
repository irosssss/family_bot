/** Presentation examples only. Selecting one never submits a game command. */
export type GoalExample = 'empty' | 'active' | 'achieved';
export type PetExample = 'none' | 'egg' | 'companion';
export type ItemExample = 'available' | 'short' | 'owned' | 'equipped';
export type RealRewardExample = 'idea' | 'awaiting' | 'reserved' | 'delivered' | 'released';

export interface PrototypeExamples {
  goal: GoalExample;
  pet: PetExample;
  item: ItemExample;
  realReward: RealRewardExample;
}

export const initialExamples: PrototypeExamples = {
  goal: 'active',
  pet: 'egg',
  item: 'available',
  realReward: 'idea',
};

export const exampleLabels = {
  goal: { empty: 'Цель не выбрана', active: 'Двигаемся к цели', achieved: 'Цель достигнута' },
  pet: { none: 'Питомца пока нет', egg: 'Растёт известное яйцо', companion: 'Спутник рядом' },
  item: { available: 'Хватает золота', short: 'Пока не хватает', owned: 'Предмет получен', equipped: 'Предмет применён' },
  realReward: { idea: 'Идея награды', awaiting: 'Ждёт согласования', reserved: 'Согласовано, ждёт выдачи', delivered: 'Награда получена', released: 'Отменено, резерв снят' },
} as const;
