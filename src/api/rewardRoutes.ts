/**
 * Роуты наград (Лавка Наград).
 * POST /buy — купить награду за gold.
 * POST /add — создать кастомную награду.
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
import { appState } from '../services/stateService';
import { sendTelegramPushNotification } from '../services/notificationService';
import { buyRewardAtomic } from '../services/walletService';
import { generateId } from '../lib/ids';
import type { Reward } from '../types';

export const rewardRoutes = Router();

// Buy Reward — атомарно через БД (Фаза 6-lite, H4).
rewardRoutes.post('/buy', async (req: AuthedRequest, res: Response) => {
 const { userId, rewardId } = req.body;
 // SEC-03 FIX: мутация от чужого имени запрещена (родителю можно управлять детьми)
 if (!canActOn(req, Number(userId))) {
   return res.status(403).json({ error: 'Forbidden: cannot act on behalf of another user' });
 }
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

 sendTelegramPushNotification(
 ` <b>${user.display_name}</b> купил(а) награду <b>"${reward.title}"</b> в Лавке Наград! (-${reward.cost})`
 );

 const purchase = appState.purchases[appState.purchases.length - 1];
 res.json({ success: true, purchase, gold: result.gold });
});

rewardRoutes.post('/add', async (req: AuthedRequest, res: Response) => {
 if (!requireAdmin(req)) {
   return res.status(403).json({ error: 'Forbidden: family admin required' });
 }
 const { title, cost, reward_type, actorId } = req.body;
 if (!title || !cost) return res.status(400).json({ error: 'Title and cost required' });

 const devActor = appState.users.find((user) => user.id === Number(actorId));
 const familyId = getAuthFamilyId(req)
   ?? (!isAuthEnforced() ? getUserFamilyId(devActor) ?? appState.family?.id ?? null : null);
 if (familyId === null) return res.status(400).json({ error: 'Family is required' });

 const newReward: Reward = {
 id: generateId(),
 title: String(title).trim(),
 cost: Math.max(1, Number(cost)),
 reward_type: (reward_type as any) || 'personal',
 active: 1,
 };

 try {
   const [row] = await db.insert(schema.rewards).values({
     title: newReward.title,
     cost: newReward.cost,
     reward_type: newReward.reward_type,
     active: newReward.active,
     family_id: familyId,
   }).returning({ id: schema.rewards.id });
   newReward.id = row.id;
   newReward.family_id = familyId;
 } catch (error) {
   console.error('[rewards] custom reward insert failed:', error);
   if (isAuthEnforced()) {
     return res.status(500).json({ error: 'Ошибка базы данных, попробуйте ещё раз' });
   }
   newReward.family_id = familyId;
 }

 appState.rewards.push(newReward);
 const io = req.app.get('io');
 if (io) io.to(`family:${familyId}`).emit('stateUpdate');
 res.json({ success: true, reward: newReward });
});
