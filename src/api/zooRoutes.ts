/**
 * Зоопарк (Этап 5): инкубация яиц, кормление питомцев.
 *
 * POST /api/zoo/hatch  { userId, species, eggId, potionId } → новый питомец
 * POST /api/zoo/feed   { userId, petId }                   → +10 feedPoints, 100 = маунт
 *
 * Прогресс питомца хранится в character_pets.feed_points:
 *   0-99  = малыш (Pet- спрайт)
 *   100+  = маунт (Mount_Icon_ спрайт)
 */
import { Request, Response, Router } from 'express';
import { eq, and } from 'drizzle-orm';
import { db } from '../db';
import * as schema from '../db/schema';
import { appState } from '../services/stateService';
import { EGGS, POTIONS } from '../services/zooService';

export const zooRoutes = Router();

const MOUNT_THRESHOLD = 100;
const FEED_PER_MEAL = 10;

/** Инкубация: списывает золото за яйцо+зелье, добавляет питомца пользователю */
zooRoutes.post('/hatch', async (req: Request, res: Response) => {
  try {
    const { userId, species, eggId, potionId } = req.body;
    const user = appState.users.find((u) => u.id === Number(userId));
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.family_role === 'parent') return res.status(403).json({ error: 'Родители не играют' });

    const egg = EGGS.find((e) => e.id === eggId);
    const potion = POTIONS.find((p) => p.id === potionId);
    if (!egg || !potion) return res.status(400).json({ error: 'Неизвестное яйцо или зелье' });

    const cost = egg.cost + potion.cost;
    if ((user.gold ?? 0) < cost) {
      return res.status(400).json({ error: `Недостаточно золота (нужно ${cost})` });
    }
    user.gold -= cost;

    // Добавляем питомца в appState (если такого ещё нет в каталоге)
    const code = `habitica_${species}_${potionId}`.toLowerCase();
    let pet: any = appState.pets.find((p) => p.code === code);
    if (!pet) {
      pet = {
        id: 9000 + appState.pets.length,
        code,
        title: `${species} (${potionId})`,
        emoji: '',
        icon: `/assets/game/habitica/pets/Pet-${species}-${potionId}.png`,
        spriteSheetUrl: `/assets/game/habitica/pets/Pet-${species}-${potionId}.png`,
        spriteFrames: 2,
        spriteRows: 1,
        cost: 0,
      } as any;
      appState.pets.push(pet);
      // В БД каталога тоже (для персистентности между рестартами)
      await db.insert(schema.pets).values({
        id: pet.id,
        name: pet.title,
        sprite_sheet_url: (pet as any).spriteSheetUrl,
        animation_frames: 2,
        evolution_stage: 1,
        cost_coins: 0,
      }).onConflictDoNothing().catch(() => {});
    }

    // Связь пользователь↔питомец с feed_points=0 (character_id = users.id)
    await db.insert(schema.character_pets).values({
      character_id: user.id,
      pet_id: pet.id,
      feed_points: 0,
    }).onConflictDoNothing().catch(() => {});

    res.json({
      success: true,
      message: `Вылупился питомец ${species} (${potionId})!`,
      pet,
      gold: user.gold,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/** Получить всех питомцев пользователя с прогрессом кормления */
zooRoutes.get('/list', async (req: Request, res: Response) => {
  try {
    const userId = Number(req.query.userId);
    if (!userId) return res.status(400).json({ error: 'userId обязателен' });

    const rows = await db
      .select({
        id: schema.pets.id,
        code: schema.pets.name,
        sprite_url: schema.pets.sprite_sheet_url,
        feed_points: schema.character_pets.feed_points,
      })
      .from(schema.character_pets)
      .innerJoin(schema.pets, eq(schema.pets.id, schema.character_pets.pet_id))
      .where(eq(schema.character_pets.character_id, userId));

    const MOUNT_THRESHOLD = 100;
    const result = rows.map((r) => {
      // Парсим species/potion из code (формат: "habitica_<species>_<potion>" или "Pet-<species>-<potion>")
      const code = r.code || '';
      let species = 'Wolf';
      let potion = 'Base';
      const m = code.match(/(?:habitica_|^)([A-Z][A-Za-z]+)_([A-Z][A-Za-z]+)/);
      if (m) {
        species = m[1];
        potion = m[2];
      } else {
        const m2 = code.match(/Pet-([A-Za-z]+)-([A-Za-z]+)/);
        if (m2) {
          species = m2[1];
          potion = m2[2];
        }
      }
      const feed = r.feed_points || 0;
      return {
        id: r.id,
        code,
        title: `${species} (${potion})`,
        species,
        potion,
        spriteUrl: r.sprite_url || `/assets/game/habitica/pets/Pet-${species}-${potion}.png`,
        mountIconUrl: `/assets/game/habitica/stable/mounts/icon/Mount_Icon_${species}-${potion}.png`,
        feed_points: feed,
        is_mount: feed >= MOUNT_THRESHOLD,
      };
    });
    res.json({ success: true, pets: result, count: result.length });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/** Кормление: +10 очков, на 100 превращается в маунта */
zooRoutes.post('/feed', async (req: Request, res: Response) => {
  try {
    const { userId, petId } = req.body;
    const user = appState.users.find((u) => u.id === Number(userId));
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Кормление стоит 5 золота (еда)
    const FOOD_COST = 5;
    if ((user.gold ?? 0) < FOOD_COST) {
      return res.status(400).json({ error: 'Недостаточно золота на еду (нужно 5)' });
    }

    // Находим запись character_pets
    const rows = await db.select().from(schema.character_pets)
      .where(and(
        eq(schema.character_pets.character_id, Number(userId)),
        eq(schema.character_pets.pet_id, Number(petId))
      ));
    const record = rows[0];
    if (!record) return res.status(404).json({ error: 'Питомец не найден у пользователя' });

    const currentPoints = record.feed_points || 0;
    if (currentPoints >= MOUNT_THRESHOLD) {
      return res.json({ success: true, message: 'Это уже маунт!', feed_points: currentPoints, is_mount: true });
    }

    const newPoints = Math.min(MOUNT_THRESHOLD, currentPoints + FEED_PER_MEAL);
    const becameMount = newPoints >= MOUNT_THRESHOLD && currentPoints < MOUNT_THRESHOLD;

    user.gold -= FOOD_COST;
    await db.update(schema.character_pets)
      .set({ feed_points: newPoints })
      .where(and(
        eq(schema.character_pets.character_id, Number(userId)),
        eq(schema.character_pets.pet_id, Number(petId))
      ))
      .catch((e) => console.error('Feed update error:', e));

    res.json({
      success: true,
      message: becameMount ? 'Питомец вырос в МАУНТА!' : `Питомец накормлен (${newPoints}/${MOUNT_THRESHOLD})`,
      feed_points: newPoints,
      is_mount: becameMount,
      gold: user.gold,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});
