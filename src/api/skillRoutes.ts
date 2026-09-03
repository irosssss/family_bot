/**
 * Роуты скиллов.
 * POST /use — применить классовый скилл.
 */
import { Request, Response, Router } from 'express';
import { AuthedRequest, canActOn } from '../utils/apiAuth';
import { db } from '../db';
import * as schema from '../db/schema';
import { eq } from 'drizzle-orm';
import { appState } from '../services/stateService';
import { applySkill } from '../services/skillService';
import { sendTelegramPushNotification } from '../services/notificationService';

export const skillRoutes = Router();

skillRoutes.post('/use', (req: Request, res: Response) => {
 const { userId } = req.body;
 // SEC-03 FIX: мутация от чужого имени запрещена (родителю можно управлять детьми)
 const __req = req as any;
 if (process.env.NODE_ENV === 'production' && !canActOn(__req, Number(userId))) {
   return res.status(403).json({ error: 'Forbidden: cannot act on behalf of another user' });
 }
 const user = appState.users.find((u) => u.id === Number(userId));

 if (!user) {
 return res.status(404).json({ error: 'User not found' });
 }

 const result = applySkill(user);
 // Update DB (async)

 const dbUsers = schema.users;
 db.update(dbUsers).set({
 gold: user.gold,
 xp: user.xp,
 hp: user.hp,
 mp: user.mp,
 skill_date: user.skill_date,
 }).where(eq(dbUsers.id, user.id)).execute().catch(e => console.error('DB Update error:', e));
 // If healer was used, all users are updated in appState, but we only persist this user for now unless we do a loop
 for (const u of appState.users) {
 db.update(dbUsers).set({ hp: u.hp, gold: u.gold }).where(eq(dbUsers.id, u.id)).execute().catch(e => console.error('DB Update error:', e));
 }
 if (result.error) {
 return res.status(400).json({ error: result.error });
 }

 sendTelegramPushNotification(
 ` <b>${user.display_name}</b> применил(а) магию: ${result.message}`
 );

 const io = req.app.get('io');
 if (io) io.emit('stateUpdate');
 res.json({
 success: true,
 message: result.message,
 bossDefeated: result.bossDefeated,
 user,
 });
});
