/**
 * Сервис расчёта прогресса и завершения еженедельных челленджей.
 * Перенесён из server.ts (Фаза 2) без изменения логики.
 */
import { appState } from './stateService';
import { getTodayStr } from '../lib/dateUtils';
import { getFamilyGameState } from './familyGameStateService';

export function checkChallenge(userId: number) {
 const user = appState.users.find((u) => u.id === userId);
 if (!user) return null;
 const familyUsers = appState.users.filter((candidate) => candidate.family_id === user.family_id);
 const familyUserIds = new Set(familyUsers.map((candidate) => candidate.id));
 const familyTaskIds = new Set(
   appState.tasks.filter((task) => task.family_id === user.family_id).map((task) => task.id),
 );

 const familyGameState = getFamilyGameState(Number(user.family_id));
 if (!familyGameState) return null;
 const currentChallenge = familyGameState.challenge;
 if (currentChallenge.completed) return null;

 const todayStr = getTodayStr();
 const thisWeekCompletions = appState.completions.filter((c) => c.user_id === userId);
 const perfectDaysCount = appState.perfectDays.filter((p) => p.user_id === userId).length;
 const teamTasksDone = appState.completions.filter((c) => {
 if (!familyUserIds.has(c.user_id) || !familyTaskIds.has(c.task_id)) return false;
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
 for (const u of familyUsers) {
 const already = appState.userPets.some((up) => up.user_id === u.id && up.pet_id === dragonPet.id);
 if (!already) {
 appState.userPets.push({ user_id: u.id, pet_id: dragonPet.id });
 }
 }
 }
 }

 return { title: currentChallenge.title, bonus: currentChallenge.bonus };
 }

 return null;
}
