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
import { checkAllTasksCompleted, updateStreak } from '../services/streakService';
import { rollSurpriseChest } from '../services/taskGenerator';
import type { Task } from '../types';

export const taskRoutes = Router();

taskRoutes.post('/complete', async (req: Request, res: Response) => {
  try {
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

    // === Этап 10: emit party:boss_damaged в комнату семьи ===
    // Видят все члены семьи в реальном времени (без refresh).
    const ioForParty = req.app.get('io');
    if (ioForParty && result.bossDamageDiff && result.bossDamageDiff > 0) {
      const familyId = (user as any).family_id ?? appState.family?.id ?? 1;
      ioForParty.to(`family:${familyId}`).emit('party:boss_damaged', {
        attackerId: user.id,
        attackerName: user.display_name,
        damage: result.bossDamageDiff,
        newBossDamage: appState.boss.damage,
        bossHp: appState.boss.hp,
        bossDefeated: !!result.bossDefeated,
        timestamp: Date.now(),
      });
      // Дополнительно — глобальный stateUpdate для UI-перерасчёта
      ioForParty.emit('stateUpdate');
    }

    // Update DB (async, non-blocking for now)

    const dbUsers = schema.users;
    db.update(dbUsers).set({
      gold: user.gold,
      xp: user.xp,
      crystals: user.crystals,
      hp: user.hp,
      mp: user.mp,
      current_streak: user.current_streak,
      skill_date: user.skill_date,
      last_streak_update: user.last_streak_update,
      best_streak: user.best_streak,
    }).where(eq(dbUsers.id, user.id)).execute().catch(e => console.error('DB Update error:', e));
    if (result.error) {
      return res.status(400).json({ error: result.error });
    }

    // Сундук сюрпризов (Этап 8): ~15% шанс на бонус (APPROVED_SPEC 3)
    const surpriseChest = rollSurpriseChest();
    let totalGoldEarned = result.goldGain ?? 0;
    if (surpriseChest) {
      user.gold += surpriseChest.gold;
      user.crystals = (user.crystals || 0) + (surpriseChest.crystals || 0);
      totalGoldEarned += surpriseChest.gold;
      db.update(dbUsers).set({
        gold: user.gold,
        crystals: user.crystals,
      }).where(eq(dbUsers.id, user.id)).execute().catch(e => console.error('DB Surprise Chest error:', e));
    }

    // Check if all tasks completed for today → update streak
    const todayStr = getTodayStr();
    const allCompleted = await checkAllTasksCompleted(user.id, todayStr);
    if (allCompleted) {
      const io = req.app.get('io');
      await updateStreak(user.id, todayStr, io);
      
      // Update DB with new streak values
      db.update(dbUsers).set({
        current_streak: user.current_streak,
        last_streak_update: user.last_streak_update,
        best_streak: user.best_streak,
        streak_status: user.streak_status,
      }).where(eq(dbUsers.id, user.id)).execute().catch(e => console.error('DB Streak Update error:', e));
    }

    // Simulate sending Telegram notification to parent for approval
    // In real app, we use actual Telegram IDs. Here we pass a mock parentId.
    const parentTelegramId = 123456789;
    notifyParentAboutTaskCompletion(parentTelegramId, task.id, task.title, user.display_name).catch(console.error);

    // Новый формат ответа (Этап 8) + старые поля для обратной совместимости
    res.json({
      success: true,
      data: {
        task_id: task.id,
        title: task.title,
        reward: {
          gold: result.goldGain,
          xp: result.xpGain,
          crystals: result.crystalsGain || 0,
        },
        surprise_chest: surpriseChest,
        total_gold_earned: totalGoldEarned,
      },
      // --- Обратная совместимость (старый фронтенд) ---
      points: task.points,
      title: task.title,
      gold_gain: result.goldGain,
      xp_gain: result.xpGain,
      crystals_gain: result.crystalsGain || 0,
      level_up: result.levelUp,
      new_level: result.newLevel,
      perfect: result.perfect,
      pet: result.pet,
      bossDefeated: result.bossDefeated,
      achievements: result.achievements,
      challengeCompleted: result.challengeCompleted,
    });
  } catch (error: any) {
    console.error('Error in POST /complete:', error);
    res.status(500).json({ success: false, error: error.message || 'Internal server error' });
  }
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
