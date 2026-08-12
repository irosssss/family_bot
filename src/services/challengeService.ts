/**
 * Сервис расчёта прогресса и завершения еженедельных челленджей.
 * Перенесён из server.ts (Фаза 2) без изменения логики.
 */
import { appState } from './stateService';
import { getTodayStr } from '../lib/dateUtils';
import { sendTelegramPushNotification } from './notificationService';

export function checkChallenge(userId: number) {
  const user = appState.users.find((u) => u.id === userId);
  if (!user) return null;

  const currentChallenge = appState.challenge;
  if (currentChallenge.completed) return null;

  const todayStr = getTodayStr();
  const thisWeekCompletions = appState.completions.filter((c) => c.user_id === userId);
  const perfectDaysCount = appState.perfectDays.filter((p) => p.user_id === userId).length;
  const teamTasksDone = appState.completions.filter((c) => {
    const task = appState.tasks.find((t) => t.id === c.task_id);
    return task?.assignee === 'both';
  }).length;

  let progress = 0;
  if (currentChallenge.code === 'summer_dragon_15') {
    progress = teamTasksDone;
  } else if (currentChallenge.code === 'marathon_12') {
    progress = thisWeekCompletions.length;
  } else if (currentChallenge.code === 'perfect_2') {
    progress = perfectDaysCount;
  } else if (currentChallenge.code === 'team_3') {
    progress = teamTasksDone;
  }

  currentChallenge.progress = progress;

  if (progress >= currentChallenge.target) {
    currentChallenge.completed = true;
    user.gold += currentChallenge.bonus;

    // Grant special Gold Dragon Pet if dragon challenge!
    if (currentChallenge.code === 'summer_dragon_15') {
      const dragonPet = appState.pets.find((p) => p.code === 'gold_dragon');
      if (dragonPet) {
        for (const u of appState.users) {
          const already = appState.userPets.some((up) => up.user_id === u.id && up.pet_id === dragonPet.id);
          if (!already) {
            appState.userPets.push({ user_id: u.id, pet_id: dragonPet.id });
          }
        }
      }
    }

    sendTelegramPushNotification(
      `🏆 <b>СЕМЕЙНЫЙ ЧЕЛЛЕНДЖ ВЫПОЛНЕН!</b> 🎉\nСемейный квест <b>"${currentChallenge.title}"</b> полностью завершен! Герой <b>${user.display_name}</b> принес в семейную казну +${currentChallenge.bonus}💰!`
    );

    return { title: currentChallenge.title, bonus: currentChallenge.bonus };
  }

  return null;
}
