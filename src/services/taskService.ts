/**
 * Сервис завершения задач — ядро игровой логики.
 * Рассчитывает игровые эффекты и обновляет in-memory зеркало. Транзакционная
 * оркестрация БД выполняется в progressService.completeTaskAtomic.
 */
import { appState } from './stateService';
import { getTodayStr, getNowTimestamp } from '../lib/dateUtils';
import { checkAchievements } from './achievementService';
import { checkChallenge } from './challengeService';
import { generateId } from '../lib/ids';
import { getStreakMultiplier } from './streakService';
import { calculateReward } from './taskGenerator';
import { decayOnSuccess, valueColor } from './habitService';
import type { Completion, Pet, Task, User } from '../types';
import { getFamilyGameState } from './familyGameStateService';

export function applyTaskCompletion(user: User, task: Task, completionSeed?: Completion) {
  const familyId = Number(user.family_id);
  const familyGameState = getFamilyGameState(familyId);
  if (!familyGameState) return { error: 'Family game state is unavailable' };
  const boss = familyGameState.boss;
  const todayStr = getTodayStr();
  const existing = appState.completions.find(
    (c) => c.user_id === user.id && c.task_id === task.id && c.completed_at === todayStr
  );

  if (existing) {
    return { error: 'Task already completed today' };
  }

  const completion: Completion = completionSeed ?? {
    id: generateId(),
    user_id: user.id,
    task_id: task.id,
    completed_at: todayStr,
    completed_at_ts: getNowTimestamp(),
  };
  appState.completions.push(completion);

  // Streak Bonus Multiplier
  const streakMultiplier = getStreakMultiplier(user.current_streak || 0);

  // === Habitica Task Value Decay (Этап 4) ===
  // Ценность задачи меняется от выполнения: V += 1.5*(1-sigmoid(V))
  const taskAny = task as any;
  const oldValue = typeof taskAny.value === 'number' ? taskAny.value : 0;
  const newValue = decayOnSuccess(oldValue);
  taskAny.value = newValue;
  taskAny.last_completed_at = new Date();
  // Множитель золота: запущенная (красная) задача платит больше, закреплённая — меньше
  const valueMult = valueColor(newValue).goldMultiplier;

  // --- Расчёт наград (Этап 8: calculateReward для новых задач) ---
  // Новые задачи (core/personal/quest) — по утверждённой экономике APPROVED_SPEC.
  // Старые задачи (daily/weekly/todo) — старая формула (обратная совместимость).
  const isNewTaskType = ['core', 'personal', 'quest'].includes(task.task_type);

  let baseGold: number;
  let baseXP: number;
  let crystalsGain = 0;

  if (isNewTaskType) {
    const reward = calculateReward(task, user);
    baseGold = reward.gold;
    baseXP = reward.xp;
    crystalsGain = reward.crystals;
  } else {
    baseGold = task.points + (user.class === 'warrior' && task.points >= 4 ? 1 : 0);
    baseXP = user.class === 'mage' ? Math.round(task.points * 1.2 * 10) : task.points * 10;
  }

  // Apply streak bonus + Habitica value multiplier
  let goldGain = Math.floor(baseGold * streakMultiplier * valueMult);
  const xpGain = Math.floor(baseXP * streakMultiplier);

  // === Этап 9: модификатор золота при истощении семьи ===
  // Если family.exhausted_until > now → -15% золота
  const family = familyGameState.family;
  const isFamilyExhausted = !!(family?.exhausted_until && new Date(family.exhausted_until) > new Date());
  let exhaustedModifier = 0;
  if (isFamilyExhausted) {
    const reduced = Math.floor(goldGain * 0.85);
    exhaustedModifier = goldGain - reduced;
    goldGain = reduced;
  }

  const oldLevel = Math.floor(user.xp / 100) + 1;
  user.xp += xpGain;
  user.gold += goldGain;
  user.crystals = (user.crystals || 0) + crystalsGain;
  const newLevel = Math.floor(user.xp / 100) + 1;
  const levelUp = newLevel > oldLevel;

  // Boss Damage
  let bossDefeated = null;
  const oldBossDamage = boss.damage;
  if (!boss.defeated) {
    boss.damage += task.points;
    if (boss.damage >= boss.hp) {
      boss.defeated = 1;
      // Award +20 gold to both players!
      for (const u of appState.users.filter((candidate) => candidate.family_id === user.family_id)) {
        u.gold += 20;
      }
      bossDefeated = { ...boss };
    }
  }
  const bossDamageDiff = boss.damage - oldBossDamage;

  // Check Perfect Day: all scheduled tasks for user done today
  const currentWeekday = new Date().getDay() === 0 ? 6 : new Date().getDay() - 1;
  const userScheduledTasks = appState.tasks.filter(
    (t) =>
      t.family_id === user.family_id &&
      (t.assignee === user.assignee || t.assignee === 'both') &&
      (t.task_type === 'daily' || (t.task_type === 'weekly' && t.day_of_week === currentWeekday))
  );

  const userCompletedIds = appState.completions
    .filter((c) => c.user_id === user.id && c.completed_at === todayStr)
    .map((c) => c.task_id);

  let perfect = false;
  if (
    userScheduledTasks.length > 0 &&
    userScheduledTasks.every((t) => userCompletedIds.includes(t.id))
  ) {
    const alreadyPerfect = appState.perfectDays.some(
      (p) => p.user_id === user.id && p.day === todayStr
    );
    if (!alreadyPerfect) {
      appState.perfectDays.push({ user_id: user.id, day: todayStr });
      user.gold += 5;
      perfect = true;
    }
  }

  // Regenerate +5 MP and +2 HP per task completion
  user.mp = Math.min(user.max_mp || 50, (user.mp || 30) + 5);
  user.hp = Math.min(user.max_hp || 50, (user.hp || 50) + 2);

  // 25% Chance Pet Drop
  let foundPet: Pet | null = null;
  if (Math.random() < 0.25) {
    const ownedPetIds = appState.userPets
      .filter((up) => up.user_id === user.id)
      .map((up) => up.pet_id);
    const unownedPets = appState.pets.filter((p) => !ownedPetIds.includes(p.id));
    if (unownedPets.length > 0) {
      foundPet = unownedPets[Math.floor(Math.random() * unownedPets.length)];
      appState.userPets.push({ user_id: user.id, pet_id: foundPet.id });
    }
  }

  // Check Achievements & Challenges
  const newAchievements = checkAchievements(user.id);
  const challengeResult = checkChallenge(user.id);

  return {
    completion,
    goldGain,
    xpGain,
    crystalsGain,
    levelUp,
    newLevel,
    perfect,
    pet: foundPet,
    bossDefeated,
    achievements: newAchievements,
    challengeCompleted: challengeResult,
    bossDamageDiff,
    boss: { ...boss },
    isFamilyExhausted,
    exhaustedModifier,
  };
}
