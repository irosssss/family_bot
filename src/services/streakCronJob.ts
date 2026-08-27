/**
 * Cron Job: Daily Streak Check + Family HP Counter-Attack (Этап 9).
 *
 * Запускается каждый день в 00:00 (полночь).
 * 1. Проверяет streak для всех активных детей за вчерашний день.
 * 2. Пропущенные обязательные задачи наносят урон Family HP (-5 за каждую).
 * 3. Если Family HP падает до 0 → устанавливается exhausted_until = +24ч.
 * 4. Отправляет Socket.IO событие `family:hp_changed` всем клиентам.
 */
import cron from 'node-cron';
import { eq } from 'drizzle-orm';
import { appState } from './stateService';
import { updateStreak, getRemainingTasks } from './streakService';
import { db } from '../db';
import * as schema from '../db/schema';

const DAMAGE_PER_MISSED = 5; // -5 HP за каждую пропущенную обязательную задачу

/**
 * Получить ID семьи для урона.
 * MVP: берём первую семью из БД (в production — из user.family_id).
 */
async function getPrimaryFamilyId(): Promise<number> {
  const rows = await db.select().from(schema.families).limit(1);
  return rows[0]?.id ?? 1;
}

/**
 * Применить урон Family HP от ночной контратаки.
 * Возвращает { damage, newHp, exhaustedUntil, justExhausted }.
 */
async function applyNightlyDamage(
  familyId: number,
  damage: number,
  io?: any
): Promise<{ damage: number; newHp: number; exhaustedUntil: string | null; justExhausted: boolean }> {
  if (damage <= 0) {
    return { damage: 0, newHp: appState.family?.family_hp ?? 100, exhaustedUntil: appState.family?.exhausted_until ?? null, justExhausted: false };
  }
  const rows = await db.select().from(schema.families).where(eq(schema.families.id, familyId)).limit(1);
  if (rows.length === 0) {
    return { damage: 0, newHp: 100, exhaustedUntil: null, justExhausted: false };
  }
  const f = rows[0];
  let hp = f.family_hp ?? 100;
  let maxHp = f.max_family_hp ?? 100;
  let exhaustedUntil: Date | null = f.exhausted_until ?? null;

  // Снимаем истощение, если вышло
  if (exhaustedUntil && exhaustedUntil < new Date()) {
    exhaustedUntil = null;
  }

  hp = Math.max(0, hp - damage);
  let justExhausted = false;
  if (hp <= 0) {
    hp = maxHp;
    exhaustedUntil = new Date(Date.now() + 24 * 60 * 60 * 1000);
    justExhausted = true;
  }

  await db.update(schema.families)
    .set({ family_hp: hp, exhausted_until: exhaustedUntil })
    .where(eq(schema.families.id, familyId))
    .catch((e) => console.error('Family HP update error:', e));

  if (appState.family) {
    appState.family.family_hp = hp;
    appState.family.exhausted_until = exhaustedUntil ? exhaustedUntil.toISOString() : null;
  }

  const exhaustedIso = exhaustedUntil ? exhaustedUntil.toISOString() : null;
  if (io) {
    io.emit('family:hp_changed', {
      familyId,
      hp,
      maxHp,
      exhaustedUntil: exhaustedIso,
      justExhausted,
    });
  }

  return { damage, newHp: hp, exhaustedUntil: exhaustedIso, justExhausted };
}

/**
 * Инициализировать cron job для проверки streak + Family HP.
 * Вызывается при старте сервера.
 */
export function initStreakCronJob(io?: any): void {
  // Запуск каждый день в 00:00
  cron.schedule('0 0 * * *', async () => {
    console.log(' Running daily streak + family HP check at midnight...');

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];

    let totalMissed = 0;

    for (const user of appState.users) {
      // Родители не участвуют в streak/HP
      if (user.family_role === 'parent') continue;

      try {
        // 1) Streak check
        await updateStreak(user.id, yesterdayStr, io);

        // 2) Считаем пропущенные обязательные дела за вчера
        const remaining = getRemainingTasks(user.id, yesterdayStr);
        const missed = remaining.filter((t) => t.is_required).length;
        if (missed > 0) {
          totalMissed += missed;
          console.log(` ${user.display_name}: ${missed} обязательных дел пропущено (вчера)`);
        }
      } catch (error) {
        console.error(`Error processing user ${user.id}:`, error);
      }
    }

    // 3) Наносим суммарный урон по Family HP
    if (totalMissed > 0) {
      const familyId = await getPrimaryFamilyId();
      const totalDamage = totalMissed * DAMAGE_PER_MISSED;
      const result = await applyNightlyDamage(familyId, totalDamage, io);
      console.log(` Nightly damage: -${totalDamage} HP (пропусков: ${totalMissed}). New HP: ${result.newHp}${result.justExhausted ? ' (СЕМЬЯ ИСТОЩЕНА!)' : ''}`);
    } else {
      console.log(' Все обязательные дела выполнены — семья отдыхает!');
    }

    console.log(' Daily streak + family HP check completed');
  });

  console.log(' Streak cron job initialized (runs at 00:00 daily)');
}

/**
 * Запустить проверку streak + Family HP вручную (для тестирования).
 * Возвращает отчёт.
 */
export async function manualStreakCheck(io?: any): Promise<{
  totalMissed: number;
  totalDamage: number;
  newHp: number;
  exhaustedUntil: string | null;
  justExhausted: boolean;
}> {
  console.log(' Manual streak + family HP check started...');

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split('T')[0];

  let totalMissed = 0;
  for (const user of appState.users) {
    if (user.family_role === 'parent') continue;
    try {
      await updateStreak(user.id, yesterdayStr, io);
      const remaining = getRemainingTasks(user.id, yesterdayStr);
      const missed = remaining.filter((t) => t.is_required).length;
      totalMissed += missed;
      if (missed > 0) {
        console.log(` ${user.display_name}: ${missed} обязательных дел пропущено`);
      }
    } catch (error) {
      console.error(`Error processing user ${user.id}:`, error);
    }
  }

  let result: { damage: number; newHp: number; exhaustedUntil: string | null; justExhausted: boolean };
  if (totalMissed > 0) {
    const familyId = await getPrimaryFamilyId();
    const totalDamage = totalMissed * DAMAGE_PER_MISSED;
    result = await applyNightlyDamage(familyId, totalDamage, io);
    console.log(` Manual damage: -${totalDamage} HP. New HP: ${result.newHp}${result.justExhausted ? ' (СЕМЬЯ ИСТОЩЕНА!)' : ''}`);
  } else {
    result = {
      damage: 0,
      newHp: appState.family?.family_hp ?? 100,
      exhaustedUntil: appState.family?.exhausted_until ?? null,
      justExhausted: false,
    };
  }

  console.log(' Manual check completed');
  return {
    totalMissed,
    totalDamage: result.damage,
    newHp: result.newHp,
    exhaustedUntil: result.exhaustedUntil,
    justExhausted: result.justExhausted,
  };
}
