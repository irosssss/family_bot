/**
 * Сервис применения классовых скиллов.
 * Перенесён из server.ts (Фаза 2) без изменения логики.
 */
import { appState } from './stateService';
import { getTodayStr } from '../lib/dateUtils';
import type { User } from '../types';

export function applySkill(user: User) {
  const todayStr = getTodayStr();
  if (user.skill_date === todayStr) {
    return { error: 'Скилл уже использован сегодня! ⏳' };
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
      appState.boss.damage += 15;
      if (appState.boss.damage >= appState.boss.hp) {
        appState.boss.defeated = 1;
        for (const u of appState.users) {
          u.gold += 20;
        }
        bossDefeated = { ...appState.boss };
        message = `⚔️ Мощный удар Воина! Нанесено 15 урона (-10 MP). БОСС ${appState.boss.emoji} ПОВЕРЖЕН! 🎉 Вся семья получила +20💰!`;
      } else {
        message = `⚔️ Мощный удар Воина! Босс получил 15 урона (${appState.boss.damage}/${appState.boss.hp} HP) [-10 MP].`;
      }
    } else {
      message = '⚔️ Босс уже повержен на этой неделе! Вы нанесли красивый рассекающий удар!';
    }
  } else if (user.class === 'mage') {
    user.xp += 25;
    message = '🔮 Взрыв магии! Персонаж получил +25 ⭐ опыта за -15 MP.';
  } else if (user.class === 'rogue') {
    user.gold += 15;
    message = '🗡️ Карманная кража Разбойника! Добыто +15 💰 золота за -12 MP.';
  } else if (user.class === 'healer') {
    for (const u of appState.users) {
      u.hp = Math.min(u.max_hp || 50, (u.hp || 50) + 20);
    }
    message = '💚 Исцеляющий свет Целителя! Вся семья восстановила +20 HP за -15 MP.';
  } else {
    user.gold += 5;
    message = '⚡ Базовое заклинание применено: +5 💰';
  }

  return { message, bossDefeated };
}
