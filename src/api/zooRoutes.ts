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
import { Response, Router } from 'express';
import { type AuthedRequest, canAccessUser, canActOn } from '../utils/apiAuth';
import { eq, and } from 'drizzle-orm';
import { db } from '../db';
import * as schema from '../db/schema';
import { appState } from '../services/stateService';
import { EGGS, POTIONS, SPECIES_RU } from '../services/zooService';

export const zooRoutes = Router();

const MOUNT_THRESHOLD = 100;
const FEED_PER_MEAL = 10;

/** Инкубация: списывает золото за яйцо+зелье, добавляет питомца пользователю */
zooRoutes.post('/hatch', async (req: AuthedRequest, res: Response) => {
  try {
    const { userId, species, eggId, potionId } = req.body;
    // SEC-03 FIX: мутация от чужого имени запрещена (родителю можно управлять детьми)
    if (!canActOn(req, Number(userId))) {
      return res.status(403).json({ error: 'Forbidden: cannot act on behalf of another user' });
    }
    const user = appState.users.find((u) => u.id === Number(userId));
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.family_role === 'parent') return res.status(403).json({ error: 'Родители не играют' });

    const egg = EGGS.find((e) => e.id === eggId);
    const potion = POTIONS.find((p) => p.id === potionId);
    if (!egg || !potion) return res.status(400).json({ error: 'Неизвестное яйцо или зелье' });
    // Вид обязан существовать в каталоге (иначе спрайт 404 и битый питомец в БД)
    if (!SPECIES_RU[species]) return res.status(400).json({ error: 'Неизвестный вид питомца' });

    const cost = egg.cost + potion.cost;
    const code = `habitica_${species}_${potionId}`.toLowerCase();
    const title = `${species} (${potionId})`;
    const spriteUrl = `/assets/game/habitica/pets/Pet-${species}-${potionId}.png`;
    const persisted = await db.transaction(async (tx) => {
      const [dbUser] = await tx.select().from(schema.users)
        .where(eq(schema.users.id, user.id)).for('update').limit(1);
      if (!dbUser) return { status: 'missing' as const };
      if (dbUser.family_role === 'parent') return { status: 'parent' as const };

      let [petRow] = await tx.select().from(schema.pets)
        .where(eq(schema.pets.code, code)).limit(1);
      if (!petRow) {
        [petRow] = await tx.insert(schema.pets).values({
          code,
          name: title,
          sprite_sheet_url: spriteUrl,
          animation_frames: 2,
          evolution_stage: 1,
          cost_coins: 0,
        }).onConflictDoNothing().returning();
        if (!petRow) {
          [petRow] = await tx.select().from(schema.pets)
            .where(eq(schema.pets.code, code)).limit(1);
        }
      }
      if (!petRow) throw new Error(`Unable to resolve pet ${code}`);

      const [owned] = await tx.select().from(schema.character_pets)
        .where(and(
          eq(schema.character_pets.character_id, user.id),
          eq(schema.character_pets.pet_id, petRow.id),
        )).for('update').limit(1);
      if (owned) return { status: 'owned' as const, petRow, gold: dbUser.gold };
      if (dbUser.gold < cost) return { status: 'insufficient' as const };

      const [updated] = await tx.update(schema.users).set({ gold: dbUser.gold - cost })
        .where(eq(schema.users.id, user.id)).returning({ gold: schema.users.gold });
      await tx.insert(schema.character_pets).values({
        character_id: user.id,
        pet_id: petRow.id,
        feed_points: 0,
      });
      return { status: 'hatched' as const, petRow, gold: updated.gold };
    });
    if (persisted.status === 'missing') return res.status(404).json({ error: 'User not found' });
    if (persisted.status === 'parent') return res.status(403).json({ error: 'Родители не играют' });
    if (persisted.status === 'insufficient') {
      return res.status(400).json({ error: `Недостаточно золота (нужно ${cost})` });
    }
    if (persisted.status === 'owned') {
      return res.status(409).json({ error: 'Такой питомец уже вылуплен' });
    }

    const pet: any = {
      id: persisted.petRow.id,
      code,
      title,
      emoji: '',
      icon: spriteUrl,
      spriteSheetUrl: spriteUrl,
      spriteFrames: 2,
      spriteRows: 1,
      cost: 0,
    };
    if (!appState.pets.some((candidate) => candidate.id === pet.id)) appState.pets.push(pet);
    if (!appState.userPets.some((row) => row.user_id === user.id && row.pet_id === pet.id)) {
      appState.userPets.push({ user_id: user.id, pet_id: pet.id, feed_points: 0, is_active: false });
    }
    user.gold = persisted.gold;

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
zooRoutes.get('/list', async (req: AuthedRequest, res: Response) => {
  try {
    const userId = Number(req.query.userId);
    if (!userId) return res.status(400).json({ error: 'userId обязателен' });
    if (!canAccessUser(req, userId)) {
      return res.status(403).json({ error: 'Forbidden: not your family' });
    }

    const rows = await db
      .select({
        id: schema.pets.id,
        code: schema.pets.code,
        name: schema.pets.name,
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
      const spriteMatch = r.sprite_url?.match(/Pet-([A-Za-z]+)-([A-Za-z]+)\.png$/i);
      const codeMatch = code.match(/^habitica_([^_]+)_([^_]+)$/i)
        ?? code.match(/Pet-([A-Za-z]+)-([A-Za-z]+)/i);
      const rawSpecies = spriteMatch?.[1] ?? codeMatch?.[1];
      const rawPotion = spriteMatch?.[2] ?? codeMatch?.[2];
      species = Object.keys(SPECIES_RU).find(
        (candidate) => candidate.toLowerCase() === rawSpecies?.toLowerCase(),
      ) ?? species;
      potion = POTIONS.find(
        (candidate) => candidate.id.toLowerCase() === rawPotion?.toLowerCase(),
      )?.id ?? potion;
      const feed = r.feed_points || 0;
      return {
        id: r.id,
        code,
        title: r.name || `${species} (${potion})`,
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

/** Выбор активного питомца-компаньона (ходит за героем в хабе) */
zooRoutes.post('/active', async (req: AuthedRequest, res: Response) => {
  try {
    const { userId, petId } = req.body;
    const user = appState.users.find((u) => u.id === Number(userId));
    // SEC-03 FIX: мутация от чужого имени запрещена (родителю можно управлять детьми)
    if (!canActOn(req, Number(userId))) {
      return res.status(403).json({ error: 'Forbidden: cannot act on behalf of another user' });
    }
    if (!user) return res.status(404).json({ error: 'User not found' });

    const changed = await db.transaction(async (tx) => {
      const [owned] = await tx.select().from(schema.character_pets)
        .where(and(
          eq(schema.character_pets.character_id, Number(userId)),
          eq(schema.character_pets.pet_id, Number(petId)),
        )).for('update').limit(1);
      if (!owned) return false;
      await tx.update(schema.character_pets).set({ is_active: false })
        .where(eq(schema.character_pets.character_id, Number(userId)));
      await tx.update(schema.character_pets).set({ is_active: true })
        .where(and(
          eq(schema.character_pets.character_id, Number(userId)),
          eq(schema.character_pets.pet_id, Number(petId)),
        ));
      return true;
    });
    if (!changed) return res.status(400).json({ error: 'Питомец не найден у пользователя' });

    for (const ownedPet of appState.userPets) {
      if (ownedPet.user_id === Number(userId)) {
        ownedPet.is_active = ownedPet.pet_id === Number(petId);
      }
    }

    const pet = appState.pets.find((p) => p.id === Number(petId));
    res.json({ success: true, message: `${pet?.title || 'Питомец'} теперь с тобой!` });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/** Кормление: +10 очков, на 100 превращается в маунта */
zooRoutes.post('/feed', async (req: AuthedRequest, res: Response) => {
  try {
    const { userId, petId } = req.body;
    const user = appState.users.find((u) => u.id === Number(userId));
    // SEC-03 FIX: мутация от чужого имени запрещена (родителю можно управлять детьми)
    if (!canActOn(req, Number(userId))) {
      return res.status(403).json({ error: 'Forbidden: cannot act on behalf of another user' });
    }
    if (!user) return res.status(404).json({ error: 'User not found' });

    const FOOD_COST = 5;
    const persisted = await db.transaction(async (tx) => {
      const [dbUser] = await tx.select().from(schema.users)
        .where(eq(schema.users.id, user.id)).for('update').limit(1);
      const [record] = await tx.select().from(schema.character_pets)
        .where(and(
          eq(schema.character_pets.character_id, Number(userId)),
          eq(schema.character_pets.pet_id, Number(petId)),
        )).for('update').limit(1);
      if (!dbUser || !record) return { status: 'missing' as const };
      const currentPoints = record.feed_points || 0;
      if (currentPoints >= MOUNT_THRESHOLD) {
        return { status: 'mount' as const, newPoints: currentPoints, gold: dbUser.gold };
      }
      if (dbUser.gold < FOOD_COST) return { status: 'insufficient' as const };

      const newPoints = Math.min(MOUNT_THRESHOLD, currentPoints + FEED_PER_MEAL);
      const [updatedUser] = await tx.update(schema.users).set({ gold: dbUser.gold - FOOD_COST })
        .where(eq(schema.users.id, user.id)).returning({ gold: schema.users.gold });
      await tx.update(schema.character_pets).set({ feed_points: newPoints })
        .where(and(
          eq(schema.character_pets.character_id, Number(userId)),
          eq(schema.character_pets.pet_id, Number(petId)),
        ));
      return {
        status: 'fed' as const,
        newPoints,
        gold: updatedUser.gold,
        becameMount: newPoints >= MOUNT_THRESHOLD,
      };
    });
    if (persisted.status === 'missing') {
      return res.status(404).json({ error: 'Питомец не найден у пользователя' });
    }
    if (persisted.status === 'insufficient') {
      return res.status(400).json({ error: 'Недостаточно золота на еду (нужно 5)' });
    }
    if (persisted.status === 'mount') {
      return res.json({
        success: true,
        message: 'Это уже маунт!',
        feed_points: persisted.newPoints,
        is_mount: true,
        gold: persisted.gold,
      });
    }
    const newPoints = persisted.newPoints;
    const becameMount = persisted.becameMount;
    user.gold = persisted.gold;
    const memoryPet = appState.userPets.find(
      (row) => row.user_id === user.id && row.pet_id === Number(petId),
    );
    if (memoryPet) memoryPet.feed_points = newPoints;

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
