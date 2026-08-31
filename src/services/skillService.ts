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

const SMASH_BASE_DAMAGE = 15;
const CRIT_BASE_CHANCE = 0.03; // как в crit.js Habitica
const CRIT_STREAK_SCALE = 1 / 100; // +1% шанса за день стрика
const CRIT_MAX_CHANCE = 0.10;
const CRIT_MULTIPLIER = 1.5; // как в crit.js Habitica

export function applySkill(user: User) {
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
 if (!appState.boss.defeated) {
 // Habitica-крит: редкий усиленный удар (шанс слегка растёт со стриком).
 const critChance = Math.min(CRIT_MAX_CHANCE, CRIT_BASE_CHANCE * (1 + (user.current_streak || 0) * CRIT_STREAK_SCALE));
 const isCrit = Math.random() < critChance;
 const damage = Math.round(SMASH_BASE_DAMAGE * (isCrit ? CRIT_MULTIPLIER : 1));

 const remainingBefore = Math.max(0, appState.boss.hp - appState.boss.damage);
 const dealt = Math.min(damage, remainingBefore); // без перелёта по HP
 appState.boss.damage += dealt;

 if (appState.boss.damage >= appState.boss.hp) {
 appState.boss.defeated = 1;
 for (const u of appState.users) {
 u.gold += 20;
 }
 bossDefeated = { ...appState.boss };
 message = `Мощный удар Воина${isCrit ? ' — КРИТ!' : ''}! Босс получил ${dealt} урона (-${manaCost} MP). БОСС ${appState.boss.emoji} ПОВЕРЖЕН! Вся семья получила +20 золота!`;
 } else {
 message = `Мощный удар Воина${isCrit ? ' — КРИТ!' : ''}! Босс получил ${dealt} урона (${appState.boss.hp - appState.boss.damage}/${appState.boss.hp} HP) [-${manaCost} MP].`;
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
 for (const u of appState.users) {
 u.hp = Math.min(u.max_hp || 50, (u.hp || 50) + 20);
 }
 message = 'Исцеляющий свет Целителя! Вся семья восстановила +20 HP за -15 MP.';
 } else {
 user.gold += 5;
 message = 'Базовое заклинание применено: +5';
 }

 return { message, bossDefeated };
}
