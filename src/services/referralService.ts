/**
 * Сервис реферальной программы.
 * Перенесён из server.ts (Фаза 2) без изменения логики.
 */
import { appState } from './stateService';
import { getTodayStr } from '../lib/dateUtils';
import type { User } from '../types';

export function processReferral(refereeUser: User, rawRefCode: string) {
  if (!rawRefCode || !refereeUser) {
    return { success: false, message: 'Укажите верный реферальный код' };
  }

  let cleanCode = rawRefCode.trim().toLowerCase();
  if (cleanCode.startsWith('/start ')) {
    cleanCode = cleanCode.replace('/start ', '').trim();
  }
  if (cleanCode.startsWith('ref_')) {
    cleanCode = cleanCode.replace('ref_', '');
  }

  const referrerUser = appState.users.find(
    (u) =>
      u.id === Number(cleanCode) ||
      (u.referral_code && u.referral_code.toLowerCase().replace('ref_', '') === cleanCode) ||
      u.display_name.trim().toLowerCase() === cleanCode
  );

  if (!referrerUser) {
    return { success: false, message: 'Реферальный код не найден' };
  }

  if (referrerUser.id === refereeUser.id) {
    return { success: false, message: 'Вы не можете использовать собственный реферальный код' };
  }

  if (refereeUser.referred_by) {
    return { success: false, message: 'Вы уже активировали реферальный код ранее' };
  }

  if (!appState.referrals) {
    appState.referrals = [];
  }

  const alreadyRecorded = appState.referrals.some(
    (r) => r.referrer_id === referrerUser.id && r.referee_id === refereeUser.id
  );
  if (alreadyRecorded) {
    return { success: false, message: 'Реферальный бонус уже был начислен' };
  }

  const REFERRER_GOLD = 100;
  const REFERRER_CRYSTALS = 25;
  const REFEREE_GOLD = 50;
  const REFEREE_CRYSTALS = 15;

  refereeUser.referred_by = referrerUser.id;
  refereeUser.gold += REFEREE_GOLD;
  refereeUser.crystals = (refereeUser.crystals || 0) + REFEREE_CRYSTALS;

  referrerUser.gold += REFERRER_GOLD;
  referrerUser.crystals = (referrerUser.crystals || 0) + REFERRER_CRYSTALS;
  referrerUser.referrals_count = (referrerUser.referrals_count || 0) + 1;
  referrerUser.referral_earnings_gold = (referrerUser.referral_earnings_gold || 0) + REFERRER_GOLD;
  referrerUser.referral_earnings_crystals = (referrerUser.referral_earnings_crystals || 0) + REFERRER_CRYSTALS;

  const record = {
    id: appState.referrals.length + 1,
    referrer_id: referrerUser.id,
    referee_id: refereeUser.id,
    referee_name: refereeUser.display_name,
    created_at: getTodayStr(),
    bonus_gold: REFERRER_GOLD,
    bonus_crystals: REFERRER_CRYSTALS,
  };
  appState.referrals.push(record);

  return {
    success: true,
    message: `🎉 Реферальный код активирован! Герой ${referrerUser.display_name} получил +${REFERRER_GOLD}💰 и +${REFERRER_CRYSTALS}💎. Вам начислено +${REFEREE_GOLD}💰 и +${REFEREE_CRYSTALS}💎!`,
    referrer: referrerUser,
    referee: refereeUser,
  };
}
