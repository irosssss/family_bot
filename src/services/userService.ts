/**
 * Сервис профиля пользователя.
 *
 * persistProfile объединяет 4 дословно скопированных блока `db.update`,
 * которые раньше дублировались в роутах /users/class, /users/gender,
 * /users/update-character, /users/custom-avatar.
 *
 * Поведение сохранено: fire-and-forget (ошибки логируются, но не рвут
 * ответ клиенту). В Фазе 6 это будет пересмотрено — ошибки БД должны
 * влиять на результат операции.
 */
import { db } from '../db';
import * as schema from '../db/schema';
import { eq } from 'drizzle-orm';
import type { User } from '../types';

/** Сохраняет поля внешнего вида/класса персонажа в БД.
 *  ARC-01: await вместо плавающего промиса; ошибка логируется с userId.
 *  Профиль некритичен для экономики — при сбое БД память остаётся (best-effort),
 *  но ошибка теперь видна и await-безопасна (no-floating-promises). */
export async function persistProfile(user: User): Promise<void> {
  try {
    await db.update(schema.users).set({
      class_type: user.class,
      gender: user.gender,
      custom_avatar_url: user.custom_avatar_url,
      character_color: user.character_color,
      skin_tone: user.skin_tone,
      hair_style: user.hair_style,
      hair_color: user.hair_color,
      eye_color: user.eye_color,
      habitica_equipped: (user as any).habitica_equipped ?? {},
    }).where(eq(schema.users.id, user.id));
  } catch (e) {
    console.error(`[arc01] persistProfile failed for user ${user.id}:`, e);
  }
}
