/**
 * Роуты задач.
 * POST /complete — отметить выполнение.
 * POST /toggle — отменить выполнение.
 * POST /add — создать кастомную задачу.
 */
import { Request, Response, Router } from 'express';
import { db } from '../db';
import * as schema from '../db/schema';
import { eq } from 'drizzle-orm';
import { appState } from '../services/stateService';
import { applyTaskCompletion } from '../services/taskService';
import { notifyParentAboutTaskCompletion } from '../bot/telegramBot';
import { getTodayStr } from '../lib/dateUtils';
import { generateId } from '../lib/ids';
import type { Task } from '../types';

export const taskRoutes = Router();

taskRoutes.post('/complete', (req: Request, res: Response) => {
  const { userId, taskId } = req.body;
  const user = appState.users.find((u) => u.id === Number(userId));
  const task = appState.tasks.find((t) => t.id === Number(taskId));

  if (!user || !task) {
    return res.status(404).json({ error: 'User or task not found' });
  }

  // Check task ownership: User can only complete their own or joint ('both') tasks
  const isAssignedToUser = task.assignee === user.assignee || task.assignee === 'both';
  if (!isAssignedToUser) {
    const assigneeName = task.assignee === 'misha' ? 'Миша' : task.assignee === 'regina' ? 'Регина' : 'Общая';
    return res
      .status(403)
      .json({ error: `Эта задача назначена на (${assigneeName}). Только исполнитель может её выполнить и подтвердить!` });
  }

  const result = applyTaskCompletion(user, task);
  // Update DB (async, non-blocking for now)

  const dbUsers = schema.users;
  db.update(dbUsers).set({
    gold: user.gold,
    xp: user.xp,
    hp: user.hp,
    mp: user.mp,
    streak: user.streak,
    skill_date: user.skill_date,
  }).where(eq(dbUsers.id, user.id)).execute().catch(e => console.error('DB Update error:', e));
  if (result.error) {
    return res.status(400).json({ error: result.error });
  }


  // Simulate sending Telegram notification to parent for approval
  // In real app, we use actual Telegram IDs. Here we pass a mock parentId.
  const parentTelegramId = 123456789;
  notifyParentAboutTaskCompletion(parentTelegramId, task.id, task.title, user.display_name).catch(console.error);
  res.json({
    success: true,
    points: task.points,
    title: task.title,
    gold_gain: result.goldGain,
    xp_gain: result.xpGain,
    level_up: result.levelUp,
    new_level: result.newLevel,
    perfect: result.perfect,
    pet: result.pet,
    bossDefeated: result.bossDefeated,
    achievements: result.achievements,
    challengeCompleted: result.challengeCompleted,
  });
});

taskRoutes.post('/toggle', (req: Request, res: Response) => {
  const { userId, taskId } = req.body;
  const user = appState.users.find((u) => u.id === Number(userId));
  const task = appState.tasks.find((t) => t.id === Number(taskId));

  if (task && user && task.assignee !== user.assignee && task.assignee !== 'both') {
    return res.status(403).json({ error: 'Вы можете отменять отметку только своих задач!' });
  }

  const todayStr = getTodayStr();
  const idx = appState.completions.findIndex(
    (c) => c.user_id === Number(userId) && c.task_id === Number(taskId) && c.completed_at === todayStr
  );

  if (idx !== -1) {
    appState.completions.splice(idx, 1);
    if (user && task) {
      const goldLoss = task.points + (user.class === 'warrior' && task.points >= 4 ? 1 : 0);
      const xpLoss = user.class === 'mage' ? Math.round(task.points * 1.2 * 10) : task.points * 10;
      user.gold = Math.max(0, (user.gold || 0) - goldLoss);
      user.xp = Math.max(0, (user.xp || 0) - xpLoss);
      if (!appState.boss.defeated) {
        appState.boss.damage = Math.max(0, appState.boss.damage - task.points);
      }
    }
    const io = req.app.get('io');
    if (io) io.emit('stateUpdate');
    return res.json({ success: true, action: 'uncompleted' });
  }

  res.status(404).json({ error: 'Completion not found' });
});

taskRoutes.post('/add', (req: Request, res: Response) => {
  const { title, points, assignee, task_type } = req.body;
  if (!title || !points) {
    return res.status(400).json({ error: 'Title and points required' });
  }

  const newTask: Task = {
    id: generateId(),
    code: `custom_${generateId()}`,
    title: String(title).trim(),
    points: Math.max(1, Math.min(10, Number(points))),
    assignee: (assignee as any) || 'both',
    task_type: (task_type as any) || 'todo',
    day_of_week: null,
  };

  appState.tasks.push(newTask);
  res.json({ success: true, task: newTask });
});
