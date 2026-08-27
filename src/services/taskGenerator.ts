/**
 * Генератор ежедневных задач (Этап 7).
 * 
 * Создаёт персональный список задач для пользователя на дату
 * с учётом возраста, типа задач и расписания.
 * 
 * Детерминированность: для одной (userId, date) генерация всегда одинакова
 * (seeded shuffle через простой хэш).
 * 
 * Источник правды: APPROVED_SPEC.md (разделы 2.1-2.4 и 3).
 */
import type { Task, User } from '../types';

/** Возрастные группы (ЕДИНЫЕ из APPROVED_SPEC 2.1): */
export type AgeGroup = '4-5' | '6-8' | '9-11' | '12-13';

/**
 * Определить возрастную группу.
 */
export function getAgeGroup(age: number): AgeGroup {
  if (age <= 5) return '4-5';
  if (age <= 8) return '6-8';
  if (age <= 11) return '9-11';
  return '12-13';
}

/**
 * Лимит количества задач на день (APPROVED_SPEC 2.2):
 *   4-5 лет:  макс 3 (1 обяз + 1-2 выбора)
 *   6-8 лет:  макс 5 (2 обяз + 2-3 выбора)
 *   9-11 лет: макс 7 (2-3 обяз + 3-4 выбора)
 *   12-13:    макс 8 (3 обяз + 3-5 выбора)
 */
export function getDailyLimit(age: number): number {
  if (age <= 5) return 3;
  if (age <= 8) return 5;
  if (age <= 11) return 7;
  return 8;
}

/**
 * Сколько обязательных задач положено возрастной группе.
 */
export function getRequiredCount(age: number): number {
  if (age <= 5) return 1;
  if (age <= 8) return 2;
  if (age <= 11) return 2;
  return 3;
}

/**
 * Совпадает ли задача с возрастом пользователя.
 */
export function matchesAge(task: Task, age: number): boolean {
  const min = task.age_min ?? 4;
  const max = task.age_max ?? 13;
  return age >= min && age <= max;
}

/**
 * Совпадает ли задача с расписанием на дату.
 */
export function matchesSchedule(task: Task, date: Date): boolean {
  switch (task.schedule_type) {
    case 'daily':
      return true;
    case 'weekdays':
      return ![0, 6].includes(date.getDay());
    case 'weekend':
      return [0, 6].includes(date.getDay());
    case 'weekly': {
      const days = task.day_of_week;
      if (days === undefined || days === null) return false;
      // day_of_week может быть числом (старая схема) или массивом (новая)
      const list = Array.isArray(days) ? days : [days];
      return list.includes(date.getDay());
    }
    case 'once':
      return false; // разовые — не генерируются ежедневно
    case 'flexible':
      return true;
    default:
      return true;
  }
}

/**
 * Доступна ли задача конкретному пользователю по assignee_type/assignee.
 * РОЛЕВАЯ МОДЕЛЬ (Этап R1):
 * - Родители НЕ получают детских задач (не играют)
 * - Дети не получают родительских задач (assignee_type === 'parent')
 */
export function matchesAssignee(task: Task, user: User): boolean {
  // Родители не играют — им не генерируем детские задачи
  if (user.family_role === 'parent') return false;
  // Дети не получают родительские задачи
  if (task.assignee_type === 'parent') return false;

  const at = task.assignee_type ?? 'any';
  switch (at) {
    case 'any':
      return true;
    case 'both':
      return true;
    // case 'parent' недостижим: отфильтрован выше
    case 'individual': {
      const list = task.assignee_list ?? [];
      if (list.length === 0) {
        // Fallback на старую модель: assignee ('misha' | 'regina' | 'both')
        return task.assignee === 'both' || task.assignee === user.assignee;
      }
      return list.includes(user.assignee) || list.includes(user.display_name);
    }
    default:
      return true;
  }
}

/**
 * Простой детерминированный PRNG (mulberry32).
 * Для seeded shuffle: одинаковый результат для одной (dateStr + userId).
 */
export function seededRandom(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Перемешать массив детерминированно (не мутирует исходный).
 */
function seededShuffle<T>(arr: T[], rand: () => number): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/**
 * Нормализация типа задачи (БАГ #2 FIX).
 * Старые задачи (daily/weekly/todo) приводятся к новому типу:
 *   daily/weekly → core (классическая, на выбор)
 *   todo         → personal (личная, не обязательная)
 */
export function getEffectiveTaskType(task: Task): Task['task_type'] {
  switch (task.task_type) {
    case 'daily':
    case 'weekly':
      return 'core';
    case 'todo':
      return 'personal';
    default:
      return task.task_type;
  }
}

/**
 * Получить задачи пользователя (core + personal + quest), подходящие
 * по возрасту, расписанию и доступности.
 */
export function getTasksForUser(user: User, tasks: Task[], date: Date): Task[] {
  return tasks.filter(
    (t) =>
      matchesAge(t, user.age ?? 8) &&
      matchesSchedule(t, date) &&
      matchesAssignee(t, user)
  );
}

/**
 * Получить ОБЯЗАТЕЛЬНЫЕ задачи для пользователя на дату:
 * только personal с is_required=true (APPROVED_SPEC 2.3).
 */
export function getRequiredTasks(user: User, tasks: Task[], date: Date): Task[] {
  return getTasksForUser(user, tasks, date).filter(
    (t) => getEffectiveTaskType(t) === 'personal' && t.is_required
  );
}

/**
 * Генерация ежедневных задач.
 * 
 * Алгоритм (APPROVED_SPEC 2.2-2.3):
 * 1. Обязательные: personal required, подходящие по возрасту/расписанию.
 * 2. Выбор: core + personal (не required) + quest — перемешанные seeded shuffle.
 * 3. Добираем до возрастного лимита (минимум 1 на выбор).
 * 4. Квесты отдельно добавляем (макс 2), не входят в лимит выбора.
 */
export function generateDailyTasks(user: User, tasks: Task[], date: Date): Task[] {
  // РОЛЕВАЯ МОДЕЛЬ (Этап R1): родители не играют — у них нет сгенерированных задач
  if (user.family_role === 'parent') return [];

  const dateStr = date.toISOString().split('T')[0];
  const rand = seededRandom(`${dateStr}:${user.id}`);

  // 1. Обязательные (personal required)
  const required = getRequiredTasks(user, tasks, date);
  const requiredCount = getRequiredCount(user.age ?? 8);

  // Если обязательных больше лимита — берём первые (детерминированно).
  const selectedRequired = required.slice(0, requiredCount);

  // 2. Пул на выбор: core + optional personal (БАГ #2: нормализация старых типов)
  const choicePool = getTasksForUser(user, tasks, date).filter(
    (t) => {
      const effectiveType = getEffectiveTaskType(t);
      return effectiveType === 'core' || (effectiveType === 'personal' && !t.is_required);
    }
  );

  // 3. Лимит выбора = возрастной лимит минус уже добавленные обязательные
  const limit = getDailyLimit(user.age ?? 8);
  const choiceLimit = Math.max(1, limit - selectedRequired.length);

  const shuffled = seededShuffle(choicePool, rand);
  const selectedChoice = shuffled.slice(0, choiceLimit);

  // 4. Квесты (макс 2)
  const quests = getTasksForUser(user, tasks, date)
    .filter((t) => getEffectiveTaskType(t) === 'quest')
    .slice(0, 2);

  // Собираем итоговый список, без дубликатов
  const result: Task[] = [];
  const seen = new Set<number>();
  for (const t of [...selectedRequired, ...selectedChoice, ...quests]) {
    if (!seen.has(t.id)) {
      seen.add(t.id);
      result.push(t);
    }
  }

  return result;
}

/**
 * Возрастной множитель награды (APPROVED_SPEC 3):
 *   4-5: ×0.7, 6-8: ×1.0, 9-11: ×1.3, 12-13: ×1.6
 */
export function getAgeMultiplier(age: number): number {
  const group = getAgeGroup(age);
  const mults: Record<AgeGroup, number> = {
    '4-5': 0.7,
    '6-8': 1.0,
    '9-11': 1.3,
    '12-13': 1.6,
  };
  return mults[group] ?? 1.0;
}

/**
 * Базовая награда по типу задачи (APPROVED_SPEC 3):
 *   personal: 15-25, core: 20-30, quest: 60-100
 */
export function getBaseReward(task: Task): { min: number; max: number } {
  switch (task.task_type) {
    case 'quest':
      return { min: 60, max: 100 };
    case 'core':
      return { min: 20, max: 30 };
    case 'personal':
      return { min: 15, max: 25 };
    default:
      return { min: 15, max: 25 };
  }
}

/**
 * Расчёт награды за задачу:
 *   gold = base × ageMult × (0.8 + rand(0.4))
 *   crystals только для quest (3-5 кристаллов)
 */
export function calculateReward(
  task: Task,
  user: User,
  rand: () => number = Math.random
): { gold: number; xp: number; crystals: number } {
  const ageMult = getAgeMultiplier(user.age ?? 8);
  const { min, max } = getBaseReward(task);
  const base = min + rand() * (max - min);
  const variance = 0.8 + rand() * 0.4; // 80-120%
  const gold = Math.round(base * ageMult * variance);
  const crystals = task.task_type === 'quest' ? 3 + Math.floor(rand() * 3) : 0;
  return { gold, xp: gold, crystals };
}

/**
 * Сундук сюрпризов (APPROVED_SPEC 3, anti-overjustification):
 * ~15% шанс на бонус: 10-50 золота, кристалл редко (~20% от шанса).
 */
export function rollSurpriseChest(rand: () => number = Math.random): { gold: number; crystals: number } | null {
  if (rand() < 0.15) {
    return {
      gold: 10 + Math.floor(rand() * 41),
      crystals: rand() < 0.2 ? 1 : 0,
    };
  }
  return null;
}
