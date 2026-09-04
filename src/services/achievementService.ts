/**
 * Сервис проверки и разблокировки достижений.
 * Перенесён из server.ts (Фаза 2) без изменения логики.
 */
import { appState } from './stateService';
import { getFamilyGameState } from './familyGameStateService';

export function checkAchievements(userId: number) {
  const user = appState.users.find((u) => u.id === userId);
  if (!user) return [];

  const userCompletions = appState.completions.filter((c) => c.user_id === userId);
  const userPurchases = appState.purchases.filter((p) => p.user_id === userId);
  const userPetCount = appState.userPets.filter((p) => p.user_id === userId).length;
  const bossesDefeated = getFamilyGameState(Number(user.family_id))?.boss.defeated ? 1 : 0;
  const level = Math.floor(user.xp / 100) + 1;

  const conditions: Record<string, boolean> = {
    first_task: userCompletions.length >= 1,
    tasks_10: userCompletions.length >= 10,
    tasks_50: userCompletions.length >= 50,
    streak_3: (user.current_streak || 0) >= 3,
    streak_7: (user.current_streak || 0) >= 7,
    level_3: level >= 3,
    level_5: level >= 5,
    first_buy: userPurchases.length >= 1,
    boss_1: bossesDefeated >= 1,
    pet_1: userPetCount >= 1,
  };

  const newUnlocked: any[] = [];

  for (const ach of appState.achievements) {
    const already = appState.userAchievements.some(
      (ua) => ua.user_id === userId && ua.achievement_id === ach.id
    );
    if (conditions[ach.code] && !already) {
      appState.userAchievements.push({ user_id: userId, achievement_id: ach.id });
      user.gold += ach.bonus;
      newUnlocked.push(ach);
    }
  }

  return newUnlocked;
}
