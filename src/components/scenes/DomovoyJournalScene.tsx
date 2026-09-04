import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BedDouble,
  BookOpen,
  Check,
  ChevronRight,
  CircleCheck,
  Clock3,
  Coins,
  Gift,
  Heart,
  Home,
  ListChecks,
  PawPrint,
  Plus,
  Settings,
  Shirt,
  Sparkles,
  Trash2,
  Users,
  Utensils,
} from 'lucide-react';
import { AppState, Task, TaskCategory, User } from '../../types';
import HabiticaAnimatedAvatar from '../HabiticaAnimatedAvatar';
import { getUnifiedLook } from '../../utils/unifiedLook';
import { triggerHaptic } from '../../utils/haptics';
import { apiFetch } from '../../utils/apiFetch';

type TaskFilter = 'all' | 'required' | 'family';

/** Payload from GET /api/users/:id/tasks/today. The server owns rewards and completion state. */
interface TodayTaskApi {
  id: number;
  code: string;
  title: string;
  points: number;
  category: TaskCategory | null;
  task_type: Task['task_type'];
  is_required: boolean;
  done: boolean;
  crystals: number;
}

interface TodayTasksData {
  date: string;
  user: { id: number; display_name: string; age?: number };
  required: TodayTaskApi[];
  choice: TodayTaskApi[];
  quests: TodayTaskApi[];
  summary: {
    total: number;
    required_done: number;
    required_total: number;
    all_required_done: boolean;
    progress_percent: number;
  };
}

/**
 * A display-safe subset shared by the server's today payload and local parent plan.
 * Child screens intentionally receive their state only from TodayTaskApi.
 */
type JournalTask = {
  id: number;
  code: string;
  title: string;
  points: number;
  task_type: Task['task_type'];
  category?: TaskCategory | null;
  is_required?: boolean;
  done?: boolean;
  description?: string;
  assignee?: Task['assignee'];
  assignee_type?: Task['assignee_type'];
  assignee_list?: string[];
  schedule_type?: Task['schedule_type'];
  day_of_week?: Task['day_of_week'];
  crystals?: number;
};

interface DomovoyJournalSceneProps {
  appState: AppState;
  activeUser: User;
  onCompleteTask: (taskId: number) => void;
  onUndoTask: (taskId: number) => void;
  onOpenAddTask: () => void;
  onOpenShop: () => void;
  onOpenFamilySettings: () => void;
}

type CategoryMeta = {
  label: string;
  icon: typeof Home;
  tileClass: string;
  stampClass: string;
};

const CATEGORY_META: Record<TaskCategory, CategoryMeta> = {
  clean: { label: 'Уют', icon: Sparkles, tileClass: 'bg-[#e9b78e] text-[#633b25]', stampClass: 'border-[#9b552f] bg-[#f3c79b] text-[#633b25]' },
  kitchen: { label: 'Кухня', icon: Utensils, tileClass: 'bg-[#d9bb78] text-[#5e4920]', stampClass: 'border-[#8e6a21] bg-[#edd497] text-[#5e4920]' },
  laundry: { label: 'Стирка', icon: Shirt, tileClass: 'bg-[#9bbdc3] text-[#244a51]', stampClass: 'border-[#477980] bg-[#b7d9dd] text-[#244a51]' },
  trash: { label: 'Порядок', icon: Trash2, tileClass: 'bg-[#9daa7c] text-[#40522b]', stampClass: 'border-[#61723f] bg-[#bdca95] text-[#40522b]' },
  bedroom: { label: 'Комната', icon: BedDouble, tileClass: 'bg-[#c7a4bd] text-[#57394f]', stampClass: 'border-[#815777] bg-[#dfbdd5] text-[#57394f]' },
  hygiene: { label: 'Забота', icon: Heart, tileClass: 'bg-[#e5a9a1] text-[#673a39]', stampClass: 'border-[#9c5a54] bg-[#f1c3bd] text-[#673a39]' },
  study: { label: 'Учёба', icon: BookOpen, tileClass: 'bg-[#a4b8d9] text-[#344a6b]', stampClass: 'border-[#5d7aa2] bg-[#c1d1ec] text-[#344a6b]' },
  pet: { label: 'Питомец', icon: PawPrint, tileClass: 'bg-[#c6a477] text-[#5c4025]', stampClass: 'border-[#916638] bg-[#e2bf91] text-[#5c4025]' },
  hobby: { label: 'Мастерская', icon: Sparkles, tileClass: 'bg-[#d5a3c1] text-[#673a58]', stampClass: 'border-[#955878] bg-[#ecc0db] text-[#673a58]' },
  health: { label: 'Самочувствие', icon: Heart, tileClass: 'bg-[#97c6ae] text-[#285a45]', stampClass: 'border-[#4d8a69] bg-[#b3ddc6] text-[#285a45]' },
  family: { label: 'Вместе', icon: Users, tileClass: 'bg-[#c9ad82] text-[#5c4126]', stampClass: 'border-[#90663a] bg-[#e5c69a] text-[#5c4126]' },
  parent: { label: 'План семьи', icon: Settings, tileClass: 'bg-[#b6adb6] text-[#4c454d]', stampClass: 'border-[#776f78] bg-[#d3cbd4] text-[#4c454d]' },
};

function cx(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(' ');
}

function getCategoryMeta(task: JournalTask): CategoryMeta {
  return CATEGORY_META[task.category ?? 'family'];
}

function isFamilyTask(task: JournalTask): boolean {
  return task.assignee === 'both' || task.assignee_type === 'both' || task.category === 'family' || task.task_type === 'quest';
}

function taskAudienceLabel(task: JournalTask, activeUser: User): string {
  if (isFamilyTask(task)) return 'вместе';
  if (task.assignee_type === 'parent') return 'для родителя';
  if (!task.assignee) return 'твой план';
  return task.assignee === activeUser.assignee ? 'только ты' : 'назначено';
}

function taskScheduleLabel(task: JournalTask): string {
  if (task.schedule_type === 'weekly' || task.task_type === 'weekly') return 'на этой неделе';
  if (task.schedule_type === 'once' || task.task_type === 'todo') return 'разовое дело';
  if (task.task_type === 'quest') return 'семейный проект';
  return 'сегодня';
}

function isScheduledForToday(task: Task, todayDayIndex: number): boolean {
  if (task.task_type === 'daily' || task.task_type === 'todo' || task.task_type === 'quest' || task.schedule_type === 'daily') return true;
  if (task.schedule_type === 'weekdays') return todayDayIndex <= 4;
  if (task.schedule_type === 'weekend') return todayDayIndex >= 5;
  if (task.task_type !== 'weekly' && task.schedule_type !== 'weekly') return false;

  const scheduledDays = Array.isArray(task.day_of_week) ? task.day_of_week : [task.day_of_week];
  return scheduledDays.includes(todayDayIndex);
}

function CompletionStamp({
  task,
  onComplete,
  pending,
}: {
  task: JournalTask;
  onComplete: (task: JournalTask) => void;
  pending: boolean;
}): React.ReactElement {
  const meta = getCategoryMeta(task);

  return (
    <button
      type="button"
      onClick={() => onComplete(task)}
      disabled={pending}
      className={cx(
        'grid h-12 w-12 shrink-0 place-items-center rounded-[15px] border-2 shadow-[2px_2px_0_#2f241c] transition-transform active:translate-x-[2px] active:translate-y-[2px] active:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2f241c] focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-55',
        meta.stampClass,
      )}
      aria-label={pending ? 'Отправляем отметку для «' + task.title + '»' : 'Отметить «' + task.title + '» выполненным'}
      aria-busy={pending || undefined}
    >
      <Check className="h-6 w-6 stroke-[2.75]" aria-hidden="true" />
    </button>
  );
}

export function DomovoyJournalScene({
  appState,
  activeUser,
  onCompleteTask,
  onUndoTask,
  onOpenAddTask,
  onOpenShop,
  onOpenFamilySettings,
}: DomovoyJournalSceneProps): React.ReactElement {
  const [filter, setFilter] = useState<TaskFilter>('all');
  // An admin is a management role even when legacy records have no family_role yet.
  const isParent = activeUser.family_role === 'parent' || activeUser.is_admin === true;
  const isChild = !isParent;
  const [todayData, setTodayData] = useState<TodayTasksData | null>(null);
  const [isTodayLoading, setIsTodayLoading] = useState(!isParent);
  const [todayError, setTodayError] = useState(false);
  const [pendingActions, setPendingActions] = useState<Map<number, boolean>>(() => new Map());
  const pendingActionTargets = useRef<Map<number, boolean>>(new Map());
  const actionTimers = useRef<Array<ReturnType<typeof setTimeout>>>([]);

  const clearActionTimers = useCallback(() => {
    actionTimers.current.forEach((timer) => clearTimeout(timer));
    actionTimers.current = [];
  }, []);

  const scheduleActionTimer = useCallback((callback: () => void, delay: number) => {
    const timer = setTimeout(() => {
      actionTimers.current = actionTimers.current.filter((candidate) => candidate !== timer);
      callback();
    }, delay);
    actionTimers.current.push(timer);
  }, []);

  const clearPendingAction = useCallback((taskId: number) => {
    if (!pendingActionTargets.current.has(taskId)) return;
    pendingActionTargets.current.delete(taskId);
    setPendingActions(new Map(pendingActionTargets.current));
  }, []);

  const refreshTodayTasks = useCallback(async (
    userId: number,
    options: { quiet?: boolean; signal?: AbortSignal } = {},
  ): Promise<TodayTasksData | null> => {
    const { quiet = false, signal } = options;
    if (!quiet) {
      setIsTodayLoading(true);
      setTodayError(false);
      setTodayData(null);
    }

    try {
      const response = await apiFetch(`/api/users/${userId}/tasks/today`, { signal });
      if (!response.ok) throw new Error('Today tasks request failed');
      const payload = await response.json() as { data?: TodayTasksData };
      if (!payload.data) throw new Error('Today tasks payload is missing');
      if (signal?.aborted) return null;

      setTodayData(payload.data);
      setTodayError(false);
      return payload.data;
    } catch (error) {
      if (signal?.aborted) return null;
      console.warn('DomovoyJournalScene: невозможно обновить сегодняшние задачи', error);
      if (!quiet) {
        setTodayData(null);
        setTodayError(true);
      }
      return null;
    } finally {
      if (!quiet && !signal?.aborted) setIsTodayLoading(false);
    }
  }, []);

  useEffect(() => {
    clearActionTimers();
    pendingActionTargets.current.clear();
    setPendingActions(new Map());

    if (isParent) {
      setTodayData(null);
      setTodayError(false);
      setIsTodayLoading(false);
      return undefined;
    }

    const controller = new AbortController();
    void refreshTodayTasks(activeUser.id, { signal: controller.signal });
    return () => {
      controller.abort();
      clearActionTimers();
    };
  }, [activeUser.id, clearActionTimers, isParent, refreshTodayTasks]);

  const todayTasks = useMemo<JournalTask[]>(() => {
    if (!todayData || todayData.user.id !== activeUser.id) return [];
    return [...todayData.required, ...todayData.choice, ...todayData.quests];
  }, [activeUser.id, todayData]);

  const childTaskState = useMemo(() => {
    const pending = todayTasks.filter((task) => !task.done);
    const done = todayTasks.filter((task) => task.done);
    const required = pending.filter((task) => task.is_required);
    const family = pending.filter(isFamilyTask);
    return { available: todayTasks, pending, done, required, family };
  }, [todayTasks]);

  const todayDayIndex = new Date().getDay() === 0 ? 6 : new Date().getDay() - 1;
  const parentTaskState = useMemo(() => {
    // Parents see a plan assembled from current family task definitions, not a false
    // completion total. Per-child completion truth is intentionally left to each child API view.
    const available = appState.tasks.filter((task) =>
      (!task.family_id || !activeUser.family_id || task.family_id === activeUser.family_id)
      && isScheduledForToday(task, todayDayIndex),
    );
    const required = available.filter((task) => task.is_required);
    const family = available.filter(isFamilyTask);
    return { available, pending: available, done: [] as JournalTask[], required, family };
  }, [appState.tasks, todayDayIndex]);

  const taskState = isParent ? parentTaskState : childTaskState;

  useEffect(() => {
    if (!todayData) return;

    const serverDoneState = new Map(todayTasks.map((task) => [task.id, Boolean(task.done)]));
    let changed = false;
    const nextTargets = new Map(pendingActionTargets.current);
    nextTargets.forEach((targetDone, taskId) => {
      if (serverDoneState.get(taskId) === targetDone) {
        nextTargets.delete(taskId);
        changed = true;
      }
    });
    if (changed) {
      pendingActionTargets.current = nextTargets;
      setPendingActions(new Map(nextTargets));
    }
  }, [todayData, todayTasks]);

  const primaryTask = isChild ? taskState.required[0] ?? taskState.pending[0] ?? null : null;
  const remainingTasks = isChild
    ? taskState.pending.filter((task) => task.id !== primaryTask?.id)
    : taskState.available;
  const visibleTasks = (filter === 'required'
    ? remainingTasks.filter((task) => task.is_required)
    : filter === 'family'
      ? remainingTasks.filter(isFamilyTask)
      : remainingTasks
  ).slice(0, 6);

  const level = Math.max(1, Math.floor(activeUser.xp / 100) + 1);
  const xpProgress = activeUser.xp % 100;
  const dayProgress = todayData?.summary.progress_percent ?? 0;
  const completedToday = childTaskState.done.length;
  const plannedFamilyTasks = parentTaskState.family.length;
  const activePet = appState.pets.find((pet) =>
    appState.userPets.some((owned) => owned.user_id === activeUser.id && owned.pet_id === pet.id && owned.is_active),
  );
  const heroLook = getUnifiedLook(activeUser);

  const runTaskAction = (task: JournalTask, targetDone: boolean) => {
    if (pendingActionTargets.current.has(task.id)) return;

    pendingActionTargets.current.set(task.id, targetDone);
    setPendingActions(new Map(pendingActionTargets.current));
    triggerHaptic('impact', 'medium');
    if (targetDone) onCompleteTask(task.id);
    else onUndoTask(task.id);

    // The parent callback intentionally returns no request result. Reconcile twice with
    // the server payload, and unlock after a short safety timeout if the request failed.
    scheduleActionTimer(() => {
      void refreshTodayTasks(activeUser.id, { quiet: true });
    }, 700);
    scheduleActionTimer(() => {
      void refreshTodayTasks(activeUser.id, { quiet: true });
    }, 1800);
    scheduleActionTimer(() => clearPendingAction(task.id), 4500);
  };

  const completeTask = (task: JournalTask) => runTaskAction(task, true);
  const undoTask = (task: JournalTask) => runTaskAction(task, false);

  const chooseFilter = (nextFilter: TaskFilter) => {
    triggerHaptic('selection', 'light');
    setFilter(nextFilter);
  };

  return (
    <section
      className="relative isolate overflow-hidden rounded-[28px] border-[3px] border-[#2f241c] bg-[#f5e7c8] text-[#2f241c] shadow-[0_10px_0_#2f241c] sm:rounded-[32px]"
      aria-label={isParent ? 'План семьи на сегодня' : 'Домовой журнал на сегодня'}
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-35"
        style={{
          backgroundImage: 'radial-gradient(rgba(102,72,36,.2) 1px, transparent 1px), linear-gradient(135deg, transparent 42%, rgba(161,109,58,.08) 42%, rgba(161,109,58,.08) 58%, transparent 58%)',
          backgroundPosition: '0 0, 0 0',
          backgroundSize: '11px 11px, 26px 26px',
        }}
        aria-hidden="true"
      />

      <header className="relative overflow-hidden border-b-[3px] border-[#2f241c] bg-[#42614f] px-4 pb-4 pt-4 text-[#fff8e8] sm:px-6">
        <div className="absolute -right-10 -top-10 h-36 w-36 rounded-full border-[18px] border-[#f3cf82]/25" aria-hidden="true" />
        <div className="relative flex items-start justify-between gap-3">
          <div>
            <p className="font-pixel-sub text-[10px] tracking-[0.14em] text-[#f3cf82]">
              {isParent ? 'ПЛАН СЕМЬИ' : 'ДОМОВОЙ ЖУРНАЛ'}
            </p>
            <h2 className="mt-1 text-xl font-black tracking-[-0.035em] sm:text-2xl">
              {isParent ? 'План семьи на сегодня' : 'Сегодняшние дела'}
            </h2>
          </div>
          <button
            type="button"
            onClick={isParent ? onOpenFamilySettings : onOpenShop}
            className="grid min-h-11 min-w-11 place-items-center rounded-[14px] border-2 border-[#f3cf82]/70 bg-[#274737] text-[#f3cf82] shadow-[2px_2px_0_rgba(20,42,31,.7)] transition-transform active:translate-x-[2px] active:translate-y-[2px] active:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#42614f]"
            aria-label={isParent ? 'Открыть настройки семьи' : 'Открыть лавку'}
          >
            {isParent ? <Settings className="h-5 w-5" aria-hidden="true" /> : <Gift className="h-5 w-5" aria-hidden="true" />}
          </button>
        </div>
      </header>

      <div className="relative p-3 sm:p-5">
        {isChild ? (
          <div className="relative overflow-hidden rounded-[22px] border-2 border-[#2f241c] bg-[#fff7e5] shadow-[4px_4px_0_#b9834d]">
            <div className="absolute inset-y-0 right-0 w-1/2 bg-[radial-gradient(circle_at_70%_40%,rgba(243,207,130,.7),transparent_52%)]" aria-hidden="true" />
            <div className="relative flex min-h-[148px] items-center gap-2 px-3 py-3 sm:px-5">
              <div className="relative -mb-3 -ml-2 h-[130px] w-[104px] shrink-0 sm:h-[146px] sm:w-[118px]">
                <div className="absolute inset-x-3 bottom-2 h-4 rounded-[50%] bg-[#2f241c]/25 blur-[2px]" aria-hidden="true" />
                <HabiticaAnimatedAvatar
                  look={heroLook}
                  cls={activeUser.class}
                  size={112}
                  state="idle"
                  gender={activeUser.gender}
                  petUrl={activePet?.imageUrl}
                  shadow={false}
                  className="absolute bottom-2 left-0"
                />
                <span className="absolute bottom-0 left-1 rounded-lg border-2 border-[#2f241c] bg-[#f3cf82] px-1.5 py-0.5 font-pixel-sub text-[9px] font-bold text-[#2f241c]">
                  ур. {level}
                </span>
              </div>
              <div className="min-w-0 flex-1 py-2">
                <p className="truncate text-base font-black tracking-[-0.025em]">{activeUser.display_name}</p>
                <p className="mt-0.5 text-[11px] font-semibold text-[#6b5137]">Хранитель домашнего очага</p>
                <div className="mt-3">
                  <div className="mb-1 flex items-center justify-between gap-2 text-[10px] font-bold text-[#6b5137]">
                    <span>опыт до ур. {level + 1}</span>
                    <span>{xpProgress} / 100</span>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full border border-[#2f241c] bg-[#e8d4ad]">
                    <div className="h-full rounded-full bg-[#5b8d68]" style={{ width: String(xpProgress) + '%' }} />
                  </div>
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 rounded-lg border border-[#b9834d] bg-[#f7deb0] px-2 py-1 text-[11px] font-black text-[#61401e]">
                    <img src="/assets/game/ui/coin.png" alt="" aria-hidden="true" className="h-3.5 w-3.5 pixel-art" />
                    {activeUser.gold}
                  </span>
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[#6b5137]">
                    <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                    {isTodayLoading ? 'обновляем…' : completedToday + ' сделано'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-3 divide-x-2 divide-[#2f241c] overflow-hidden rounded-[20px] border-2 border-[#2f241c] bg-[#fff7e5] text-center shadow-[3px_3px_0_#b9834d]">
            <div className="p-3">
              <p className="font-pixel-sub text-[9px] text-[#6b5137]">В ПЛАНЕ</p>
              <p className="mt-1 text-2xl font-black">{taskState.available.length}</p>
            </div>
            <div className="p-3">
              <p className="font-pixel-sub text-[9px] text-[#6b5137]">ОБЩИЕ</p>
              <p className="mt-1 text-2xl font-black">{taskState.family.length}</p>
            </div>
            <div className="p-3">
              <p className="font-pixel-sub text-[9px] text-[#6b5137]">ВАЖНЫЕ</p>
              <p className="mt-1 text-2xl font-black">{taskState.required.length}</p>
            </div>
          </div>
        )}

        <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_240px]">
          <div className="space-y-3">
            {isParent ? (
              <section className="rounded-[20px] border-2 border-[#2f241c] bg-[#fff7e5] p-4 shadow-[3px_3px_0_#b9834d]">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-pixel-sub text-[10px] tracking-[0.12em] text-[#7b5b3e]">СЛЕДУЮЩИЙ ШАГ</p>
                    <h3 className="mt-1 text-base font-black">Добавьте или распределите дело</h3>
                    <p className="mt-1 text-xs leading-5 text-[#6b5137]">
                      Родительский экран показывает только план семьи, без игровой валюты и действий героя.
                    </p>
                  </div>
                  <Home className="mt-1 h-8 w-8 shrink-0 text-[#5b8d68]" aria-hidden="true" />
                </div>
                <button
                  type="button"
                  onClick={onOpenAddTask}
                  className="mt-4 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-[14px] border-2 border-[#2f241c] bg-[#5b8d68] px-4 text-sm font-black text-[#fff8e8] shadow-[3px_3px_0_#2f241c] transition-transform active:translate-x-[3px] active:translate-y-[3px] active:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2f241c] focus-visible:ring-offset-2"
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  Добавить дело
                </button>
              </section>
            ) : isTodayLoading ? (
              <section className="rounded-[20px] border-2 border-[#2f241c] bg-[#fff7e5] p-5 text-center shadow-[3px_3px_0_#b9834d]" aria-live="polite">
                <Sparkles className="mx-auto h-9 w-9 animate-pulse text-[#5b8d68]" aria-hidden="true" />
                <h3 className="mt-2 text-base font-black">Сверяем твой список дел</h3>
                <p className="mt-1 text-xs text-[#6b5137]">Награды и отметки берём из сегодняшнего плана.</p>
              </section>
            ) : todayError ? (
              <section className="rounded-[20px] border-2 border-[#2f241c] bg-[#fff7e5] p-5 text-center shadow-[3px_3px_0_#b9834d]" role="status">
                <Clock3 className="mx-auto h-9 w-9 text-[#855529]" aria-hidden="true" />
                <h3 className="mt-2 text-base font-black">Не удалось обновить список</h3>
                <p className="mt-1 text-xs text-[#6b5137]">Повторите попытку, чтобы увидеть точные награды и отметки.</p>
                <button
                  type="button"
                  onClick={() => { void refreshTodayTasks(activeUser.id); }}
                  className="mt-4 inline-flex min-h-11 items-center justify-center rounded-xl border-2 border-[#2f241c] bg-[#e8d4ad] px-4 text-xs font-black shadow-[2px_2px_0_#2f241c] transition-transform active:translate-x-[2px] active:translate-y-[2px] active:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2f241c] focus-visible:ring-offset-2"
                >
                  Обновить список
                </button>
              </section>
            ) : primaryTask ? (
              <section className="overflow-hidden rounded-[20px] border-2 border-[#2f241c] bg-[#fff7e5] shadow-[3px_3px_0_#b9834d]">
                <div className="flex items-center justify-between border-b border-[#2f241c]/20 bg-[#ead4ab] px-4 py-2">
                  <span className="font-pixel-sub text-[10px] tracking-[0.12em] text-[#61401e]">ГЛАВНОЕ ДЕЛО</span>
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[#61401e]">
                    <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
                    {taskScheduleLabel(primaryTask)}
                  </span>
                </div>
                <div className="flex items-center gap-3 p-3 sm:p-4">
                  <TaskIcon task={primaryTask} size="large" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="rounded-md bg-[#e8d4ad] px-1.5 py-0.5 text-[10px] font-bold text-[#6b5137]">
                        {taskAudienceLabel(primaryTask, activeUser)}
                      </span>
                      {primaryTask.is_required && (
                        <span className="rounded-md bg-[#d97a5f] px-1.5 py-0.5 text-[10px] font-bold text-[#fff8e8]">
                          важно
                        </span>
                      )}
                    </div>
                    <h3 className="mt-1 text-[15px] font-black leading-5">{primaryTask.title}</h3>
                    {primaryTask.description && <p className="mt-0.5 line-clamp-2 text-xs leading-4 text-[#6b5137]">{primaryTask.description}</p>}
                    <span className="mt-2 inline-flex items-center gap-1 text-xs font-black text-[#855529]">
                      <Coins className="h-3.5 w-3.5" aria-hidden="true" />
                      +{primaryTask.points} жетонов
                    </span>
                  </div>
                  <CompletionStamp task={primaryTask} onComplete={completeTask} pending={pendingActions.has(primaryTask.id)} />
                </div>
              </section>
            ) : (
              <section className="rounded-[20px] border-2 border-[#2f241c] bg-[#fff7e5] p-5 text-center shadow-[3px_3px_0_#b9834d]">
                <CircleCheck className="mx-auto h-10 w-10 text-[#5b8d68]" aria-hidden="true" />
                <h3 className="mt-2 text-base font-black">На сегодня всё готово</h3>
                <p className="mt-1 text-xs text-[#6b5137]">Дом стал чуточку уютнее благодаря тебе.</p>
              </section>
            )}

            <section className="rounded-[20px] border-2 border-[#2f241c] bg-[#fff7e5] p-3 shadow-[3px_3px_0_#b9834d]">
              <div className="flex items-center justify-between gap-2 px-1 pb-3">
                <div className="flex items-center gap-2">
                  <ListChecks className="h-4 w-4 text-[#5b8d68]" aria-hidden="true" />
                  <h3 className="text-sm font-black">{isParent ? 'План дел семьи' : 'Ещё сегодня'}</h3>
                </div>
                <span className="text-[11px] font-bold text-[#6b5137]">
                  {isParent ? taskState.available.length : isTodayLoading ? '…' : taskState.pending.length} шт.
                </span>
              </div>

              {!isParent && (
                <div className="mb-3 flex gap-1 overflow-x-auto pb-1" aria-label="Фильтр дел">
                  <FilterButton active={filter === 'all'} onClick={() => chooseFilter('all')}>Все</FilterButton>
                  <FilterButton active={filter === 'required'} onClick={() => chooseFilter('required')}>Важные</FilterButton>
                  <FilterButton active={filter === 'family'} onClick={() => chooseFilter('family')}>Вместе</FilterButton>
                </div>
              )}

              {!isParent && isTodayLoading ? (
                <div className="rounded-[14px] border border-dashed border-[#b9834d] bg-[#f8ecd1] p-4 text-center text-xs font-semibold text-[#6b5137]" aria-live="polite">
                  Загружаем твои задачи на сегодня.
                </div>
              ) : !isParent && todayError ? (
                <div className="rounded-[14px] border border-dashed border-[#b9834d] bg-[#f8ecd1] p-4 text-center text-xs font-semibold text-[#6b5137]">
                  Список появится после обновления.
                </div>
              ) : visibleTasks.length ? (
                <ul className="space-y-2" aria-live="polite">
                  {visibleTasks.map((task) => (
                    <li key={task.id}>
                      <TaskRow
                        task={task}
                        activeUser={activeUser}
                        canComplete={isChild}
                        onComplete={completeTask}
                        pending={pendingActions.has(task.id)}
                      />
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="rounded-[14px] border border-dashed border-[#b9834d] bg-[#f8ecd1] p-4 text-center text-xs font-semibold text-[#6b5137]">
                  В этой категории больше нет открытых дел.
                </div>
              )}

              {isChild && taskState.done.length > 0 && (
                <details className="mt-3 rounded-[14px] border border-[#b9834d] bg-[#f8ecd1]">
                  <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-3 text-xs font-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#42614f]">
                    <span className="inline-flex items-center gap-1.5">
                      <CircleCheck className="h-4 w-4 text-[#5b8d68]" aria-hidden="true" />
                      Сделано сегодня · {taskState.done.length}
                    </span>
                    <ChevronRight className="h-4 w-4 transition-transform [[open]_&]:rotate-90" aria-hidden="true" />
                  </summary>
                  <ul className="space-y-1 border-t border-[#b9834d]/60 px-2 py-2">
                    {taskState.done.slice(0, 5).map((task) => (
                      <li key={task.id} className="flex min-h-10 items-center justify-between gap-2 rounded-lg px-2 text-xs text-[#6b5137]">
                        <span className="min-w-0 truncate line-through decoration-[#5b8d68]">{task.title}</span>
                        <button
                          type="button"
                          disabled={pendingActions.has(task.id)}
                          onClick={() => undoTask(task)}
                          className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-md px-2 py-1.5 font-bold text-[#42614f] underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#42614f] disabled:pointer-events-none disabled:opacity-55"
                          aria-busy={pendingActions.has(task.id) || undefined}
                        >
                          Отменить
                        </button>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </section>
          </div>

          <aside className="rounded-[20px] border-2 border-[#2f241c] bg-[#42614f] p-4 text-[#fff8e8] shadow-[3px_3px_0_#2f241c]">
            <p className="font-pixel-sub text-[10px] tracking-[0.12em] text-[#f3cf82]">{isParent ? 'ПЛАН СЕМЬИ' : 'ТВОЙ ВКЛАД'}</p>
            <h3 className="mt-1 text-base font-black">{isParent ? 'Общие дела на сегодня' : 'Дом становится уютнее'}</h3>
            <p className="mt-1 text-xs leading-5 text-[#e8dbc0]">
              {isParent
                ? 'Здесь виден только план: у каждого ребёнка свои точные отметки в личном журнале.'
                : 'Каждое завершённое дело улучшает общий день. Без штрафов за пропуск.'}
            </p>
            <div className="mt-4 rounded-[16px] border border-[#f3cf82]/65 bg-[#284435] p-3">
              <div className="flex items-center justify-between gap-2 text-[11px] font-bold">
                <span>{isParent ? 'Общих дел' : 'Твой прогресс'}</span>
                <span>{isParent ? plannedFamilyTasks : isTodayLoading ? '…' : dayProgress + '%'}</span>
              </div>
              {!isParent && (
                <div className="mt-2 h-3 overflow-hidden rounded-full border border-[#f3cf82]/60 bg-[#1c3326]">
                  <div className="h-full rounded-full bg-[#f3cf82]" style={{ width: String(isTodayLoading ? 0 : dayProgress) + '%' }} />
                </div>
              )}
              <p className="mt-2 text-[11px] text-[#e8dbc0]">
                {isParent
                  ? plannedFamilyTasks + ' общих дел запланировано'
                  : isTodayLoading
                    ? 'Сверяем отметки с сегодняшним планом'
                    : todayError
                      ? 'Нужна новая попытка загрузки'
                      : completedToday + ' из ' + (todayData?.summary.total ?? 0) + ' дел отмечено'}
              </p>
            </div>
            {isParent && (
              <button
                type="button"
                onClick={onOpenFamilySettings}
                className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-[14px] border border-[#f3cf82]/70 bg-[#335541] px-3 text-xs font-black text-[#fff8e8] transition-colors hover:bg-[#3f654e] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f3cf82] focus-visible:ring-offset-2 focus-visible:ring-offset-[#42614f]"
              >
                <Users className="h-4 w-4" aria-hidden="true" />
                Открыть семью
              </button>
            )}
          </aside>
        </div>
      </div>
    </section>
  );
}

function FilterButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cx(
        'min-h-11 min-w-11 shrink-0 rounded-xl border-2 px-3 text-xs font-black transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2f241c] focus-visible:ring-offset-1',
        active
          ? 'border-[#2f241c] bg-[#42614f] text-[#fff8e8]'
          : 'border-[#c59661] bg-[#f8ecd1] text-[#6b5137] hover:bg-[#ead4ab]',
      )}
    >
      {children}
    </button>
  );
}

function TaskIcon({ task, size = 'default' }: { task: JournalTask; size?: 'default' | 'large' }): React.ReactElement {
  const meta = getCategoryMeta(task);
  const Icon = meta.icon;
  const dimensions = size === 'large' ? 'h-12 w-12 rounded-[15px]' : 'h-11 w-11 rounded-[13px]';

  return (
    <span className={cx('grid shrink-0 place-items-center border-2 border-[#2f241c]/25', dimensions, meta.tileClass)}>
      <Icon className={size === 'large' ? 'h-6 w-6 stroke-[2.2]' : 'h-5 w-5 stroke-[2.2]'} aria-hidden="true" />
    </span>
  );
}

function TaskRow({
  task,
  activeUser,
  canComplete,
  onComplete,
  pending,
}: {
  task: JournalTask;
  activeUser: User;
  canComplete: boolean;
  onComplete: (task: JournalTask) => void;
  pending: boolean;
}): React.ReactElement {
  const meta = getCategoryMeta(task);

  return (
    <article className="flex min-h-[70px] items-center gap-2 rounded-[16px] border-2 border-[#b9834d] bg-[#fffaf0] p-2.5">
      <TaskIcon task={task} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1">
          <span className="text-[10px] font-bold text-[#6b5137]">{meta.label}</span>
          <span className="text-[10px] text-[#96734f]">·</span>
          <span className="text-[10px] font-bold text-[#6b5137]">{taskAudienceLabel(task, activeUser)}</span>
        </div>
        <p className="mt-0.5 line-clamp-2 text-[13px] font-black leading-4">{task.title}</p>
        <span className="mt-1 inline-flex items-center gap-1 text-[10px] font-black text-[#855529]">
          <Coins className="h-3 w-3" aria-hidden="true" />
          +{task.points}
        </span>
      </div>
      {canComplete ? (
        <CompletionStamp task={task} onComplete={onComplete} pending={pending} />
      ) : (
        <span className="inline-flex min-h-10 shrink-0 items-center rounded-lg border border-[#b9834d] bg-[#f8ecd1] px-2 text-[10px] font-black text-[#6b5137]">
          в плане
        </span>
      )}
    </article>
  );
}
