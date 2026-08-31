/**
 * Роуты наград (Лавка Наград).
 * POST /buy — купить награду за gold.
 * POST /add — создать кастомную награду.
 */
import { Request, Response, Router } from 'express';
import { appState } from '../services/stateService';
import { checkAchievements } from '../services/achievementService';
import { sendTelegramPushNotification } from '../services/notificationService';
import { buyRewardAtomic } from '../services/walletService';
import { generateId } from '../lib/ids';
import type { Reward } from '../types';

export const rewardRoutes = Router();

// Buy Reward — атомарно через БД (Фаза 6-lite, H4).
rewardRoutes.post('/buy', async (req: Request, res: Response) => {
 const { userId, rewardId } = req.body;
 const user = appState.users.find((u) => u.id === Number(userId));
 const reward = appState.rewards.find((r) => r.id === Number(rewardId));

 if (!user || !reward) return res.status(404).json({ error: 'Not found' });

 const result = await buyRewardAtomic(user.id, reward.id);
 if (!result.ok) {
   const status = result.reason === 'db_error' ? 500 : 400;
   const msg =
     result.reason === 'insufficient_funds' ? 'Недостаточно золота'
     : result.reason === 'db_error' ? 'Ошибка базы данных, попробуйте ещё раз'
     : 'Not found';
   return res.status(status).json({ error: msg });
 }

 checkAchievements(user.id);

 sendTelegramPushNotification(
 ` <b>${user.display_name}</b> купил(а) награду <b>"${reward.title}"</b> в Лавке Наград! (-${reward.cost})`
 );

 const purchase = appState.purchases[appState.purchases.length - 1];
 res.json({ success: true, purchase, gold: result.gold });
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
