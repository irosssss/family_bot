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
import { getFamilyGameState } from './familyGameStateService';

const DAMAGE_PER_MISSED = 5; // -5 HP за каждую пропущенную обязательную задачу

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
    const family = getFamilyGameState(familyId)?.family;
    return { damage: 0, newHp: family?.family_hp ?? 100, exhaustedUntil: family?.exhausted_until ?? null, justExhausted: false };
  }
  const persisted = await db.transaction(async (tx) => {
    const [family] = await tx.select().from(schema.families)
      .where(eq(schema.families.id, familyId)).for('update').limit(1);
    if (!family) return null;
    let hp = family.family_hp ?? 100;
    const maxHp = family.max_family_hp ?? 100;
    let exhaustedUntil: Date | null = family.exhausted_until ?? null;
    if (exhaustedUntil && exhaustedUntil < new Date()) exhaustedUntil = null;
    hp = Math.max(0, hp - damage);
    let justExhausted = false;
    if (hp <= 0) {
      hp = maxHp;
      exhaustedUntil = new Date(Date.now() + 24 * 60 * 60 * 1000);
      justExhausted = true;
    }
    await tx.update(schema.families)
      .set({ family_hp: hp, exhausted_until: exhaustedUntil })
      .where(eq(schema.families.id, familyId));
    return { hp, maxHp, exhaustedUntil, justExhausted };
  });
  if (!persisted) {
    return { damage: 0, newHp: 100, exhaustedUntil: null, justExhausted: false };
  }
  const { hp, maxHp, exhaustedUntil, justExhausted } = persisted;

  const gameState = getFamilyGameState(familyId);
  if (gameState) {
    gameState.family.family_hp = hp;
    gameState.family.exhausted_until = exhaustedUntil ? exhaustedUntil.toISOString() : null;
  }

  const exhaustedIso = exhaustedUntil ? exhaustedUntil.toISOString() : null;
  if (io) {
    io.to(`family:${familyId}`).emit('family:hp_changed', {
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

    const missedByFamily = new Map<number, number>();

    for (const user of appState.users) {
      // Родители не участвуют в streak/HP
      if (user.family_role === 'parent') continue;
      const familyId = Number(user.family_id);
      if (!Number.isInteger(familyId) || familyId <= 0) continue;

      try {
        // 1) Streak check
        await updateStreak(user.id, yesterdayStr, io);

        // 2) Считаем пропущенные обязательные дела за вчера
        const remaining = getRemainingTasks(user.id, yesterdayStr);
        const missed = remaining.filter((t) => t.is_required).length;
        if (missed > 0) {
          missedByFamily.set(familyId, (missedByFamily.get(familyId) || 0) + missed);
          console.log(` ${user.display_name}: ${missed} обязательных дел пропущено (вчера)`);
        }
      } catch (error) {
        console.error(`Error processing user ${user.id}:`, error);
      }
    }

    // 3) Наносим суммарный урон по Family HP
    if (missedByFamily.size > 0) {
      for (const [familyId, totalMissed] of missedByFamily) {
        const totalDamage = totalMissed * DAMAGE_PER_MISSED;
        const result = await applyNightlyDamage(familyId, totalDamage, io);
        console.log(` Family ${familyId}: nightly damage -${totalDamage} HP (missed: ${totalMissed}). New HP: ${result.newHp}`);
      }
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
  const missedByFamily = new Map<number, number>();
  for (const user of appState.users) {
    if (user.family_role === 'parent') continue;
    const familyId = Number(user.family_id);
    if (!Number.isInteger(familyId) || familyId <= 0) continue;
    try {
      await updateStreak(user.id, yesterdayStr, io);
      const remaining = getRemainingTasks(user.id, yesterdayStr);
      const missed = remaining.filter((t) => t.is_required).length;
      totalMissed += missed;
      missedByFamily.set(familyId, (missedByFamily.get(familyId) || 0) + missed);
      if (missed > 0) {
        console.log(` ${user.display_name}: ${missed} обязательных дел пропущено`);
      }
    } catch (error) {
      console.error(`Error processing user ${user.id}:`, error);
    }
  }

  let result: { damage: number; newHp: number; exhaustedUntil: string | null; justExhausted: boolean };
  if (totalMissed > 0) {
    result = { damage: 0, newHp: 100, exhaustedUntil: null, justExhausted: false };
    for (const [familyId, familyMissed] of missedByFamily) {
      const familyResult = await applyNightlyDamage(familyId, familyMissed * DAMAGE_PER_MISSED, io);
      result.damage += familyResult.damage;
      result.newHp = familyResult.newHp;
      result.exhaustedUntil = familyResult.exhaustedUntil;
      result.justExhausted ||= familyResult.justExhausted;
    }
    console.log(` Manual damage: -${result.damage} HP across ${missedByFamily.size} families.`);
  } else {
    const firstFamily = Object.values(appState.familyGameStates || {})[0]?.family;
    result = {
      damage: 0,
      newHp: firstFamily?.family_hp ?? 100,
      exhaustedUntil: firstFamily?.exhausted_until ?? null,
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
