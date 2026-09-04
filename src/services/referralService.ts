/** Атомарная активация реферального кода. */
import { eq, inArray, or } from 'drizzle-orm';
import { db } from '../db';
import * as schema from '../db/schema';
import { getTodayStr } from '../lib/dateUtils';
import { appState } from './stateService';
import type { User } from '../types';

const REFERRER_GOLD = 100;
const REFERRER_CRYSTALS = 25;
const REFEREE_GOLD = 50;
const REFEREE_CRYSTALS = 15;

export interface ReferralResult {
  success: boolean;
  message: string;
  referrer?: User;
  referee?: User;
}

function normalizeCode(rawCode: string): { id?: number; code: string } {
  let code = String(rawCode || '').trim();
  if (code.toLowerCase().startsWith('/start ')) code = code.slice(7).trim();
  const idMatch = /^ref_(\d+)$/i.exec(code);
  return { id: idMatch ? Number(idMatch[1]) : undefined, code };
}

export async function processReferral(refereeUser: User, rawRefCode: string): Promise<ReferralResult> {
  if (!rawRefCode || !refereeUser) {
    return { success: false, message: 'Укажите верный реферальный код' };
  }

  const normalized = normalizeCode(rawRefCode);
  try {
    const candidates = await db.select().from(schema.users).where(
      normalized.id
        ? or(eq(schema.users.id, normalized.id), eq(schema.users.referral_code, normalized.code))
        : eq(schema.users.referral_code, normalized.code),
    ).limit(1);
    const candidate = candidates[0];
    if (!candidate) return { success: false, message: 'Реферальный код не найден' };
    if (candidate.id === refereeUser.id) {
      return { success: false, message: 'Вы не можете использовать собственный реферальный код' };
    }

    const committed = await db.transaction(async (tx) => {
      const locked = await tx.select().from(schema.users)
        .where(inArray(schema.users.id, [candidate.id, refereeUser.id].sort((a, b) => a - b)))
        .orderBy(schema.users.id)
        .for('update');
      const referrer = locked.find((user) => user.id === candidate.id);
      const referee = locked.find((user) => user.id === refereeUser.id);
      if (!referrer || !referee) return { status: 'missing' as const };
      if (referee.referred_by) return { status: 'used' as const };

      const createdAt = getTodayStr();
      const inserted = await tx.insert(schema.referrals).values({
        referrer_id: referrer.id,
        referee_id: referee.id,
        referee_name: referee.display_name,
        created_at: createdAt,
        bonus_gold: REFERRER_GOLD,
        bonus_crystals: REFERRER_CRYSTALS,
      }).onConflictDoNothing().returning({ id: schema.referrals.id });
      if (inserted.length === 0) return { status: 'used' as const };

      const [updatedReferrer] = await tx.update(schema.users).set({
        gold: referrer.gold + REFERRER_GOLD,
        crystals: referrer.crystals + REFERRER_CRYSTALS,
      }).where(eq(schema.users.id, referrer.id)).returning();
      const [updatedReferee] = await tx.update(schema.users).set({
        referred_by: referrer.id,
        gold: referee.gold + REFEREE_GOLD,
        crystals: referee.crystals + REFEREE_CRYSTALS,
      }).where(eq(schema.users.id, referee.id)).returning();
      return {
        status: 'applied' as const,
        recordId: inserted[0].id,
        createdAt,
        updatedReferrer,
        updatedReferee,
      };
    });

    if (committed.status === 'used') {
      return { success: false, message: 'Вы уже активировали реферальный код ранее' };
    }
    if (committed.status === 'missing') {
      return { success: false, message: 'Реферальный код не найден' };
    }

    const referrerMemory = appState.users.find((user) => user.id === committed.updatedReferrer.id);
    if (referrerMemory) {
      referrerMemory.gold = committed.updatedReferrer.gold;
      referrerMemory.crystals = committed.updatedReferrer.crystals;
      referrerMemory.referrals_count = (referrerMemory.referrals_count || 0) + 1;
      referrerMemory.referral_earnings_gold =
        (referrerMemory.referral_earnings_gold || 0) + REFERRER_GOLD;
      referrerMemory.referral_earnings_crystals =
        (referrerMemory.referral_earnings_crystals || 0) + REFERRER_CRYSTALS;
    }
    refereeUser.gold = committed.updatedReferee.gold;
    refereeUser.crystals = committed.updatedReferee.crystals;
    refereeUser.referred_by = committed.updatedReferee.referred_by ?? undefined;
    (appState.referrals ??= []).push({
      id: committed.recordId,
      referrer_id: committed.updatedReferrer.id,
      referee_id: committed.updatedReferee.id,
      referee_name: committed.updatedReferee.display_name,
      created_at: committed.createdAt,
      bonus_gold: REFERRER_GOLD,
      bonus_crystals: REFERRER_CRYSTALS,
    });

    return {
      success: true,
      message: `Реферальный код активирован. Герой ${committed.updatedReferrer.display_name} получил +${REFERRER_GOLD} золота и +${REFERRER_CRYSTALS} кристаллов. Вам начислено +${REFEREE_GOLD} золота и +${REFEREE_CRYSTALS} кристаллов.`,
      referrer: referrerMemory,
      referee: refereeUser,
    };
  } catch (error) {
    console.error('[referrals] transaction failed:', error);
    return { success: false, message: 'Ошибка базы данных, попробуйте ещё раз' };
  }
}
