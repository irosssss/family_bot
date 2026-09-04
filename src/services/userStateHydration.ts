/**
 * Загрузка пользователей из PostgreSQL в оперативный кэш приложения.
 *
 * appState остаётся переходным read-кэшем для старых сервисов, но не должен
 * начинаться с демо-персонажей в production: auth middleware использует его
 * до первого запроса /api/state.
 */
import { db } from '../db';
import { users as usersTable } from '../db/schema';
import { appState } from './stateService';
import type { User } from '../types';

export function toStateUser(dbUser: typeof usersTable.$inferSelect): User {
  return {
    id: dbUser.id,
    telegram_id: dbUser.telegram_id,
    display_name: dbUser.display_name,
    family_role: dbUser.family_role === 'parent' ? 'parent' : 'child',
    is_admin: dbUser.is_admin,
    assignee: dbUser.assignee === 'misha' || dbUser.assignee === 'regina' ? dbUser.assignee : 'both',
    gender: dbUser.gender === 'female' ? 'female' : dbUser.gender === 'male' ? 'male' : undefined,
    custom_avatar_url: dbUser.custom_avatar_url ?? undefined,
    character_color: dbUser.character_color ?? undefined,
    skin_tone: dbUser.skin_tone ?? undefined,
    hair_style: dbUser.hair_style ?? undefined,
    hair_color: dbUser.hair_color ?? undefined,
    eye_color: dbUser.eye_color ?? undefined,
    hp: dbUser.hp,
    max_hp: dbUser.max_hp,
    mp: dbUser.mp,
    max_mp: dbUser.max_mp,
    gold: dbUser.gold,
    xp: dbUser.xp,
    crystals: dbUser.crystals,
    current_streak: dbUser.current_streak,
    best_streak: dbUser.best_streak,
    streak_status: dbUser.streak_status === 'paused' || dbUser.streak_status === 'broken' || dbUser.streak_status === 'frozen'
      ? dbUser.streak_status
      : 'active',
    streak_freeze_available: dbUser.streak_freeze_available,
    streak_freeze_last_used: dbUser.streak_freeze_last_used?.toISOString(),
    last_streak_update: dbUser.last_streak_update ?? undefined,
    class: (dbUser.class_type || 'warrior') as User['class'],
    skill_date: dbUser.skill_date,
    notify_partner: dbUser.notify_partner ?? 1,
    timezone: dbUser.timezone ?? undefined,
    age: dbUser.age ?? undefined,
    referral_code: dbUser.referral_code ?? undefined,
    referred_by: dbUser.referred_by ?? undefined,
    equipped: {},
    pets: [],
  };
}

/** Replaces the demo cache with the authoritative set of persisted users. */
export async function hydrateUsersFromDb(): Promise<number> {
  const dbUsers = await db.select().from(usersTable);
  appState.users = dbUsers.map(toStateUser);
  return dbUsers.length;
}
