import React, { useMemo } from 'react';
import {
  BedDouble,
  ChevronRight,
  CircleCheck,
  ClipboardList,
  Home,
  Palette,
  Plus,
  Settings,
  Sparkles,
  Users,
  Utensils,
} from 'lucide-react';
import type { AppState, Completion, Task, TaskCategory, User } from '../../types';
import { triggerHaptic } from '../../utils/haptics';

/**
 * Кооперативный экран вместо арены: семья не «воюет» с наказанием, а постепенно
 * приводит в порядок живой дом. Комнаты строятся из фактических задач и отметок
 * текущего дня; компонент намеренно не делает запросов и не меняет state сам.
 */
export interface DomovoyHouseProjectSceneProps {
  appState: AppState;
  activeUser: User;
  onOpenAddTask: () => void;
  onOpenFamilySettings: () => void;
  onOpenFamilyOverview: () => void;
  onOpenShop: () => void;
}

type RoomKey = 'kitchen' | 'quiet' | 'common';

type RoomDefinition = {
  key: RoomKey;
  title: string;
  shortTitle: string;
  description: string;
  categories: TaskCategory[];
  icon: typeof Home;
  inkClass: string;
  paperClass: string;
  fillClass: string;
};

type ProjectTask = {
  task: Task;
  done: boolean;
};

type RoomProgress = RoomDefinition & {
  tasks: ProjectTask[];
  doneCount: number;
  progress: number;
};

const ROOMS: RoomDefinition[] = [
  {
    key: 'kitchen',
    title: 'Кухня и порядок',
    shortTitle: 'Кухня',
    description: 'еда, посуда и чистые поверхности',
    categories: ['kitchen', 'clean', 'trash'],
    icon: Utensils,
    inkClass: 'text-[#754327]',
    paperClass: 'bg-[#f4d9ac]',
    fillClass: 'bg-[#d88955]',
  },
  {
    key: 'quiet',
    title: 'Личная территория',
    shortTitle: 'Комнаты',
    description: 'сон, учёба и забота о себе',
    categories: ['bedroom', 'laundry', 'study', 'hygiene', 'health'],
    icon: BedDouble,
    inkClass: 'text-[#4e557b]',
    paperClass: 'bg-[#d8dcf0]',
    fillClass: 'bg-[#777fb0]',
  },
  {
    key: 'common',
    title: 'Общий уголок',
    shortTitle: 'Вместе',
    description: 'семья, питомцы и маленькие радости',
    categories: ['family', 'pet', 'hobby', 'parent'],
    icon: Sparkles,
    inkClass: 'text-[#3f684f]',
    paperClass: 'bg-[#d5e5bd]',
    fillClass: 'bg-[#6f9b63]',
  },
];

const WEEKDAY_NAMES = [
  'Понедельник',
  'Вторник',
  'Среда',
  'Четверг',
  'Пятница',
  'Суббота',
  'Воскресенье',
];

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

  if (task.schedule_type === 'daily' || task.schedule_type === 'flexible') return true;
  if (task.schedule_type === 'weekdays') return weekday < 5;
  if (task.schedule_type === 'weekend') return weekday >= 5;
  if (task.schedule_type === 'weekly') {
    return Array.isArray(task.day_of_week)
      ? task.day_of_week.includes(weekday)
      : task.day_of_week === weekday;
  }
  if (task.schedule_type === 'once') return !task.done;

  // Старые задачи не всегда содержат schedule_type; day_of_week в проекте
  // хранится в Monday-first формате.
  if (task.task_type === 'weekly') {
    return Array.isArray(task.day_of_week)
      ? task.day_of_week.includes(weekday)
      : task.day_of_week === weekday;
  }
  return true;
}

function belongsToFamily(task: Task, user: User): boolean {
  return !task.family_id || !user.family_id || task.family_id === user.family_id;
}

function isAssignedToChild(task: Task, user: User): boolean {
  if (task.assignee_type === 'parent' || task.category === 'parent') return false;
  if (task.assignee_type === 'any' || task.assignee_type === 'both') return true;

  if (task.assignee_type === 'individual' && task.assignee_list?.length) {
    return task.assignee_list.includes(String(user.id)) || task.assignee_list.includes(user.display_name);
  }

  return task.assignee === 'both' || task.assignee === user.assignee;
}

function completedToday(
  task: Task,
  completions: Completion[],
  dateKey: string,
  userId?: number,
): boolean {
  if (task.done) return true;

  return completions.some((completion) => {
    if (completion.task_id !== task.id) return false;
    if (userId != null && completion.user_id !== userId) return false;
    return completion.completed_at === dateKey || completion.completed_at_ts.startsWith(dateKey);
  });
}

function roomStatus(room: RoomProgress): string {
  if (room.tasks.length === 0) return 'Сегодня без дел';
  if (room.progress === 100) return 'Уже уютно';
  if (room.doneCount > 0) return 'Дом оживает';
  return 'Ждёт заботы';
}

function contributionCopy(done: number, total: number): string {
  if (total === 0) return 'Сегодня можно выбрать своё дело';
  if (done === total) return 'Твой вклад на сегодня готов';
  return `${done} из ${total} личных дел отмечено`;
}

function childCountCopy(count: number): string {
  if (count % 10 === 1 && count % 100 !== 11) return 'ребёнок';
  if (count % 10 >= 2 && count % 10 <= 4 && (count % 100 < 12 || count % 100 > 14)) return 'ребёнка';
  return 'детей';
}

function cx(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(' ');
}

/**
 * «Домовой проект» — компактная карта дома для второй вкладки Mini App.
 * Здесь нет HP, боссов, оружия или потери наград: прогресс — только видимый
 * результат выполненных дел семьи.
 */
export function DomovoyHouseProjectScene({
  appState,
  activeUser,
  onOpenAddTask,
  onOpenFamilySettings,
  onOpenFamilyOverview,
  onOpenShop,
}: DomovoyHouseProjectSceneProps): React.ReactElement {
  const isParent = activeUser.family_role === 'parent' || activeUser.is_admin === true;
  const today = useMemo(() => new Date(), []);
  const dateKey = useMemo(() => localDayKey(today), [today]);
  const weekday = WEEKDAY_NAMES[mondayFirstIndex(today)];

  const project = useMemo(() => {
    const scheduledFamilyTasks = appState.tasks.filter((task) =>
      belongsToFamily(task, activeUser) && isScheduledToday(task, today),
    );
    const personalTasks = isParent
      ? []
      : scheduledFamilyTasks.filter((task) => isAssignedToChild(task, activeUser));
    const completionUserId = isParent ? undefined : activeUser.id;
    const decoratedTasks = scheduledFamilyTasks.map<ProjectTask>((task) => ({
      task,
      done: completedToday(task, appState.completions, dateKey, completionUserId),
    }));

    const rooms = ROOMS.map<RoomProgress>((room) => {
      const tasks = decoratedTasks.filter(({ task }) => room.categories.includes(task.category ?? 'family'));
      const doneCount = tasks.filter((entry) => entry.done).length;
      return {
        ...room,
        tasks,
        doneCount,
        progress: tasks.length ? Math.round((doneCount / tasks.length) * 100) : 0,
      };
    });

    const personalDone = personalTasks.filter((task) =>
      completedToday(task, appState.completions, dateKey, activeUser.id),
    ).length;
    const nextRoom = [...rooms]
      .filter((room) => room.tasks.some((entry) => !entry.done))
      .sort((a, b) => a.progress - b.progress || b.tasks.length - a.tasks.length)[0] ?? null;

    return {
      rooms,
      total: decoratedTasks.length,
      done: decoratedTasks.filter((entry) => entry.done).length,
      personalTotal: personalTasks.length,
      personalDone,
      nextRoom,
    };
  }, [activeUser, appState.completions, appState.tasks, dateKey, isParent, today]);

  const familyProgress = project.total ? Math.round((project.done / project.total) * 100) : 0;
  const childCount = appState.users.filter((user) => user.family_role !== 'parent').length;

  const openChildShop = () => {
    triggerHaptic('selection', 'light');
    onOpenShop();
  };

  const openFamily = () => {
    triggerHaptic('selection', 'light');
    onOpenFamilySettings();
  };

  const openFamilyOverview = () => {
    triggerHaptic('selection', 'light');
    onOpenFamilyOverview();
  };

  const openAddTask = () => {
    triggerHaptic('impact', 'light');
    onOpenAddTask();
  };

  return (
    <section
      className="relative isolate overflow-hidden rounded-[28px] border-[3px] border-[#30251d] bg-[#f6e7c8] text-[#30251d] shadow-[0_9px_0_#30251d] sm:rounded-[32px]"
      aria-label={isParent ? 'Проект дома семьи' : 'Твой вклад в проект дома'}
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-45"
        style={{
          backgroundImage: 'radial-gradient(rgba(98,68,38,.20) 1px, transparent 1px), linear-gradient(90deg, rgba(127,92,52,.05) 1px, transparent 1px)',
          backgroundSize: '10px 10px, 28px 28px',
        }}
        aria-hidden="true"
      />

      <header className="relative border-b-[3px] border-[#30251d] bg-[#345647] px-4 py-4 text-[#fff7e7] sm:px-6">
        <div className="pointer-events-none absolute -right-9 -top-11 h-36 w-36 rounded-full border-[17px] border-[#f5d68b]/20" aria-hidden="true" />
        <div className="relative flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-pixel-sub text-[10px] tracking-[0.14em] text-[#f5d68b]">ДОМОВОЙ ПРОЕКТ</p>
            <h2 className="mt-1 text-xl font-black tracking-[-0.035em] sm:text-2xl">
              {isParent ? 'Дом собирается из маленьких дел' : 'Твой дом становится живее'}
            </h2>
            <p className="mt-1 text-xs leading-5 text-[#e6ddc6]">
              {weekday} · {project.done} из {project.total} семейных дел отмечено
            </p>
          </div>
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-[15px] border-2 border-[#f5d68b]/75 bg-[#274435] text-[#f5d68b] shadow-[2px_2px_0_rgba(17,43,31,.8)]" aria-hidden="true">
            <Home className="h-6 w-6" />
          </span>
        </div>
      </header>

      <div className="relative p-3 sm:p-5">
        <section className="overflow-hidden rounded-[22px] border-2 border-[#30251d] bg-[#fff8e8] shadow-[4px_4px_0_#b5814a]" aria-labelledby="house-plan-title">
          <div className="flex items-center justify-between gap-3 border-b-2 border-[#30251d] bg-[#ecd3a5] px-3 py-2.5 sm:px-4">
            <div className="flex min-w-0 items-center gap-2">
              <ClipboardList className="h-4 w-4 shrink-0 text-[#60442c]" aria-hidden="true" />
              <h3 id="house-plan-title" className="truncate text-sm font-black">План дома на сегодня</h3>
            </div>
            <span className="shrink-0 font-pixel-sub text-[10px] font-bold text-[#60442c]">{familyProgress}%</span>
          </div>

          <div className="relative p-3 sm:p-4">
            <div className="pointer-events-none absolute left-[8%] right-[8%] top-0 h-7 border-x-[3px] border-t-[3px] border-[#30251d] bg-[#b78155] [clip-path:polygon(50%_0,100%_100%,0_100%)]" aria-hidden="true" />
            <div className="relative grid grid-cols-2 gap-2 pt-5">
              {project.rooms.map((room) => (
                <RoomTile key={room.key} room={room} />
              ))}
            </div>
          </div>

          <div className="border-t-2 border-[#30251d] bg-[#f5e7cb] px-3 py-3 sm:px-4">
            <div className="flex items-center justify-between gap-3 text-xs font-bold text-[#624b36]">
              <span>Уют семьи</span>
              <span>{project.done} / {project.total || 0}</span>
            </div>
            <div className="mt-2 h-3 overflow-hidden rounded-full border-2 border-[#30251d] bg-[#dbc69c] p-[2px]" aria-label={`Уют семьи: ${familyProgress}%`}>
              <div className="h-full rounded-full bg-[#6f9b63] transition-[width] duration-500" style={{ width: `${familyProgress}%` }} />
            </div>
            <p className="mt-2 text-[11px] leading-4 text-[#735941]">
              Отметки улучшают только сегодняшний вид дома. Пропущенное дело ничего не отнимает.
            </p>
          </div>
        </section>

        <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_252px]">
          <section className="rounded-[20px] border-2 border-[#30251d] bg-[#fff8e8] p-3.5 shadow-[3px_3px_0_#b5814a]" aria-labelledby="next-zone-title">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-pixel-sub text-[10px] tracking-[0.12em] text-[#7a5b3e]">БЛИЖАЙШИЙ УГОЛОК</p>
                <h3 id="next-zone-title" className="mt-1 text-base font-black">
                  {project.nextRoom ? project.nextRoom.title : 'Сегодня всё в порядке'}
                </h3>
              </div>
              {project.nextRoom ? (
                <span className={cx('grid h-11 w-11 shrink-0 place-items-center rounded-[13px] border-2 border-[#30251d]/25', project.nextRoom.paperClass, project.nextRoom.inkClass)} aria-hidden="true">
                  <project.nextRoom.icon className="h-5 w-5" />
                </span>
              ) : (
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[13px] border-2 border-[#30251d]/25 bg-[#d5e5bd] text-[#3f684f]" aria-hidden="true">
                  <CircleCheck className="h-5 w-5" />
                </span>
              )}
            </div>

            {project.nextRoom ? (
              <>
                <p className="mt-1 text-xs leading-5 text-[#6b5137]">{project.nextRoom.description}</p>
                <ul className="mt-3 space-y-1.5" aria-label={`Дела зоны «${project.nextRoom.title}»`}>
                  {project.nextRoom.tasks.filter((entry) => !entry.done).slice(0, 3).map(({ task }) => (
                    <li key={task.id} className="flex min-h-10 items-center gap-2 rounded-xl border border-[#c69b68] bg-[#f8ecd2] px-2.5 text-xs font-semibold text-[#4d3829]">
                      <span className="grid h-5 w-5 shrink-0 place-items-center rounded-md border border-[#a77a4d] bg-[#fff7e7] text-[#8b5d34]" aria-hidden="true">
                        <ChevronRight className="h-3.5 w-3.5" />
                      </span>
                      <span className="min-w-0 flex-1 truncate">{task.title}</span>
                      {task.is_required && <span className="shrink-0 text-[10px] font-bold text-[#a34f3f]">важно</span>}
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="mt-1 text-xs leading-5 text-[#6b5137]">Можно отдохнуть, выбрать новое дело или вместе придумать следующий проект.</p>
            )}
          </section>

          {isParent ? (
            <ParentProjectActions
              childCount={childCount}
              onOpenAddTask={openAddTask}
              onOpenFamilySettings={openFamily}
            />
          ) : (
            <ChildProjectActions
              completed={project.personalDone}
              total={project.personalTotal}
              onOpenShop={openChildShop}
              onOpenFamilyOverview={openFamilyOverview}
            />
          )}
        </div>
      </div>
    </section>
  );
}

function RoomTile({ room }: { room: RoomProgress }): React.ReactElement {
  const Icon = room.icon;
  const hasTasks = room.tasks.length > 0;

  return (
    <article className={cx('relative min-h-[132px] overflow-hidden rounded-[16px] border-2 border-[#30251d] p-3 shadow-[2px_2px_0_rgba(48,37,29,.55)]', room.paperClass)}>
      <div className="absolute inset-x-0 bottom-0 h-8 bg-[#30251d]/[0.06]" aria-hidden="true" />
      <div className="relative flex items-start justify-between gap-2">
        <span className={cx('grid h-9 w-9 place-items-center rounded-[11px] border-2 border-[#30251d]/25 bg-[#fff8e8]/75', room.inkClass)} aria-hidden="true">
          <Icon className="h-4.5 w-4.5" />
        </span>
        <span className={cx('rounded-md border border-[#30251d]/20 bg-[#fff8e8]/70 px-1.5 py-0.5 text-[9px] font-black', room.inkClass)}>{roomStatus(room)}</span>
      </div>
      <div className="relative mt-3">
        <h4 className="text-[13px] font-black leading-4">{room.shortTitle}</h4>
        <p className="mt-0.5 text-[10px] leading-4 text-[#664d39]">{hasTasks ? `${room.doneCount} из ${room.tasks.length} дел` : 'Новый уголок ждёт идей'}</p>
      </div>
      <div className="relative mt-3 h-2.5 overflow-hidden rounded-full border border-[#30251d]/35 bg-[#fff8e8]/65 p-px">
        <div className={cx('h-full rounded-full transition-[width] duration-500', room.fillClass)} style={{ width: `${room.progress}%` }} />
      </div>
    </article>
  );
}

function ParentProjectActions({
  childCount,
  onOpenAddTask,
  onOpenFamilySettings,
}: {
  childCount: number;
  onOpenAddTask: () => void;
  onOpenFamilySettings: () => void;
}): React.ReactElement {
  return (
    <aside className="rounded-[20px] border-2 border-[#30251d] bg-[#e8d5ae] p-3.5 shadow-[3px_3px_0_#b5814a]" aria-label="Управление домашним проектом">
      <p className="font-pixel-sub text-[10px] tracking-[0.12em] text-[#755437]">РОДИТЕЛЬСКИЙ ПЛАН</p>
      <h3 className="mt-1 text-base font-black">Соберите понятный день</h3>
      <p className="mt-1 text-xs leading-5 text-[#674b34]">
        {childCount > 0 ? `В проекте участвуют ${childCount} ${childCountCopy(childCount)}.` : 'Добавьте участников и распределите первые дела.'}
      </p>
      <button
        type="button"
        onClick={onOpenAddTask}
        className="mt-4 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-[14px] border-2 border-[#30251d] bg-[#5d8760] px-3 text-sm font-black text-[#fff8e8] shadow-[3px_3px_0_#30251d] transition-transform active:translate-x-[3px] active:translate-y-[3px] active:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#30251d] focus-visible:ring-offset-2 focus-visible:ring-offset-[#e8d5ae]"
      >
        <Plus className="h-4 w-4" aria-hidden="true" />
        Добавить дело
      </button>
      <button
        type="button"
        onClick={onOpenFamilySettings}
        className="mt-2 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-[13px] border-2 border-[#8f6945] bg-[#f7e8c9] px-3 text-xs font-black text-[#523c2a] transition-colors hover:bg-[#fff5df] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#30251d] focus-visible:ring-offset-2 focus-visible:ring-offset-[#e8d5ae]"
      >
        <Settings className="h-4 w-4" aria-hidden="true" />
        Настроить семью
      </button>
    </aside>
  );
}

function ChildProjectActions({
  completed,
  total,
  onOpenShop,
  onOpenFamilyOverview,
}: {
  completed: number;
  total: number;
  onOpenShop: () => void;
  onOpenFamilyOverview: () => void;
}): React.ReactElement {
  return (
    <aside className="rounded-[20px] border-2 border-[#30251d] bg-[#e8d5ae] p-3.5 shadow-[3px_3px_0_#b5814a]" aria-label="Твой вклад в проект">
      <p className="font-pixel-sub text-[10px] tracking-[0.12em] text-[#755437]">ТВОЙ ВКЛАД</p>
      <h3 className="mt-1 text-base font-black">{contributionCopy(completed, total)}</h3>
      <p className="mt-1 text-xs leading-5 text-[#674b34]">
        Выполненные дела делают комнаты теплее. Ничего не нужно спасать или побеждать.
      </p>
      <button
        type="button"
        onClick={onOpenShop}
        className="mt-4 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-[14px] border-2 border-[#30251d] bg-[#b46f3f] px-3 text-sm font-black text-[#fff8e8] shadow-[3px_3px_0_#30251d] transition-transform active:translate-x-[3px] active:translate-y-[3px] active:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#30251d] focus-visible:ring-offset-2 focus-visible:ring-offset-[#e8d5ae]"
      >
        <Palette className="h-4 w-4" aria-hidden="true" />
        В лавку идей
      </button>
      <button
        type="button"
        onClick={onOpenFamilyOverview}
        className="mt-2 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-[13px] border-2 border-[#8f6945] bg-[#f7e8c9] px-3 text-xs font-black text-[#523c2a] transition-colors hover:bg-[#fff5df] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#30251d] focus-visible:ring-offset-2 focus-visible:ring-offset-[#e8d5ae]"
      >
        <Users className="h-4 w-4" aria-hidden="true" />
        Наша семья
      </button>
    </aside>
  );
}
