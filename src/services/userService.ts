/**
 * Сервис профиля пользователя.
 *
 * persistProfile объединяет 4 дословно скопированных блока `db.update`,
 * которые раньше дублировались в роутах /users/class, /users/gender,
 * /users/update-character, /users/custom-avatar.
 *
 * Запись подтверждается до ответа API; вызывающий откатывает in-memory
 * зеркало при ошибке.
 */
import { db } from '../db';
import * as schema from '../db/schema';
import { eq } from 'drizzle-orm';
import type { User } from '../types';

/** Сохраняет поля внешнего вида/класса персонажа в БД. */
export async function persistProfile(user: User): Promise<boolean> {
  try {
    const updated = await db.update(schema.users).set({
      class_type: user.class,
      gender: user.gender,
      custom_avatar_url: user.custom_avatar_url,
      character_color: user.character_color,
      skin_tone: user.skin_tone,
      hair_style: user.hair_style,
      hair_color: user.hair_color,
      eye_color: user.eye_color,
      habitica_equipped: (user as any).habitica_equipped ?? {},
    }).where(eq(schema.users.id, user.id)).returning({ id: schema.users.id });
    return updated.length > 0;
  } catch (e) {
    console.error(`[arc01] persistProfile failed for user ${user.id}:`, e);
    return false;
  }
}
