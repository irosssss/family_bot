/**
 * Роуты задач.
 * POST /complete — отметить выполнение.
 * POST /toggle — отменить выполнение.
 * POST /add — создать кастомную задачу.
 */
import { Response, Router } from 'express';
import {
  type AuthedRequest,
  canActOn,
  getAuthFamilyId,
  getUserFamilyId,
  isAuthEnforced,
  requireAdmin,
} from '../utils/apiAuth';
import { db } from '../db';
import * as schema from '../db/schema';
import { eq } from 'drizzle-orm';
import { appState } from '../services/stateService';
import {
  completeTaskAtomic,
  undoTaskCompletionAtomic,
} from '../services/progressService';
import { notifyParentAboutTaskCompletion } from '../bot/telegramBot';
import { getTodayStr } from '../lib/dateUtils';
import { generateId } from '../lib/ids';
import { checkAllTasksCompleted, updateStreak } from '../services/streakService';
import { isTaskAssignedToUser, assigneeLabel } from '../services/assigneeService';
import type { Task } from '../types';
import { sendTelegramPushNotification } from '../services/notificationService';

export const taskRoutes = Router();

taskRoutes.post('/complete', async (req: AuthedRequest, res: Response) => {
  try {
    const userId = Number(req.body.userId);
    const taskId = Number(req.body.taskId);
    if (!Number.isInteger(userId) || !Number.isInteger(taskId)) {
      return res.status(400).json({ error: 'Valid userId and taskId are required' });
    }
    // SEC-03 FIX: мутация от чужого имени запрещена (родителю можно управлять детьми)
    if (!canActOn(req, userId)) {
      return res.status(403).json({ error: 'Forbidden: cannot act on behalf of another user' });
    }
    const user = appState.users.find((u) => u.id === userId);
    const task = appState.tasks.find((t) => t.id === taskId);

    if (!user || !task) {
      return res.status(404).json({ error: 'User or task not found' });
    }
    const familyId = getUserFamilyId(user);
    if (isAuthEnforced() && (familyId === null || task.family_id !== familyId)) {
      return res.status(403).json({ error: 'Forbidden: task belongs to another family' });
    }

    // ARC-02: единый резолв назначенности (userId-модель + legacy fallback)
    if (!isTaskAssignedToUser(task, user)) {
      const assigneeName = assigneeLabel(task, appState.users);
      return res
        .status(403)
        .json({ error: `Эта задача назначена на (${assigneeName}). Только исполнитель может её выполнить и подтвердить!` });
    }

    const completion = await completeTaskAtomic(user, task);
    if (completion.status === 'duplicate') {
      return res.status(409).json({ error: 'Task already completed today' });
    }
    if (completion.status === 'not_found') {
      return res.status(404).json({ error: 'User, task or family game state not found' });
    }
    if (completion.status === 'db_error' || !completion.result) {
      return res.status(500).json({ error: 'Ошибка базы данных, попробуйте ещё раз' });
    }
    const result = completion.result;
    const surpriseChest = completion.surpriseChest ?? null;
    const totalGoldEarned = completion.totalGoldEarned ?? result.goldGain;

    // Check if all tasks completed for today → update streak
    const todayStr = getTodayStr();
    const allCompleted = await checkAllTasksCompleted(user.id, todayStr);
    if (allCompleted) {
      const io = req.app.get('io');
      try {
        await updateStreak(user.id, todayStr, io);
      } catch (error) {
        // Completion уже зафиксирован атомарно. Не предлагаем клиенту повторить
        // запрос и тем самым не маскируем успешную награду как общий 500.
        console.error('[tasks] streak update failed after committed completion:', error);
      }
    }

    // События и внешние уведомления отправляем только после COMMIT.
    const ioForParty = req.app.get('io');
    if (ioForParty && familyId !== null && result.bossDamageDiff > 0) {
      ioForParty.to(`family:${familyId}`).emit('party:boss_damaged', {
        attackerId: user.id,
        attackerName: user.display_name,
        damage: result.bossDamageDiff,
        newBossDamage: result.boss.damage,
        bossHp: result.boss.hp,
        bossDefeated: !!result.bossDefeated,
        timestamp: Date.now(),
      });
      ioForParty.to(`family:${familyId}`).emit('stateUpdate');
    }

    const familyUsers = appState.users.filter((candidate) => candidate.family_id === user.family_id);
    const notificationJobs: Promise<unknown>[] = [
      sendTelegramPushNotification(
        `<b>${user.display_name}</b> выполнил(а) задачу <b>"${task.title}"</b> (+${result.goldGain} золота, +${result.xpGain} опыта)!`,
      ),
    ];
    if (result.bossDefeated) {
      notificationJobs.push(sendTelegramPushNotification(
        `<b>СЕМЕЙНЫЙ БОСС ПОВЕРЖЕН!</b>\nГерои ${familyUsers.map((candidate) => candidate.display_name).join(' и ')} разгромили босса <b>${result.bossDefeated.name}</b>! Вся семья получает по +20 золота!`,
      ));
    }
    if (result.challengeCompleted) {
      notificationJobs.push(sendTelegramPushNotification(
        `<b>СЕМЕЙНЫЙ ЧЕЛЛЕНДЖ ВЫПОЛНЕН!</b>\nСемейный квест <b>"${result.challengeCompleted.title}"</b> завершён. Герой <b>${user.display_name}</b> принёс +${result.challengeCompleted.bonus} золота!`,
      ));
    }

    // Уведомляем только родителей той же семьи; тестового Telegram ID здесь быть не должно.
    if (familyId !== null) {
      const parents = appState.users.filter(
        (candidate) =>
          getUserFamilyId(candidate) === familyId &&
          (candidate.is_admin || candidate.family_role === 'parent'),
      );
      notificationJobs.push(...parents.map((parent) =>
        notifyParentAboutTaskCompletion(parent.telegram_id, task.id, task.title, user.display_name),
      ));
    }
    void Promise.allSettled(notificationJobs);

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

taskRoutes.post('/toggle', async (req: AuthedRequest, res: Response) => {
  const userId = Number(req.body.userId);
  const taskId = Number(req.body.taskId);
  if (!Number.isInteger(userId) || !Number.isInteger(taskId)) {
    return res.status(400).json({ error: 'Valid userId and taskId are required' });
  }
  const user = appState.users.find((u) => u.id === userId);
  // SEC-03 FIX: мутация от чужого имени запрещена (родителю можно управлять детьми)
  if (!canActOn(req, userId)) {
    return res.status(403).json({ error: 'Forbidden: cannot act on behalf of another user' });
  }
  const task = appState.tasks.find((t) => t.id === taskId);

  if (!user || !task) return res.status(404).json({ error: 'User or task not found' });
  const familyId = getUserFamilyId(user);
  if (isAuthEnforced() && (familyId === null || task.family_id !== familyId)) {
    return res.status(403).json({ error: 'Forbidden: task belongs to another family' });
  }

  if (!isTaskAssignedToUser(task, user)) {
    return res.status(403).json({ error: 'Вы можете отменять отметку только своих задач!' });
  }

  const undo = await undoTaskCompletionAtomic(user, task);
  if (undo.status === 'missing') return res.status(404).json({ error: 'Completion not found' });
  if (undo.status === 'not_latest') {
    return res.status(409).json({ error: 'Можно отменить только последнее выполнение в семье' });
  }
  if (undo.status === 'effects_missing') {
    return res.status(409).json({ error: 'Старую отметку нельзя безопасно отменить' });
  }
  if (undo.status === 'effects_in_use') {
    return res.status(409).json({ error: 'Полученный питомец уже использован; отмена недоступна' });
  }
  if (undo.status === 'dependent_reward') {
    return res.status(409).json({ error: 'За это выполнение уже выдана награда серии; отмена недоступна' });
  }
  if (undo.status === 'insufficient_balance') {
    return res.status(409).json({ error: 'Сначала восстановите потраченную награду' });
  }
  if (undo.status === 'db_error') {
    return res.status(500).json({ error: 'Ошибка базы данных, попробуйте ещё раз' });
  }
  const io = req.app.get('io');
  if (io && familyId !== null) io.to(`family:${familyId}`).emit('stateUpdate');
  return res.json({ success: true, action: 'uncompleted' });
});

taskRoutes.post('/add', async (req: AuthedRequest, res: Response) => {
  if (!requireAdmin(req)) {
    return res.status(403).json({ error: 'Forbidden: family admin required' });
  }
  const { title, points, assignee, task_type, actorId } = req.body;
  if (!title || !points) {
    return res.status(400).json({ error: 'Title and points required' });
  }

  const devActor = appState.users.find((user) => user.id === Number(actorId));
  const familyId = getAuthFamilyId(req)
    ?? (!isAuthEnforced() ? getUserFamilyId(devActor) ?? appState.family?.id ?? null : null);
  if (familyId === null) {
    return res.status(400).json({ error: 'Family is required' });
  }

  const draft: Task = {
    id: generateId(),
    family_id: familyId,
    code: `custom_${generateId()}`,
    title: String(title).trim(),
    points: Math.max(1, Math.min(10, Number(points))),
    assignee: (assignee as any) || 'both',
    task_type: (task_type as any) || 'todo',
    day_of_week: null,
  };

  // Фаза 6: задача живёт в БД (FK completions.task_id). id зеркала = серийный
  // id БД; только локальный DEMO без БД может продолжить с временным id.
  try {
    const [row] = await db
      .insert(schema.tasks)
      .values({
        family_id: familyId,
        code: draft.code,
        title: draft.title,
        description: '',
        points: draft.points,
        assignee: draft.assignee,
        task_type: draft.task_type,
        day_of_week: null,
      })
      .returning({ id: schema.tasks.id });
    draft.id = row.id;
  } catch (e) {
    console.error('[Phase6] custom task insert failed:', e);
    if (isAuthEnforced()) {
      return res.status(500).json({ error: 'Ошибка базы данных, попробуйте ещё раз' });
    }
  }

  appState.tasks.push(draft);
  const io = req.app.get('io');
  if (io) io.to(`family:${familyId}`).emit('stateUpdate');
  res.json({ success: true, task: draft });
});
