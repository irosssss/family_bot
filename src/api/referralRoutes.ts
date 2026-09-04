/**
 * Роуты реферальной программы.
 * GET /info — код/ссылка/статистика рефералов.
 * POST /apply — активировать реферальный код.
 */
import { Response, Router } from 'express';
import { type AuthedRequest, canAccessUser, canActOn } from '../utils/apiAuth';
import { appState } from '../services/stateService';
import { processReferral } from '../services/referralService';

export const referralRoutes = Router();

referralRoutes.get('/info', (req: AuthedRequest, res: Response) => {
  const userId = Number(req.query.userId);
  if (!Number.isInteger(userId) || userId <= 0) {
    return res.status(400).json({ error: 'Valid userId is required' });
  }
  const user = appState.users.find((u) => u.id === userId);
  if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
  if (!canAccessUser(req, userId)) {
    return res.status(403).json({ error: 'Forbidden: not your family' });
  }

  const referralCode = user.referral_code || `ref_${user.id}`;
  if (!user.referral_code) user.referral_code = referralCode;

  const myReferrals = (appState.referrals || []).filter((r) => r.referrer_id === user.id);

  res.json({
    referralCode,
    referralLink: `https://t.me/FamilyChoresBot?start=${referralCode}`,
    referralsCount: user.referrals_count || myReferrals.length,
    referralEarningsGold: user.referral_earnings_gold || myReferrals.reduce((acc, r) => acc + r.bonus_gold, 0),
    referralEarningsCrystals: user.referral_earnings_crystals || myReferrals.reduce((acc, r) => acc + r.bonus_crystals, 0),
    referredBy: user.referred_by ? appState.users.find((u) => u.id === user.referred_by)?.display_name : null,
    referralsList: myReferrals.map((r) => {
      const refUser = appState.users.find((u) => u.id === r.referee_id);
      return {
        id: r.id,
        refereeName: r.referee_name,
        date: r.created_at,
        bonusGold: r.bonus_gold,
        bonusCrystals: r.bonus_crystals,
        userColor: refUser?.character_color || refUser?.color || '#f59e0b',
        userClass: refUser?.class || 'warrior',
      };
    }),
    inviteRewards: {
      referrerGold: 100,
      referrerCrystals: 25,
      refereeGold: 50,
      refereeCrystals: 15,
    },
  });
});

referralRoutes.post('/apply', async (req: AuthedRequest, res: Response) => {
  const { userId, refCode } = req.body;
  // SEC-03 FIX: мутация от чужого имени запрещена (родителю можно управлять детьми)
  if (!canActOn(req, Number(userId))) {
    return res.status(403).json({ error: 'Forbidden: cannot act on behalf of another user' });
  }
  const user = appState.users.find((u) => u.id === Number(userId));
  if (!user) return res.status(404).json({ error: 'Пользователь не найден' });

  const result = await processReferral(user, refCode);
  if (!result.success) {
    return res.status(400).json({ error: result.message });
  }

  res.json({
    success: true,
    message: result.message,
    user,
    referrer: result.referrer,
  });
});
