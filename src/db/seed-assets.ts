import { db } from './index';
import { items, pets, bosses } from './schema';

const seedAssets = async () => {
  console.log('[Seed] Начинаем сидирование локальных ассетов...');

  const seedItems = [
    {
      name: 'Меч новичка',
      type: 'weapon',
      sprite_url: `/assets/game/equipment/hand_items/bronze_sword.png`,
      layer_z_index: 20,
      cost_coins: 50,
      stats_modifier: { atk: 2 },
    },
    {
      name: 'Шляпа мага',
      type: 'hat',
      sprite_url: `/assets/game/characters/hats_masks/witch_hat.png`,
      layer_z_index: 30,
      cost_coins: 150,
      stats_modifier: { mp: 10 },
    },
    {
      name: 'Туника странника',
      type: 'clothing',
      sprite_url: `/assets/game/characters/clothing/blue_dress.png`,
      layer_z_index: 10,
      cost_coins: 100,
      stats_modifier: { hp: 5 },
    }
  ];

  for (const item of seedItems) {
    await db.insert(items).values(item).onConflictDoNothing();
  }
  console.log('[Seed] Экипировка добавлена.');

  const seedPets = [
    {
      name: 'Огонек Wisp',
      sprite_sheet_url: `/assets/game/entities/pets/wisp_with_outline.png`,
      animation_frames: 6,
      evolution_stage: 1,
      cost_coins: 500,
    },
    {
      name: 'Собачка',
      sprite_sheet_url: `/assets/game/entities/pets/gandalfhardcore_doggy_sheet.png`,
      animation_frames: 4,
      evolution_stage: 1,
      cost_coins: 300,
    }
  ];

  for (const pet of seedPets) {
    await db.insert(pets).values(pet).onConflictDoNothing();
  }
  console.log('[Seed] Питомцы добавлены.');

  const slimeBoss = {
    week_key: 'week_1_slime',
    name: 'Король Слизней',
    emoji: '',
    max_hp: 5000,
    hp: 5000,
    damage: 15,
    sprite_url: `/assets/game/entities/bosses/slime_green.png`,
  };

  await db.insert(bosses).values(slimeBoss).onConflictDoNothing();
  console.log('[Seed] Босс "Король Слизней" добавлен.');

  console.log('[Seed] Сидирование успешно завершено!');
};

seedAssets()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[Seed] Ошибка сидирования:', err);
    process.exit(1);
  });
