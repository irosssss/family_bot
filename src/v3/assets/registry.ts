import type { AssetSlotDefinition, SlotAnchor } from './contracts';

const plannedRoot = 'public/assets/game/family_life_v3/<release>';
const anchor = (name: string, x = 0.5, y = 0.5): SlotAnchor => ({ name, space: 'normalized', x, y });

const heroLayers = [
  'contact_shadow', 'aura_back', 'hair_back', 'outfit_back', 'body_underlayer',
  'legs', 'feet', 'torso', 'held_back', 'face', 'hair_main', 'headwear',
  'hair_front', 'hands_held_front', 'accessory_front', 'aura_front',
] as const;

/** Freeze nested metadata so runtime inspection cannot rewrite the contract. */
function planned(definition: Omit<AssetSlotDefinition, 'status' | 'geometryStatus'>): AssetSlotDefinition {
  return Object.freeze({
    ...definition,
    status: 'planned',
    geometryStatus: 'candidate',
    logicalCanvas: Object.freeze({ ...definition.logicalCanvas }),
    anchor: Object.freeze({ ...definition.anchor }),
    layers: Object.freeze([...definition.layers]),
    states: Object.freeze([...definition.states]),
    screens: Object.freeze([...definition.screens]),
  });
}

export const assetSlots: readonly AssetSlotDefinition[] = Object.freeze([
  planned({
    id: 'home.room', label: 'Семейный дом', category: 'scene', aspectRatio: '4 / 3',
    targetPath: `${plannedRoot}/home_room__<layer>__<variant>__r<revision>.png`,
    logicalCanvas: { width: 320, height: 240 }, anchor: anchor('scene_origin', 0, 0),
    layers: ['shell', 'rear_furniture', 'middle_props', 'foreground'],
    states: ['base', 'upgraded', 'seasonal'], screens: ['home'],
    description: 'Основа комнаты без нарисованных членов семьи, питомцев, имён и показателей. Места участников задаёт отдельная раскладка.',
  }),
  planned({
    id: 'hero.adult', label: 'Взрослый герой', category: 'hero', aspectRatio: '4 / 5',
    targetPath: `${plannedRoot}/hero_adult__<layer>__<variant>__r<revision>.png`,
    logicalCanvas: { width: 64, height: 80 }, anchor: anchor('floor_contact', 0.5, 0.95),
    layers: heroLayers, states: ['neutral', 'celebration'], screens: ['home', 'hero', 'adventure'],
    description: 'Модульная сборка взрослого игрока V3. Права управления и участие в игре независимы; графика не определяет полномочия.',
  }),
  planned({
    id: 'hero.child', label: 'Детский герой', category: 'hero', aspectRatio: '4 / 5',
    targetPath: `${plannedRoot}/hero_child__<layer>__<variant>__r<revision>.png`,
    logicalCanvas: { width: 64, height: 80 }, anchor: anchor('floor_contact', 0.5, 0.95),
    layers: heroLayers, states: ['neutral', 'celebration'], screens: ['home', 'hero', 'adventure'],
    description: 'Собственные детские пропорции и совместимые слои одежды. Уменьшенный взрослый спрайт не считается готовым детским вариантом.',
  }),
  planned({
    id: 'hero.portrait', label: 'Портрет героя', category: 'hero', aspectRatio: '1 / 1',
    targetPath: `${plannedRoot}/hero_portrait__<appearance_variant>__r<revision>.png`,
    logicalCanvas: { width: 64, height: 64 }, anchor: anchor('portrait_focus', 0.5, 0.4),
    layers: ['derived_appearance'], states: ['neutral'], screens: ['home', 'tasks', 'family', 'hero'],
    description: 'Производный кадр той же внешности, что показана в доме. Обводка выбора и статус остаются в интерфейсе.',
  }),
  planned({
    id: 'boss.main', label: 'Босс приключения', category: 'boss', aspectRatio: '1 / 1',
    targetPath: `${plannedRoot}/boss_<slug>__<phase>__r<revision>.png`,
    logicalCanvas: { width: 128, height: 128 }, anchor: anchor('floor_contact', 0.5, 0.95),
    layers: ['contact_shadow', 'boss'], states: ['phase_one', 'phase_two', 'phase_three', 'defeated'],
    screens: ['adventure'],
    description: 'Цельный статичный образ босса. Здоровье, фаза и однократная выдача награды принадлежат данным игры, а не картинке.',
  }),
  planned({
    id: 'adventure.map', label: 'Карта приключения', category: 'scene', aspectRatio: '4 / 3',
    targetPath: `${plannedRoot}/adventure_map__<region>__r<revision>.png`,
    logicalCanvas: { width: 320, height: 240 }, anchor: anchor('scene_origin', 0, 0),
    layers: ['map_background', 'landmarks'], states: ['base', 'seasonal'], screens: ['adventure'],
    description: 'Фон маршрута без запечённых надписей, кнопок и прогресса. Выбор места также доступен обычным списком.',
  }),
  planned({
    id: 'pet.egg', label: 'Яйцо питомца', category: 'pet', aspectRatio: '1 / 1',
    targetPath: `${plannedRoot}/pet_egg__<species>__r<revision>.png`,
    logicalCanvas: { width: 48, height: 48 }, anchor: anchor('floor_contact', 0.5, 0.9),
    layers: ['contact_shadow', 'egg'], states: ['unhatched', 'ready_to_hatch'], screens: ['pets', 'collection', 'shop'],
    description: 'Превью яйца с отдельным текстом условий получения и результата. Изображение не выбирает случайную награду.',
  }),
  planned({
    id: 'pet.companion', label: 'Питомец-спутник', category: 'pet', aspectRatio: '1 / 1',
    targetPath: `${plannedRoot}/pet_companion__<species>__<stage>__r<revision>.png`,
    logicalCanvas: { width: 48, height: 48 }, anchor: anchor('floor_contact', 0.5, 0.9),
    layers: ['contact_shadow', 'pet_body', 'cosmetic_back', 'cosmetic_front'],
    states: ['pet', 'companion'], screens: ['home', 'pets', 'hero', 'collection'],
    description: 'Сборка выбранного питомца. Просмотр другого питомца не меняет спутника; экземпляр, вид и стадия развития различаются.',
  }),
  planned({
    id: 'pet.corner', label: 'Базовый уголок питомца', category: 'scene', aspectRatio: '4 / 3',
    targetPath: `${plannedRoot}/pet_corner__<species>__<layer>__r<revision>.png`,
    logicalCanvas: { width: 320, height: 240 }, anchor: anchor('scene_origin', 0, 0),
    layers: ['corner_shell', 'resting_place', 'foreground'],
    states: ['base'], screens: ['pets', 'hero'],
    description: 'Бесплатная основа уголка конкретного питомца. Сам питомец вставляется отдельной сборкой; оформление не управляет ростом, владением и доступом.',
  }),
  planned({
    id: 'item.outfit', label: 'Предмет одежды', category: 'item', aspectRatio: '1 / 1',
    targetPath: `${plannedRoot}/item_outfit__<slug>__preview__r<revision>.png`,
    logicalCanvas: { width: 64, height: 64 }, anchor: anchor('preview_center'),
    layers: ['item_preview'], states: ['base'], screens: ['shop', 'hero', 'collection'],
    description: 'Иконка или превью конкретной одежды. Носимые слои для взрослых и детей поставляются отдельно, сохраняя одно право владения.',
  }),
  planned({
    id: 'item.weapon', label: 'Предмет в руке', category: 'item', aspectRatio: '1 / 1',
    targetPath: `${plannedRoot}/item_weapon__<slug>__preview__r<revision>.png`,
    logicalCanvas: { width: 64, height: 64 }, anchor: anchor('preview_center'),
    layers: ['item_preview'], states: ['base'], screens: ['shop', 'hero', 'collection'],
    description: 'Превью предмета; отдельные задний и передний носимые слои привязываются к hand_grip принятого профиля героя.',
  }),
  planned({
    id: 'home.furniture', label: 'Предмет для дома', category: 'home', aspectRatio: '1 / 1',
    targetPath: `${plannedRoot}/home_furniture__<slug>__<binding>__r<revision>.png`,
    logicalCanvas: { width: 96, height: 96 }, anchor: anchor('floor_contact', 0.5, 0.95),
    layers: ['furniture_back', 'furniture_front'], states: ['base'], screens: ['home', 'shop', 'collection'],
    description: 'Один предмет может иметь превью и заднюю/переднюю части. Геометрия сцены и места героев проверяются отдельно от квадратного превью.',
  }),
  planned({
    id: 'family.trophy', label: 'Семейный трофей', category: 'home', aspectRatio: '1 / 1',
    targetPath: `${plannedRoot}/family_trophy__<achievement>__r<revision>.png`,
    logicalCanvas: { width: 64, height: 64 }, anchor: anchor('shelf_contact', 0.5, 0.95),
    layers: ['trophy'], states: ['base'], screens: ['home', 'collection', 'adventure'],
    description: 'Объект заслуженного достижения. Имя семьи, дата и описание выводятся текстом и не запекаются в PNG.',
  }),
  planned({
    id: 'collection.cover', label: 'Обложка коллекции', category: 'collection', aspectRatio: '3 / 2',
    targetPath: `${plannedRoot}/collection_cover__<collection>__r<revision>.png`,
    logicalCanvas: { width: 192, height: 128 }, anchor: anchor('composition_center'),
    layers: ['cover'], states: ['base'], screens: ['collection', 'shop'],
    description: 'Тематическая композиция без цены, счётчика и текста. Превью не подменяет перечень предметов или условия их получения.',
  }),
]);

const byId = new Map(assetSlots.map(slot => [slot.id, slot]));

/** Unknown slots stay unknown; never substitute the first item in a catalog. */
export function getAssetSlot(id: string): AssetSlotDefinition | undefined {
  return byId.get(id);
}
