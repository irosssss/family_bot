/**
 * Роуты привычек (Habitica Habits).
 * GET  /api/habits?userId=N          — список привычек пользователя
 * POST /api/habits/add               — создать привычку { userId, title, icon?, upPoints? }
 * POST /api/habits/:id/score         — клик [+|−] { direction }
 * DELETE /api/habits/:id             — удалить (владелец или админ)
 */
import { Request, Response, Router } from 'express';
import { AuthedRequest, canActOn } from '../utils/apiAuth';
import { eq, desc } from 'drizzle-orm';
import { db } from '../db';
import * as schema from '../db/schema';
import { appState } from '../services/stateService';
import { scoreHabitUp, scoreHabitDown, valueColor } from '../services/habitService';
import { notifyParentAboutTaskCompletion } from '../bot/telegramBot';

export const habitRoutes = Router();

/** Список привычек */
habitRoutes.get('/', (req: Request, res: Response) => {
  const userId = Number(req.query.userId);
  if (!userId) return res.status(400).json({ error: 'userId required' });
  const habits = appState.habits.filter((h) => h.user_id === userId);
  res.json({ success: true, habits });
});

/** Создание привычки */
habitRoutes.post('/add', async (req: Request, res: Response) => {
  try {
    const { userId, title, icon } = req.body;
    // SEC-03 FIX: мутация от чужого имени запрещена (родителю можно управлять детьми)
    const __req = req as any;
    if (process.env.NODE_ENV === 'production' && !canActOn(__req, Number(userId))) {
      return res.status(403).json({ error: 'Forbidden: cannot act on behalf of another user' });
    }
    if (!title || !title.trim()) return res.status(400).json({ error: 'Название обязательно' });

    // В память
    const newId = Date.now(); // уникальный временный id
    const habit = {
      id: newId,
      user_id: Number(userId),
      title: title.trim().slice(0, 80),
      icon: icon || null,
      value: 0,
      up_points: 10,
      down_damage: 5,
      counter_up: 0,
      counter_down: 0,
    };
    appState.habits.push(habit as any);

    // В БД
    await db.insert(schema.habits).values({
      user_id: habit.user_id,
      title: habit.title,
      icon: habit.icon,
    }).catch((e) => console.error('Habit insert error:', e));

    res.json({ success: true, habit });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/** Клик [+ / −] по привычке */
habitRoutes.post('/:id/score', async (req: Request, res: Response) => {
  try {
    const habitId = Number(req.params.id);
    const { direction, userId } = req.body;
    if (!['up', 'down'].includes(direction)) {
      return res.status(400).json({ error: "direction must be 'up' or 'down'" });
    }

    const habit = appState.habits.find((h) => h.id === habitId);
    if (!habit) return res.status(404).json({ error: 'Привычка не найдена' });

    const user = appState.users.find((u) => u.id === Number(userId));
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.family_role === 'parent') {
      return res.status(403).json({ error: 'Родители не играют — только дети зарабатывают' });
    }

    let message = '';
    let result: any;

    if (direction === 'up') {
      result = scoreHabitUp(habit);
      habit.value = result.newValue;
      habit.counter_up = result.counter_up;
      user.gold += result.gold;
      user.xp += result.xp;

      // Level up check: каждые 100 XP
      const newLevel = Math.floor(user.xp / 100) + 1;

      message = `${habit.title}: +${result.gold} золота, +${result.xp} опыта`;
      res.json({
        success: true,
        message,
        gold: result.gold,
        xp: result.xp,
        newValue: result.newValue,
        color: valueColor(result.newValue),
        level: newLevel,
      });
    } else {
      result = scoreHabitDown(habit);
      habit.value = result.newValue;
      habit.counter_down = result.counter_down;
      user.hp = Math.max(0, (user.hp ?? 50) - result.damage);

      message = `${habit.title}: −${result.damage} HP`;
      res.json({
        success: true,
        message,
        damage: result.damage,
        newValue: result.newValue,
        color: valueColor(result.newValue),
        hp: user.hp,
      });
    }

    // Лог в БД (не блокируем ответ)
    db.insert(schema.habit_scores).values({
      habit_id: habitId,
      user_id: user.id,
      direction,
    }).catch((e) => console.error('Habit score log error:', e));

    db.update(schema.habits).set({
      value: habit.value,
      counter_up: habit.counter_up,
      counter_down: habit.counter_down,
    }).where(eq(schema.habits.id, habitId)).catch((e) => console.error('Habit update error:', e));

    db.update(schema.users).set({
      gold: user.gold,
      xp: user.xp,
      hp: user.hp ?? 50,
    }).where(eq(schema.users.id, user.id)).catch((e) => console.error('Habit user update error:', e));

    void message; // сообщение уже отправлено выше
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/** Удаление привычки */
habitRoutes.delete('/:id', async (req: Request, res: Response) => {
  try {
    const habitId = Number(req.params.id);
    const { userId } = req.body;
    // SEC-03 FIX
    const __req = req as any;
    if (process.env.NODE_ENV === 'production' && !canActOn(__req, Number(userId))) {
      return res.status(403).json({ error: 'Forbidden: cannot act on behalf of another user' });
    }

    const habit = appState.habits.find((h) => h.id === habitId);
    if (!habit) return res.status(404).json({ error: 'Не найдено' });

    const user = appState.users.find((u) => u.id === Number(userId));
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Владелец или родитель-админ
    if (habit.user_id !== user.id && user.family_role !== 'parent') {
      return res.status(403).json({ error: 'Можно удалять только свои привычки' });
    }

    appState.habits = appState.habits.filter((h) => h.id !== habitId);
    await db.delete(schema.habits).where(eq(schema.habits.id, habitId)).catch((e) => console.error(e));

    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});
