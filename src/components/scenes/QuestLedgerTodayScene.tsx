import React, { useMemo, useState } from 'react';
import {
  ArrowRight,
  BookOpenCheck,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  Circle,
  ClipboardList,
  Flame,
  Lock,
  Plus,
  Sparkles,
  Users,
} from 'lucide-react';
import type { AppState, Completion, Task, User } from '../../types';
import HabiticaAnimatedAvatar from '../HabiticaAnimatedAvatar';
import { TASK_CATEGORY_ICONS } from '../../data/initialData';
import { getUnifiedLook } from '../../utils/unifiedLook';
import { habiticaPetSprite } from '../../utils/shopLookMap';
import { triggerHaptic } from '../../utils/haptics';

/**
 * «Лист поручений» — не копия Habitica, а домашняя гильдейская доска.
 *
 * Сцена намеренно получает только данные и callbacks: она не ходит в API и не
 * меняет appState сама. Это позволяет поставить её на dashboard, в отдельный
 * tab или использовать как главный экран Telegram Mini App без дублирования
 * бизнес-логики задач.
 */
type TodayLedgerState = Pick<
  AppState,
  'tasks' | 'completions' | 'users' | 'pets' | 'userPets' | 'family'
>;

export interface QuestLedgerTodaySceneProps {
  appState: TodayLedgerState;
  activeUser: User;
  /** Завершает дело на уровне App/API. Для ребёнка — единственное игровое действие. */
  onCompleteTask?: (taskId: number) => void | Promise<void>;
  /** Открывает полный журнал дел, если он живёт на отдельном экране. */
  onOpenTaskList?: () => void;
  /** Открывает создание дела. Показывается только в родительском режиме. */
  onOpenAddTask?: () => void;
  /** Упрощает Storybook/визуальные тесты; по умолчанию используется текущая дата. */
  date?: Date;
  className?: string;
}

type LedgerTaskKind = 'required' | 'choice' | 'quest';

interface LedgerTask {
  task: Task;
  done: boolean;
  kind: LedgerTaskKind;
}

const DAY_NAMES = [
  'Понедельник',
  'Вторник',
  'Среда',
  'Четверг',
  'Пятница',
  'Суббота',
  'Воскресенье',
];

const MONTH_NAMES = [
  'января',
  'февраля',
  'марта',
  'апреля',
  'мая',
  'июня',
  'июля',
  'августа',
  'сентября',
  'октября',
  'ноября',
  'декабря',
];

const CATEGORY_META: Record<string, { label: string; accent: string; soft: string }> = {
  clean: { label: 'Порядок', accent: 'bg-sky-400', soft: 'bg-sky-400/10 text-sky-200 border-sky-300/25' },
  kitchen: { label: 'Кухня', accent: 'bg-orange-400', soft: 'bg-orange-400/10 text-orange-200 border-orange-300/25' },
  laundry: { label: 'Стирка', accent: 'bg-violet-400', soft: 'bg-violet-400/10 text-violet-200 border-violet-300/25' },
  trash: { label: 'Двор', accent: 'bg-lime-400', soft: 'bg-lime-400/10 text-lime-200 border-lime-300/25' },
  bedroom: { label: 'Комната', accent: 'bg-indigo-400', soft: 'bg-indigo-400/10 text-indigo-200 border-indigo-300/25' },
  hygiene: { label: 'Забота о себе', accent: 'bg-cyan-400', soft: 'bg-cyan-400/10 text-cyan-200 border-cyan-300/25' },
  study: { label: 'Учёба', accent: 'bg-yellow-400', soft: 'bg-yellow-400/10 text-yellow-100 border-yellow-300/25' },
  pet: { label: 'Питомец', accent: 'bg-rose-400', soft: 'bg-rose-400/10 text-rose-200 border-rose-300/25' },
  hobby: { label: 'Навык', accent: 'bg-fuchsia-400', soft: 'bg-fuchsia-400/10 text-fuchsia-200 border-fuchsia-300/25' },
  health: { label: 'Сила', accent: 'bg-emerald-400', soft: 'bg-emerald-400/10 text-emerald-200 border-emerald-300/25' },
  family: { label: 'Семья', accent: 'bg-amber-400', soft: 'bg-amber-400/10 text-amber-100 border-amber-300/25' },
  parent: { label: 'Дом', accent: 'bg-stone-300', soft: 'bg-stone-200/10 text-stone-100 border-stone-300/25' },
};

const KIND_META: Record<LedgerTaskKind, { label: string; className: string }> = {
  required: { label: 'Важно сегодня', className: 'bg-rose-500/15 text-rose-100 border-rose-300/30' },
  choice: { label: 'На выбор', className: 'bg-sky-500/15 text-sky-100 border-sky-300/25' },
  quest: { label: 'Семейный квест', className: 'bg-amber-400/15 text-amber-100 border-amber-300/30' },
};

function mondayFirstIndex(date: Date): number {
  return (date.getDay() + 6) % 7;
}

function localDayKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function isScheduledToday(task: Task, date: Date): boolean {
  const weekday = mondayFirstIndex(date);
  const schedule = task.schedule_type;

  if (schedule === 'daily' || schedule === 'flexible') return true;
  if (schedule === 'weekdays') return weekday < 5;
  if (schedule === 'weekend') return weekday >= 5;
  if (schedule === 'weekly') {
    const days = task.day_of_week;
    return Array.isArray(days) ? days.includes(weekday) : days === weekday;
  }
  if (schedule === 'once') return !task.done;

  // Legacy tasks do not always have schedule_type. Their day_of_week is
  // documented in Monday-first format, unlike Date#getDay().
  if (task.task_type === 'weekly') {
    const days = task.day_of_week;
    return Array.isArray(days) ? days.includes(weekday) : days === weekday;
  }
  return true;
}

function isAssignedToChild(task: Task, user: User): boolean {
  if (task.assignee_type === 'parent') return false;
  if (task.assignee_type === 'any' || task.assignee_type === 'both') return true;

  if (task.assignee_type === 'individual') {
    const assignees = task.assignee_list ?? [];
    if (assignees.length > 0) {
      return assignees.includes(String(user.id)) || assignees.includes(user.display_name);
    }
  }

  // Legacy fallback. It matters for old imported families that have no
  // assignee_type yet, and makes the scene work with their real state too.
  return task.assignee === 'both' || task.assignee === user.assignee;
}

function completedOnDate(
  task: Task,
  completions: Completion[],
  dateKey: string,
  userId?: number,
): boolean {
  if (task.done) return true;
  return completions.some((completion) => {
    if (completion.task_id !== task.id) return false;
    if (userId != null && completion.user_id !== userId) return false;
    return completion.completed_at === dateKey || completion.completed_at_ts?.startsWith(dateKey);
  });
}

function taskKind(task: Task): LedgerTaskKind {
  if (task.task_type === 'quest') return 'quest';
  return task.is_required ? 'required' : 'choice';
}

function taskWeight({ task, done, kind }: LedgerTask): number {
  if (done) return 100;
  if (kind === 'required') return 0;
  if (kind === 'quest') return 1;
  // More valuable choices deserve the first visible position, but never leap
  // over an important task or quest.
  return 10 - Math.min(9, task.points || 0);
}

function statusCopy(kind: LedgerTaskKind, done: boolean): string {
  if (done) return 'Отмечено';
  if (kind === 'required') return 'Нужно сегодня';
  if (kind === 'quest') return 'Общее дело';
  return 'Можно сделать';
}

const CategorySeal: React.FC<{ task: Task; compact?: boolean }> = ({ task, compact = false }) => {
  const category = CATEGORY_META[task.category ?? ''] ?? CATEGORY_META.family;
  const asset = TASK_CATEGORY_ICONS[task.category ?? ''];
  const size = compact ? 'w-9 h-9' : 'w-12 h-12';

  return (
    <span
      className={`relative ${size} shrink-0 grid place-items-center overflow-hidden rounded-[10px] border border-[#d6b56d]/40 bg-[#302418] shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]`}
      aria-hidden="true"
    >
      <ClipboardList className={`${compact ? 'w-4 h-4' : 'w-5 h-5'} text-[#d6b56d]/75`} />
      {asset && (
        <img
          src={asset}
          alt=""
          draggable={false}
          className="absolute inset-0 h-full w-full object-contain p-1.5 [image-rendering:pixelated]"
          onError={(event) => { (event.currentTarget as HTMLImageElement).style.display = 'none'; }}
        />
      )}
      <span className={`absolute inset-x-1 bottom-1 h-0.5 ${category.accent} opacity-80`} />
    </span>
  );
};

interface TaskSlipProps {
  entry: LedgerTask;
  isParent: boolean;
  isPrimary?: boolean;
  isCompleting?: boolean;
  canComplete: boolean;
  onComplete: (task: Task) => void;
}

const TaskSlip: React.FC<TaskSlipProps> = ({
  entry,
  isParent,
  isPrimary = false,
  isCompleting = false,
  canComplete,
  onComplete,
}) => {
  const { task, done, kind } = entry;
  const category = CATEGORY_META[task.category ?? ''] ?? CATEGORY_META.family;
  const kindMeta = KIND_META[kind];
  const points = Math.max(1, task.points || 0);

  return (
    <li
      className={`relative overflow-hidden border border-[#6d5231] bg-[#211a13] shadow-[0_2px_0_rgba(0,0,0,0.32)] ${
        isPrimary ? 'rounded-[14px]' : 'rounded-[12px]'
      } ${done ? 'opacity-70' : ''}`}
    >
      <span className={`absolute inset-y-0 left-0 w-1 ${done ? 'bg-emerald-400' : category.accent}`} aria-hidden="true" />
      <div className={`${isPrimary ? 'p-3.5' : 'p-3'} pl-4`}>
        <div className="flex items-start gap-2.5">
          <CategorySeal task={task} compact={!isPrimary} />

          <div className="min-w-0 flex-1 pt-0.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className={`rounded border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.08em] ${kindMeta.className}`}>
                {kindMeta.label}
              </span>
              <span className={`rounded border px-1.5 py-0.5 text-[9px] font-semibold ${category.soft}`}>
                {category.label}
              </span>
            </div>
            <p className={`mt-1.5 break-words font-pixel-sub font-bold leading-snug text-[#fff3d2] ${isPrimary ? 'text-sm' : 'text-[13px]'}`}>
              {task.title}
            </p>
            {task.description && isPrimary && (
              <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-[#c7b89d]">{task.description}</p>
            )}
            <div className="mt-2 flex items-center gap-2 text-[11px]">
              <span className="inline-flex items-center gap-1 font-pixel-sub text-amber-200">
                <img
                  src="/assets/game/backgrounds/Previews/coin.png"
                  alt=""
                  aria-hidden="true"
                  className="h-3.5 w-3.5 [image-rendering:pixelated]"
                />
                +{points}
              </span>
              <span className={`h-1 w-1 rounded-full ${done ? 'bg-emerald-300' : 'bg-[#a68a63]'}`} aria-hidden="true" />
              <span className={done ? 'text-emerald-200' : 'text-[#b9aa91]'}>{statusCopy(kind, done)}</span>
            </div>
          </div>

          {isParent ? (
            <span
              className={`mt-1 inline-flex shrink-0 items-center gap-1 rounded border px-2 py-1 text-[10px] font-bold ${
                done
                  ? 'border-emerald-300/30 bg-emerald-400/10 text-emerald-100'
                  : 'border-[#a98a5d]/35 bg-[#45331f] text-[#ead6aa]'
              }`}
            >
              {done ? <Check className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
              {done ? 'Готово' : 'В плане'}
            </span>
          ) : done ? (
            <span className="mt-0.5 grid h-11 w-11 shrink-0 place-items-center rounded-[10px] border border-emerald-300/30 bg-emerald-400/10 text-emerald-200" aria-label="Дело выполнено">
              <CheckCircle2 className="h-5 w-5" />
            </span>
          ) : (
            <button
              type="button"
              onClick={() => onComplete(task)}
              disabled={!canComplete || isCompleting}
              aria-label={`Отметить выполненным: ${task.title}`}
              className="mt-0.5 grid min-h-11 min-w-11 shrink-0 place-items-center rounded-[10px] border-2 border-[#d9b65d] bg-[#295c47] text-[#fff8df] shadow-[0_3px_0_#112f25,inset_0_1px_0_rgba(255,255,255,0.23)] transition-[transform,background-color,box-shadow] active:translate-y-[2px] active:shadow-[0_1px_0_#112f25] disabled:cursor-not-allowed disabled:opacity-45"
            >
              {isCompleting ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" /> : <Check className="h-5 w-5" />}
            </button>
          )}
        </div>
      </div>
    </li>
  );
};

/**
 * Mobile-first экран «Сегодня». Визуальный язык — карманный журнал поручений:
 * бумажные полосы, печати категорий и физическая зелёная кнопка вместо
 * абстрактных стеклянных карточек. Это даёт ясность Habitica, но не копирует её.
 */
export const QuestLedgerTodayScene: React.FC<QuestLedgerTodaySceneProps> = ({
  appState,
  activeUser,
  onCompleteTask,
  onOpenTaskList,
  onOpenAddTask,
  date,
  className = '',
}) => {
  const [showCompleted, setShowCompleted] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [completingTaskId, setCompletingTaskId] = useState<number | null>(null);
  const today = useMemo(() => (date ? new Date(date) : new Date()), [date]);
  const dateKey = useMemo(() => localDayKey(today), [today]);
  const isParent = activeUser.family_role === 'parent' || activeUser.is_admin === true;

  const childTasks = useMemo<LedgerTask[]>(() => {
    if (isParent) return [];
    return appState.tasks
      .filter((task) => isScheduledToday(task, today) && isAssignedToChild(task, activeUser))
      .map((task) => ({
        task,
        done: completedOnDate(task, appState.completions, dateKey, activeUser.id),
        kind: taskKind(task),
      }))
      .sort((a, b) => taskWeight(a) - taskWeight(b));
  }, [activeUser, appState.completions, appState.tasks, dateKey, isParent, today]);

  const familyTasks = useMemo<LedgerTask[]>(() => {
    if (!isParent) return [];
    return appState.tasks
      .filter((task) => isScheduledToday(task, today))
      .map((task) => ({
        task,
        // Parent state is queried as the parent and task.done can therefore be
        // false even when a child has finished it. For the board, any family
        // completion today is the relevant truth.
        done: completedOnDate(task, appState.completions, dateKey),
        kind: taskKind(task),
      }))
      .sort((a, b) => taskWeight(a) - taskWeight(b));
  }, [appState.completions, appState.tasks, dateKey, isParent, today]);

  const ledgerTasks = isParent ? familyTasks : childTasks;
  const doneCount = ledgerTasks.filter((entry) => entry.done).length;
  const requiredTasks = ledgerTasks.filter((entry) => entry.kind === 'required');
  const requiredDone = requiredTasks.filter((entry) => entry.done).length;
  const progress = ledgerTasks.length > 0 ? Math.round((doneCount / ledgerTasks.length) * 100) : 0;
  const nextTask = childTasks.find((entry) => !entry.done);
  const unfinished = ledgerTasks.filter((entry) => !entry.done);
  const listSource = showCompleted ? ledgerTasks : unfinished;
  const visibleTasks = showAll ? listSource : listSource.slice(0, 3);
  const hiddenTaskCount = Math.max(0, listSource.length - visibleTasks.length);
  const weekday = mondayFirstIndex(today);
  const dateLabel = `${DAY_NAMES[weekday]}, ${today.getDate()} ${MONTH_NAMES[today.getMonth()]}`;
  const level = Math.max(1, Math.floor((activeUser.xp || 0) / 100) + 1);
  const xpInLevel = Math.max(0, (activeUser.xp || 0) % 100);
  const playLook = useMemo(() => getUnifiedLook(activeUser), [activeUser]);

  const petUrl = useMemo(() => {
    const record = appState.userPets.find((pet) => pet.user_id === activeUser.id && pet.is_active)
      ?? appState.userPets.find((pet) => pet.user_id === activeUser.id);
    const pet = record ? appState.pets.find((candidate) => candidate.id === record.pet_id) : undefined;
    return pet ? habiticaPetSprite(pet.code) : undefined;
  }, [activeUser.id, appState.pets, appState.userPets]);

  const completeTask = (task: Task) => {
    if (isParent || !onCompleteTask || completingTaskId != null) return;
    triggerHaptic('impact', 'medium');
    setCompletingTaskId(task.id);
    Promise.resolve(onCompleteTask(task.id)).finally(() => setCompletingTaskId(null));
  };

  const openTaskList = () => {
    triggerHaptic('selection', 'light');
    if (onOpenTaskList) {
      onOpenTaskList();
      return;
    }
    setShowAll((value) => !value);
  };

  const toggleCompleted = () => {
    triggerHaptic('selection', 'light');
    setShowCompleted((value) => !value);
    setShowAll(false);
  };

  const createTask = () => {
    if (!onOpenAddTask) return;
    triggerHaptic('impact', 'light');
    onOpenAddTask();
  };

  return (
    <section
      aria-labelledby="quest-ledger-heading"
      className={`relative mx-auto w-full max-w-[640px] overflow-hidden rounded-[22px] border-[3px] border-[#654929] bg-[#15110d] text-[#fff4d8] shadow-[0_12px_0_rgba(54,35,18,0.72),0_22px_42px_rgba(0,0,0,0.5)] ${className}`}
    >
      {/* Внутренняя древесная текстура создана CSS, чтобы сцена не зависела от
          декоративного raster-ассета и не конкурировала с игровой графикой. */}
      <div
        className="pointer-events-none absolute inset-0 opacity-80"
        aria-hidden="true"
        style={{
          backgroundImage: 'repeating-linear-gradient(0deg, rgba(255,226,166,0.025) 0 1px, transparent 1px 7px), linear-gradient(120deg, rgba(231,183,85,0.07), transparent 42%, rgba(57,28,12,0.2))',
        }}
      />
      <span className="pointer-events-none absolute left-3 top-0 h-2 w-16 rounded-b bg-[#c49342] shadow-[0_2px_0_#70471c]" aria-hidden="true" />
      <span className="pointer-events-none absolute right-5 top-0 h-2 w-9 rounded-b bg-[#916630] shadow-[0_2px_0_#4c2e13]" aria-hidden="true" />

      <div className="relative p-3 sm:p-4">
        <header className="flex items-start justify-between gap-3 border-b border-[#86633c]/45 pb-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[#e4c47c]">
              <BookOpenCheck className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="font-pixel-sub text-[10px] font-bold uppercase tracking-[0.13em]">Семейный журнал</span>
            </div>
            <h2 id="quest-ledger-heading" className="mt-1 font-pixel-sub text-base font-bold tracking-tight text-[#fff4d8]">
              {isParent ? 'Доска дома' : 'Мой лист поручений'}
            </h2>
          </div>
          <div className="shrink-0 rounded-[9px] border border-[#a9834d]/50 bg-[#2b2015] px-2 py-1.5 text-right shadow-[inset_0_1px_0_rgba(255,255,255,0.09)]">
            <div className="flex items-center justify-end gap-1 text-[10px] font-semibold text-[#f0d79b]">
              <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
              Сегодня
            </div>
            <p className="mt-0.5 text-[10px] text-[#cdbb98]">{dateLabel}</p>
          </div>
        </header>

        {isParent ? (
          <section className="mt-3 overflow-hidden rounded-[14px] border-2 border-[#8b6840] bg-[#241b13] shadow-[inset_0_1px_0_rgba(255,255,255,0.09)]" aria-labelledby="home-board-heading">
            <div className="border-b border-[#82613c] bg-[#302315] px-3 py-2.5">
              <div className="flex items-center gap-2">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[10px] border border-[#d4b46e]/45 bg-[#4d3920] text-[#f7d98d]">
                  <Users className="h-5 w-5" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <h3 id="home-board-heading" className="font-pixel-sub text-[13px] font-bold text-[#fff1ce]">
                    {appState.family?.name || 'Домашний план'}
                  </h3>
                  <p className="mt-0.5 text-xs text-[#c4b391]">
                    {doneCount} из {ledgerTasks.length} карточек отмечено сегодня
                  </p>
                </div>
                <span className="rounded border border-[#b99858]/35 bg-[#21170f] px-2 py-1 text-[10px] font-pixel-sub text-[#e7cb88]">
                  {appState.users.length} в семье
                </span>
              </div>
            </div>

            <div className="p-3">
              <div className="flex items-center justify-between gap-3 text-xs">
                <span className="font-pixel-sub text-[#d4c19a]">Ход дня</span>
                <span className="font-pixel-sub text-[#f5dc9d]">{progress}%</span>
              </div>
              <div className="mt-1.5 h-3 overflow-hidden rounded-[4px] border border-[#0d0b08] bg-[#100d09] p-[2px]" role="progressbar" aria-label="Выполнение семейного плана" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}>
                <div className="h-full rounded-[2px] bg-gradient-to-r from-[#6a9e51] via-[#a5bd58] to-[#e1c468] transition-[width] duration-500" style={{ width: `${Math.max(progress, ledgerTasks.length ? 4 : 0)}%` }} />
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-[#bbaa88]">
                {unfinished.length > 0
                  ? `В ожидании ${unfinished.length} ${unfinished.length === 1 ? 'дело' : unfinished.length < 5 ? 'дела' : 'дел'}. Родительский режим только организует план — игровые отметки остаются у детей.`
                  : 'План на сегодня закрыт. Можно подготовить следующие поручения.'}
              </p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={openTaskList}
                  className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-[10px] border border-[#97744a] bg-[#382919] px-2 text-xs font-semibold text-[#f7e5bb] shadow-[0_2px_0_#171009] transition-transform active:translate-y-px"
                >
                  <ClipboardList className="h-4 w-4" aria-hidden="true" />
                  Открыть план
                </button>
                {onOpenAddTask && (
                  <button
                    type="button"
                    onClick={createTask}
                    className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-[10px] border-2 border-[#d8b666] bg-[#5b4730] px-2 text-xs font-bold text-[#fff5da] shadow-[0_3px_0_#2a1c10,inset_0_1px_0_rgba(255,255,255,0.15)] transition-transform active:translate-y-[2px] active:shadow-[0_1px_0_#2a1c10]"
                  >
                    <Plus className="h-4 w-4" aria-hidden="true" />
                    Новое дело
                  </button>
                )}
              </div>
            </div>
          </section>
        ) : (
          <section className="relative mt-3 overflow-hidden rounded-[14px] border-2 border-[#8a673d] bg-[#241a12] shadow-[inset_0_1px_0_rgba(255,255,255,0.09)]" aria-labelledby="hero-card-heading">
            <div className="pointer-events-none absolute inset-y-0 right-0 w-[42%] bg-gradient-to-l from-[#583b1e]/65 to-transparent" aria-hidden="true" />
            <div className="relative grid min-h-[135px] grid-cols-[minmax(0,1fr)_105px] gap-1 p-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="rounded border border-[#d9bc74]/40 bg-[#3a2918] px-1.5 py-0.5 font-pixel-sub text-[9px] font-bold uppercase tracking-[0.08em] text-[#ebd49a]">
                    Герой дня
                  </span>
                  <span className="rounded border border-amber-300/20 bg-amber-300/10 px-1.5 py-0.5 text-[10px] font-semibold text-amber-100">
                    Ур. {level}
                  </span>
                </div>
                <h3 id="hero-card-heading" className="mt-2 truncate font-pixel-sub text-[15px] font-bold text-[#fff4d8]">
                  {activeUser.display_name}
                </h3>
                <div className="mt-2.5 max-w-[180px]">
                  <div className="flex items-center justify-between text-[10px] font-pixel-sub">
                    <span className="text-[#c7b58e]">Опыт до ур. {level + 1}</span>
                    <span className="text-[#f3d98b]">{xpInLevel}/100</span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-[3px] border border-[#120e09] bg-[#110e0a] p-px">
                    <div className="h-full rounded-[2px] bg-gradient-to-r from-[#6e7fc9] to-[#b7c46e]" style={{ width: `${Math.max(3, xpInLevel)}%` }} />
                  </div>
                </div>
                <div className="mt-2 flex items-center gap-3 text-[11px]">
                  <span className="inline-flex items-center gap-1 text-[#e6cf91]">
                    <Flame className="h-3.5 w-3.5 text-orange-300" aria-hidden="true" />
                    серия {activeUser.current_streak || 0}
                  </span>
                  <span className="text-[#c2b08d]">{doneCount}/{ledgerTasks.length} дел</span>
                </div>
              </div>
              <div className="relative flex items-end justify-center overflow-visible pb-1" aria-hidden="true">
                <HabiticaAnimatedAvatar
                  look={playLook}
                  cls={activeUser.class || 'warrior'}
                  gender={activeUser.gender}
                  state="idle"
                  size={94}
                  petUrl={petUrl}
                />
              </div>
            </div>
            <div className="relative border-t border-[#80603d] px-3 py-2">
              <div className="flex items-center justify-between gap-2 text-[11px]">
                <span className="font-pixel-sub text-[#d5c197]">Обязательные</span>
                <span className="font-pixel-sub text-[#f0d993]">{requiredDone}/{requiredTasks.length || 0}</span>
              </div>
              <div className="mt-1.5 h-2.5 overflow-hidden rounded-[3px] border border-[#120e09] bg-[#110e0a] p-px" role="progressbar" aria-label="Выполнение обязательных дел" aria-valuemin={0} aria-valuemax={Math.max(1, requiredTasks.length)} aria-valuenow={requiredDone}>
                <div className="h-full rounded-[2px] bg-gradient-to-r from-[#d6715f] to-[#e3bc65] transition-[width] duration-500" style={{ width: `${requiredTasks.length > 0 ? Math.max(4, Math.round((requiredDone / requiredTasks.length) * 100)) : 0}%` }} />
              </div>
            </div>
          </section>
        )}

        {!isParent && nextTask && (
          <section className="mt-3" aria-labelledby="next-task-heading">
            <div className="mb-1.5 flex items-center justify-between px-1">
              <h3 id="next-task-heading" className="font-pixel-sub text-[11px] font-bold uppercase tracking-[0.1em] text-[#f3d78e]">
                Следующий ход
              </h3>
              <span className="text-[11px] text-[#b9a989]">Одно дело за раз</span>
            </div>
            <TaskSlip
              entry={nextTask}
              isParent={false}
              isPrimary
              isCompleting={completingTaskId === nextTask.task.id}
              canComplete={Boolean(onCompleteTask)}
              onComplete={completeTask}
            />
            <button
              type="button"
              onClick={() => completeTask(nextTask.task)}
              disabled={!onCompleteTask || completingTaskId != null}
              className="mt-2 inline-flex min-h-[52px] w-full items-center justify-center gap-2 rounded-[11px] border-2 border-[#e0bd68] bg-[#317057] px-4 font-pixel-sub text-[13px] font-bold text-[#fff8df] shadow-[0_4px_0_#163d30,inset_0_1px_0_rgba(255,255,255,0.22)] transition-[transform,background-color,box-shadow] active:translate-y-[3px] active:shadow-[0_1px_0_#163d30] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {completingTaskId === nextTask.task.id ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
              ) : (
                <Check className="h-5 w-5" aria-hidden="true" />
              )}
              Отметить выполненным
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </section>
        )}

        {!isParent && !nextTask && ledgerTasks.length > 0 && (
          <section className="mt-3 rounded-[14px] border-2 border-emerald-300/35 bg-emerald-400/10 p-4 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]" aria-live="polite">
            <CheckCircle2 className="mx-auto h-7 w-7 text-emerald-200" aria-hidden="true" />
            <h3 className="mt-2 font-pixel-sub text-sm font-bold text-emerald-50">Лист на сегодня закрыт</h3>
            <p className="mt-1 text-xs leading-relaxed text-emerald-100/80">Все выбранные дела отмечены. Загляни в журнал, если хочешь проверить результат.</p>
            <button type="button" onClick={openTaskList} className="mt-3 inline-flex min-h-11 items-center gap-1.5 rounded-[10px] border border-emerald-200/35 bg-emerald-950/35 px-3 text-xs font-semibold text-emerald-50">
              Открыть журнал
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </section>
        )}

        <section className="mt-4" aria-labelledby="ledger-list-heading">
          <div className="flex items-center justify-between gap-2 px-1">
            <div className="min-w-0">
              <h3 id="ledger-list-heading" className="font-pixel-sub text-[13px] font-bold text-[#fff0ca]">
                {isParent ? 'Карточки на сегодня' : 'Остальные поручения'}
              </h3>
              <p className="mt-0.5 text-[11px] text-[#aa997d]">
                {isParent ? 'Статус семьи без игровых действий' : 'Отмечай, когда дело действительно сделано'}
              </p>
            </div>
            {doneCount > 0 && (
              <button
                type="button"
                onClick={toggleCompleted}
                aria-pressed={showCompleted}
                className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-[9px] border border-[#876540] bg-[#2c2015] px-2 text-[10px] font-semibold text-[#e7d0a0]"
              >
                {showCompleted ? 'Скрыть готовые' : `Готовые ${doneCount}`}
                <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showCompleted ? 'rotate-180' : ''}`} aria-hidden="true" />
              </button>
            )}
          </div>

          {visibleTasks.length > 0 ? (
            <ul className="mt-2.5 space-y-2" aria-label="Список дел">
              {visibleTasks.map((entry) => (
                <TaskSlip
                  key={entry.task.id}
                  entry={entry}
                  isParent={isParent}
                  isCompleting={completingTaskId === entry.task.id}
                  canComplete={Boolean(onCompleteTask)}
                  onComplete={completeTask}
                />
              ))}
            </ul>
          ) : (
            <div className="mt-2.5 rounded-[12px] border border-dashed border-[#876640] bg-[#1d1610] px-3 py-5 text-center">
              <Circle className="mx-auto h-5 w-5 text-[#987d57]" aria-hidden="true" />
              <p className="mt-2 font-pixel-sub text-xs text-[#ead6a7]">
                {showCompleted ? 'В журнале пока нет карточек' : 'Незавершённых дел не осталось'}
              </p>
              <p className="mt-1 text-[11px] text-[#a8987e]">
                {isParent ? 'Добавьте поручение, когда появится новая задача.' : 'Можно отдохнуть или проверить готовые карточки.'}
              </p>
            </div>
          )}

          {(hiddenTaskCount > 0 || (showAll && !onOpenTaskList && listSource.length > 3)) && (
            <button
              type="button"
              onClick={openTaskList}
              className="mt-2.5 inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-[10px] border border-[#795a37] bg-[#2a1e14] px-3 text-xs font-semibold text-[#e9d6aa] shadow-[0_2px_0_#100c08] transition-colors hover:bg-[#342518]"
            >
              {showAll && !onOpenTaskList ? 'Свернуть список' : `Показать ещё ${hiddenTaskCount || listSource.length - 3}`}
              <ArrowRight className={`h-4 w-4 ${showAll && !onOpenTaskList ? '-rotate-90' : 'rotate-90'}`} aria-hidden="true" />
            </button>
          )}
        </section>

        <footer className="mt-4 border-t border-[#765735]/45 pt-3 pb-[max(2px,env(safe-area-inset-bottom))] text-center text-[10px] leading-relaxed text-[#8f806a]">
          {isParent ? 'Управляйте ритмом дома: создавайте и распределяйте дела.' : 'Твой вклад виден семье. Маленькие дела складываются в большой порядок.'}
        </footer>
      </div>
    </section>
  );
};

