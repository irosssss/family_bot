/**
 * Сервис применения классовых скиллов.
 * Перенесён из server.ts (Фаза 2), урон воина приведён к Habitica-логике
 * (HabitRPG/habitica: website/common/script/fns/crit.js, content/spells.js#smash):
 *  - базовый урон smash = 15 (как и обещают все тексты UI «15 урона за 10 MP»);
 *  - крит: шанс 3% + рост со стриком (до 10%), множитель 1.5×;
 *  - урон не превышает остаток HP босса (без «перелёта»).
 * Раньше здесь было захардкожено 150 урона — босс (90 HP) умирал с одного удара.
 */
import { appState } from './stateService';
import { getTodayStr } from '../lib/dateUtils';
import type { User } from '../types';
import { getFamilyGameState } from './familyGameStateService';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import * as schema from '../db/schema';

function sameFamily(left: User, right: User): boolean {
 const leftFamilyId = Number(left.family_id);
 return Number.isInteger(leftFamilyId) && leftFamilyId > 0 && leftFamilyId === Number(right.family_id);
}

const SMASH_BASE_DAMAGE = 15;
const CRIT_BASE_CHANCE = 0.03; // как в crit.js Habitica
const CRIT_STREAK_SCALE = 1 / 100; // +1% шанса за день стрика
const CRIT_MAX_CHANCE = 0.10;
const CRIT_MULTIPLIER = 1.5; // как в crit.js Habitica

export function applySkill(user: User) {
 const familyGameState = getFamilyGameState(Number(user.family_id));
 if (!familyGameState) return { error: 'Family game state is unavailable' };
 const boss = familyGameState.boss;
 const todayStr = getTodayStr();
 if (user.skill_date === todayStr) {
 return { error: 'Скилл уже использован сегодня!' };
 }

 let manaCost = 10;
 if (user.class === 'mage') manaCost = 15;
 if (user.class === 'rogue') manaCost = 12;
 if (user.class === 'healer') manaCost = 15;

 if ((user.mp ?? 30) < manaCost) {
 return { error: `Недостаточно маны MP (требуется ${manaCost} MP)! Выполняйте задачи для восстановления` };
 }

 user.mp = (user.mp ?? 30) - manaCost;
 user.skill_date = todayStr;
 let message = '';
 let bossDefeated = null;

 if (user.class === 'warrior') {
 if (!boss.defeated) {
 // Habitica-крит: редкий усиленный удар (шанс слегка растёт со стриком).
 const critChance = Math.min(CRIT_MAX_CHANCE, CRIT_BASE_CHANCE * (1 + (user.current_streak || 0) * CRIT_STREAK_SCALE));
 const isCrit = Math.random() < critChance;
 const damage = Math.round(SMASH_BASE_DAMAGE * (isCrit ? CRIT_MULTIPLIER : 1));

 const remainingBefore = Math.max(0, boss.hp - boss.damage);
 const dealt = Math.min(damage, remainingBefore); // без перелёта по HP
 boss.damage += dealt;

 if (boss.damage >= boss.hp) {
 boss.defeated = 1;
 for (const u of appState.users.filter((candidate) => sameFamily(user, candidate))) {
 u.gold += 20;
 }
 bossDefeated = { ...boss };
 message = `Мощный удар Воина${isCrit ? ' — КРИТ!' : ''}! Босс получил ${dealt} урона (-${manaCost} MP). БОСС ПОВЕРЖЕН! Вся семья получила +20 золота!`;
 } else {
 message = `Мощный удар Воина${isCrit ? ' — КРИТ!' : ''}! Босс получил ${dealt} урона (${boss.hp - boss.damage}/${boss.hp} HP) [-${manaCost} MP].`;
 }
 } else {
 message = 'Босс уже повержен на этой неделе! Вы нанесли красивый рассекающий удар!';
 }
 } else if (user.class === 'mage') {
 user.xp += 25;
 message = 'Взрыв магии! Персонаж получил +25 опыта за -15 MP.';
 } else if (user.class === 'rogue') {
 user.gold += 15;
 message = 'Карманная кража Разбойника! Добыто +15 золота за -12 MP.';
 } else if (user.class === 'healer') {
 for (const u of appState.users.filter((candidate) => sameFamily(user, candidate))) {
 u.hp = Math.min(u.max_hp || 50, (u.hp || 50) + 20);
 }
 message = 'Исцеляющий свет Целителя! Вся семья восстановила +20 HP за -15 MP.';
 } else {
 user.gold += 5;
 message = 'Базовое заклинание применено: +5';
 }

 return { message, bossDefeated };
}

/** DB-first обёртка для классового скилла и семейных побочных эффектов. */
export async function applySkillAtomic(user: User) {
 const familyId = Number(user.family_id);
 const familyGameState = getFamilyGameState(familyId);
 if (!Number.isInteger(familyId) || familyId <= 0 || !familyGameState) {
 return { error: 'Family game state is unavailable' };
 }
 const familyMemoryUsers = appState.users.filter((candidate) => candidate.family_id === familyId);
 const userSnapshots = familyMemoryUsers.map((candidate) => ({
 target: candidate,
 value: structuredClone(candidate),
 }));
 const bossSnapshot = structuredClone(familyGameState.boss);

 try {
 return await db.transaction(async (tx) => {
 const familyRows = await tx.select().from(schema.users)
 .where(eq(schema.users.family_id, familyId)).orderBy(schema.users.id).for('update');
 const dbUser = familyRows.find((candidate) => candidate.id === user.id);
 if (!dbUser) return { error: 'User not found' };
 if (dbUser.family_role === 'parent') return { error: 'Родители не играют' };

 const [dbBoss] = await tx.select().from(schema.bosses)
 .where(eq(schema.bosses.family_id, familyId)).for('update').limit(1);
 if (!dbBoss) return { error: 'Family game state is unavailable' };
 for (const row of familyRows) {
 const memoryUser = appState.users.find((candidate) => candidate.id === row.id);
 if (!memoryUser) continue;
 memoryUser.gold = row.gold;
 memoryUser.xp = row.xp;
 memoryUser.hp = row.hp;
 memoryUser.mp = row.mp;
 memoryUser.skill_date = row.skill_date;
 memoryUser.current_streak = row.current_streak;
 }
 Object.assign(familyGameState.boss, {
 id: dbBoss.id,
 hp: dbBoss.hp,
 maxHp: dbBoss.max_hp,
 damage: dbBoss.damage,
 defeated: dbBoss.defeated,
 });

 const result = applySkill(user);
 if ('error' in result) return result;
 for (const row of familyRows) {
 const memoryUser = appState.users.find((candidate) => candidate.id === row.id);
 if (!memoryUser) continue;
 await tx.update(schema.users).set({
 gold: memoryUser.gold,
 xp: memoryUser.xp,
 hp: memoryUser.hp,
 mp: memoryUser.mp,
 skill_date: memoryUser.skill_date,
 }).where(eq(schema.users.id, memoryUser.id));
 }
 await tx.update(schema.bosses).set({
 damage: familyGameState.boss.damage,
 defeated: familyGameState.boss.defeated,
 }).where(eq(schema.bosses.id, dbBoss.id));
 return result;
 });
 } catch (error) {
 for (const snapshot of userSnapshots) Object.assign(snapshot.target, snapshot.value);
 Object.assign(familyGameState.boss, bossSnapshot);
 console.error('[skills] transaction failed:', error);
 return { error: 'Ошибка базы данных, попробуйте ещё раз' };
 }
}
