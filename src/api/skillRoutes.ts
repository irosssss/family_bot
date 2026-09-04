/**
 * Роуты скиллов.
 * POST /use — применить классовый скилл.
 */
import { Response, Router } from 'express';
import { type AuthedRequest, canActOn, getUserFamilyId } from '../utils/apiAuth';
import { appState } from '../services/stateService';
import { applySkillAtomic } from '../services/skillService';
import { sendTelegramPushNotification } from '../services/notificationService';

export const skillRoutes = Router();

skillRoutes.post('/use', async (req: AuthedRequest, res: Response) => {
 const { userId } = req.body;
 // SEC-03 FIX: мутация от чужого имени запрещена (родителю можно управлять детьми)
 if (!canActOn(req, Number(userId))) {
   return res.status(403).json({ error: 'Forbidden: cannot act on behalf of another user' });
 }
 const user = appState.users.find((u) => u.id === Number(userId));

 if (!user) {
 return res.status(404).json({ error: 'User not found' });
 }

 if (user.family_role === 'parent') {
 return res.status(403).json({ error: 'Родители не играют' });
 }
 const result = await applySkillAtomic(user);
 const familyId = getUserFamilyId(user);
 if (result.error) {
 return res.status(400).json({ error: result.error });
 }

 sendTelegramPushNotification(
 ` <b>${user.display_name}</b> применил(а) магию: ${result.message}`
 );

 const io = req.app.get('io');
 if (io && familyId !== null) io.to(`family:${familyId}`).emit('stateUpdate');
 res.json({
 success: true,
 message: result.message,
 bossDefeated: result.bossDefeated,
 user,
 });
});
