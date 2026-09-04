/**
 * Роуты привычек (Habitica Habits).
 * GET  /api/habits?userId=N          — список привычек пользователя
 * POST /api/habits/add               — создать привычку { userId, title, icon?, upPoints? }
 * POST /api/habits/:id/score         — клик [+|−] { direction }
 * DELETE /api/habits/:id             — удалить (владелец или админ)
 */
import { Response, Router } from 'express';
import { type AuthedRequest, canAccessUser, canActOn } from '../utils/apiAuth';
import { and, eq } from 'drizzle-orm';
import { db } from '../db';
import * as schema from '../db/schema';
import { appState } from '../services/stateService';
import { scoreHabitUp, scoreHabitDown, valueColor } from '../services/habitService';

export const habitRoutes = Router();

/** Список привычек */
habitRoutes.get('/', (req: AuthedRequest, res: Response) => {
  const userId = Number(req.query.userId);
  if (!userId) return res.status(400).json({ error: 'userId required' });
  if (!canAccessUser(req, userId)) {
    return res.status(403).json({ error: 'Forbidden: not your family' });
  }
  const habits = appState.habits.filter((h) => h.user_id === userId);
  res.json({ success: true, habits });
});

/** Создание привычки */
habitRoutes.post('/add', async (req: AuthedRequest, res: Response) => {
  try {
    const { userId, title, icon } = req.body;
    // SEC-03 FIX: мутация от чужого имени запрещена (родителю можно управлять детьми)
    if (!canActOn(req, Number(userId))) {
      return res.status(403).json({ error: 'Forbidden: cannot act on behalf of another user' });
    }
    if (!title || !title.trim()) return res.status(400).json({ error: 'Название обязательно' });

    const draft = {
      user_id: Number(userId),
      title: title.trim().slice(0, 80),
      icon: icon || null,
      value: 0,
      up_points: 10,
      down_damage: 5,
      counter_up: 0,
      counter_down: 0,
    };
    const [created] = await db.insert(schema.habits).values({
      user_id: draft.user_id,
      title: draft.title,
      icon: draft.icon,
    }).returning();
    const habit = { ...draft, id: created.id };
    appState.habits.push(habit as any);

    res.json({ success: true, habit });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/** Клик [+ / −] по привычке */
habitRoutes.post('/:id/score', async (req: AuthedRequest, res: Response) => {
  try {
    const habitId = Number(req.params.id);
    const { direction, userId } = req.body;
    if (!['up', 'down'].includes(direction)) {
      return res.status(400).json({ error: "direction must be 'up' or 'down'" });
    }

    const habit = appState.habits.find((h) => h.id === habitId);
    if (!habit) return res.status(404).json({ error: 'Привычка не найдена' });
    if (habit.user_id !== Number(userId) || !canActOn(req, habit.user_id)) {
      return res.status(403).json({ error: 'Forbidden: habit belongs to another user' });
    }

    const user = appState.users.find((u) => u.id === Number(userId));
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.family_role === 'parent') {
      return res.status(403).json({ error: 'Родители не играют — только дети зарабатывают' });
    }

    const persisted = await db.transaction(async (tx) => {
      const [dbHabit] = await tx.select().from(schema.habits)
        .where(and(eq(schema.habits.id, habitId), eq(schema.habits.user_id, user.id)))
        .for('update').limit(1);
      const [dbUser] = await tx.select().from(schema.users)
        .where(eq(schema.users.id, user.id)).for('update').limit(1);
      if (!dbHabit || !dbUser) return null;
      if (dbUser.family_role === 'parent') return { parent: true as const };

      const scored = direction === 'up' ? scoreHabitUp(dbHabit) : scoreHabitDown(dbHabit);
      const newGold = direction === 'up' ? dbUser.gold + (scored as ReturnType<typeof scoreHabitUp>).gold : dbUser.gold;
      const newXp = direction === 'up' ? dbUser.xp + (scored as ReturnType<typeof scoreHabitUp>).xp : dbUser.xp;
      const newHp = direction === 'down'
        ? Math.max(0, dbUser.hp - (scored as ReturnType<typeof scoreHabitDown>).damage)
        : dbUser.hp;
      const counterUp = direction === 'up'
        ? (scored as ReturnType<typeof scoreHabitUp>).counter_up
        : dbHabit.counter_up;
      const counterDown = direction === 'down'
        ? (scored as ReturnType<typeof scoreHabitDown>).counter_down
        : dbHabit.counter_down;

      await tx.update(schema.habits).set({
        value: scored.newValue,
        counter_up: counterUp,
        counter_down: counterDown,
      }).where(eq(schema.habits.id, habitId));
      await tx.update(schema.users).set({ gold: newGold, xp: newXp, hp: newHp })
        .where(eq(schema.users.id, user.id));
      await tx.insert(schema.habit_scores).values({
        habit_id: habitId,
        user_id: user.id,
        direction,
      });
      return direction === 'up'
        ? {
            direction: 'up' as const,
            scored: scored as ReturnType<typeof scoreHabitUp>,
            newGold,
            newXp,
            newHp,
            counterUp,
            counterDown,
          }
        : {
            direction: 'down' as const,
            scored: scored as ReturnType<typeof scoreHabitDown>,
            newGold,
            newXp,
            newHp,
            counterUp,
            counterDown,
          };
    });
    if (!persisted) return res.status(404).json({ error: 'Привычка не найдена' });
    if ('parent' in persisted) {
      return res.status(403).json({ error: 'Родители не играют — только дети зарабатывают' });
    }

    habit.value = persisted.scored.newValue;
    habit.counter_up = persisted.counterUp;
    habit.counter_down = persisted.counterDown;
    user.gold = persisted.newGold;
    user.xp = persisted.newXp;
    user.hp = persisted.newHp;

    if (persisted.direction === 'up') {
      return res.json({
        success: true,
        message: `${habit.title}: +${persisted.scored.gold} золота, +${persisted.scored.xp} опыта`,
        gold: persisted.scored.gold,
        xp: persisted.scored.xp,
        newValue: persisted.scored.newValue,
        color: valueColor(persisted.scored.newValue),
        level: Math.floor(user.xp / 100) + 1,
      });
    }
    return res.json({
      success: true,
      message: `${habit.title}: −${persisted.scored.damage} HP`,
      damage: persisted.scored.damage,
      newValue: persisted.scored.newValue,
      color: valueColor(persisted.scored.newValue),
      hp: user.hp,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/** Удаление привычки */
habitRoutes.delete('/:id', async (req: AuthedRequest, res: Response) => {
  try {
    const habitId = Number(req.params.id);
    const { userId } = req.body;
    const habit = appState.habits.find((h) => h.id === habitId);
    if (!habit) return res.status(404).json({ error: 'Не найдено' });

    if (!canActOn(req, habit.user_id)) {
      return res.status(403).json({ error: 'Forbidden: habit belongs to another family' });
    }

    const user = appState.users.find((u) => u.id === Number(userId));
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Владелец или родитель-админ
    if (habit.user_id !== user.id && !(user.is_admin || user.family_role === 'parent')) {
      return res.status(403).json({ error: 'Можно удалять только свои привычки' });
    }

    const deleted = await db.delete(schema.habits)
      .where(and(eq(schema.habits.id, habitId), eq(schema.habits.user_id, habit.user_id)))
      .returning({ id: schema.habits.id });
    if (deleted.length === 0) return res.status(404).json({ error: 'Не найдено' });
    appState.habits = appState.habits.filter((h) => h.id !== habitId);

    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});
