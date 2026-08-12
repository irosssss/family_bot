/**
 * Роуты наград (Лавка Наград).
 * POST /buy — купить награду за gold.
 * POST /add — создать кастомную награду.
 */
import { Request, Response, Router } from 'express';
import { appState } from '../services/stateService';
import { checkAchievements } from '../services/achievementService';
import { sendTelegramPushNotification } from '../services/notificationService';
import { getTodayStr } from '../lib/dateUtils';
import { generateId } from '../lib/ids';
import type { Reward } from '../types';

export const rewardRoutes = Router();

rewardRoutes.post('/buy', (req: Request, res: Response) => {
  const { userId, rewardId } = req.body;
  const user = appState.users.find((u) => u.id === Number(userId));
  const reward = appState.rewards.find((r) => r.id === Number(rewardId));

  if (!user || !reward) return res.status(404).json({ error: 'Not found' });
  if (user.gold < reward.cost) return res.status(400).json({ error: 'Недостаточно золота' });

  user.gold -= reward.cost;
  const purchase = {
    id: generateId(),
    user_id: user.id,
    reward_id: reward.id,
    reward_title: reward.title,
    created_at: getTodayStr(),
    user_name: user.display_name,
  };
  appState.purchases.push(purchase);

  checkAchievements(user.id);

  sendTelegramPushNotification(
    `🛍 <b>${user.display_name}</b> купил(а) награду <b>"${reward.title}"</b> в Лавке Наград! (-${reward.cost}💰)`
  );

  res.json({ success: true, purchase, gold: user.gold });
});

rewardRoutes.post('/add', (req: Request, res: Response) => {
  const { title, cost, reward_type } = req.body;
  if (!title || !cost) return res.status(400).json({ error: 'Title and cost required' });

  const newReward: Reward = {
    id: generateId(),
    title: String(title).trim(),
    cost: Math.max(1, Number(cost)),
    reward_type: (reward_type as any) || 'personal',
    active: 1,
  };

  appState.rewards.push(newReward);
  res.json({ success: true, reward: newReward });
});
