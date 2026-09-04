import { getTodayStr } from '../lib/dateUtils';
import { appState } from './stateService';
import { valueColor } from './habitService';
import {
  calculateReward,
  generateDailyTasks,
  getEffectiveTaskType,
  seededRandom,
} from './taskGenerator';

export interface TodayTaskDTO {
  id: number;
  code: string;
  title: string;
  points: number;
  category: string | null;
  task_type: string;
  is_required: boolean;
  done: boolean;
  crystals: number;
}

export interface TodayTasksData {
  date: string;
  user: { id: number; display_name: string; age?: number };
  required: TodayTaskDTO[];
  choice: TodayTaskDTO[];
  quests: TodayTaskDTO[];
  summary: {
    total: number;
    required_done: number;
    required_total: number;
    all_required_done: boolean;
    progress_percent: number;
  };
}

/** Единый доменный builder для HTTP-роута и Telegram cron. */
export function buildTodayTasksData(userId: number, requestedDate?: string): TodayTasksData | null {
  const user = appState.users.find((candidate) => candidate.id === userId);
  if (!user) return null;

  const dateStr = requestedDate || getTodayStr();
  const date = new Date(`${dateStr}T12:00:00`);
  if (Number.isNaN(date.getTime())) return null;

  const tasks = generateDailyTasks(user, appState.tasks, date);
  const completedTaskIds = new Set(
    appState.completions
      .filter((completion) => completion.user_id === userId && completion.completed_at === dateStr)
      .map((completion) => completion.task_id),
  );

  const serializeTask = (task: (typeof tasks)[number]): TodayTaskDTO => {
    const rewardRand = seededRandom(`${dateStr}:${user.id}:${task.id}`);
    const reward = calculateReward(task, user, rewardRand);
    const taskValue = typeof task.value === 'number' ? task.value : 0;
    const valueMultiplier = valueColor(taskValue).goldMultiplier;
    return {
      id: task.id,
      code: task.code,
      title: task.title,
      points: Math.max(1, Math.round(reward.gold * valueMultiplier)),
      category: task.category ?? null,
      task_type: task.task_type,
      is_required: !!task.is_required,
      done: completedTaskIds.has(task.id),
      crystals: reward.crystals,
    };
  };

  const required = tasks
    .filter((task) => getEffectiveTaskType(task) === 'personal' && task.is_required)
    .map(serializeTask);
  const choice = tasks
    .filter((task) => {
      const effectiveType = getEffectiveTaskType(task);
      return effectiveType === 'core' || (effectiveType === 'personal' && !task.is_required);
    })
    .map(serializeTask);
  const quests = tasks
    .filter((task) => getEffectiveTaskType(task) === 'quest')
    .map(serializeTask);

  const requiredDone = required.filter((task) => task.done).length;
  const doneTotal = tasks.filter((task) => completedTaskIds.has(task.id)).length;

  return {
    date: dateStr,
    user: { id: user.id, display_name: user.display_name, age: user.age ?? 8 },
    required,
    choice,
    quests,
    summary: {
      total: tasks.length,
      required_done: requiredDone,
      required_total: required.length,
      all_required_done: required.length > 0 && requiredDone === required.length,
      progress_percent: tasks.length === 0 ? 0 : Math.round((doneTotal / tasks.length) * 100),
    },
  };
}
