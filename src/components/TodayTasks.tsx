import React, { useState, useEffect, useCallback } from 'react';
import { Task, User, Habit } from '../types';
import { CheckCircle2, Circle, Plus, Sparkles, Calendar, ShieldAlert, Flame, Lock, Search, X, Star } from 'lucide-react';
import { DAYS_OF_WEEK, TASK_CATEGORY_ICONS } from '../data/initialData';
import { ConfirmModal } from './ConfirmModal';
import { triggerHaptic } from '../utils/haptics';
import { valueColor } from '../services/habitService';

// ============================================================
// API-типы (GET /api/users/:id/tasks/today)
// ============================================================
interface TodayTaskApi {
  id: number;
  code: string;
  title: string;
  points: number;
  category: string;
  task_type: string;
  is_required: boolean;
  done: boolean;
  crystals: number;
}

interface TodayTasksSummary {
  total: number;
  required_done: number;
  required_total: number;
  all_required_done: boolean;
  progress_percent: number;
}

interface TodayTasksData {
  required: TodayTaskApi[];
  choice: TodayTaskApi[];
  quests: TodayTaskApi[];
  summary: TodayTasksSummary;
}

interface TodayTasksProps {
  tasks: Task[];
  activeUser: User;
  onCompleteTask: (taskId: number) => void;
  onOpenAddModal: () => void;
  onToggleUndoTask?: (taskId: number) => void;
  onRefreshData?: () => void;
}

// Пиксельная иконка монеты (без эмодзи!)
const CoinIcon: React.FC<{ className?: string }> = ({ className = 'w-3.5 h-3.5' }) => (
  <img
    src="/assets/game/backgrounds/Previews/coin.png"
    alt="gold"
    className={`${className} object-contain pixel-art [image-rendering:pixelated] inline-block`}
    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
  />
);

// Иконка категории с fallback (без эмодзи!)
const CategoryIcon: React.FC<{ category: string; taskType: string; className?: string }> = ({ category, taskType, className }) => {
  const iconUrl = TASK_CATEGORY_ICONS[category];
  if (iconUrl) {
    return (
      <img
        src={iconUrl}
        alt={category}
        className={`w-6 h-6 sm:w-7 sm:h-7 object-contain pixel-art [image-rendering:pixelated] ${className || ''}`}
        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
      />
    );
  }
  // Fallback: lucide иконка по типу задачи (без эмодзи)
  if (taskType === 'quest') {
    return <Star className={`w-5 h-5 sm:w-6 sm:h-6 text-amber-400 ${className || ''}`} />;
  }
  return <Sparkles className={`w-5 h-5 sm:w-6 sm:h-6 text-slate-500 ${className || ''}`} />;
};

export const TodayTasks: React.FC<TodayTasksProps> = ({
  tasks,
  activeUser,
  onCompleteTask,
  onOpenAddModal,
  onRefreshData,
}) => {
  const [filter, setFilter] = useState<'all' | 'mine' | 'joint'>('mine');
  const [showHabits, setShowHabits] = useState(false);
  const [habits, setHabits] = useState<Habit[]>([]);
  const [habitMsg, setHabitMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [taskToConfirm, setTaskToConfirm] = useState<Task | TodayTaskApi | null>(null);

  // Данные с API tasks/today
  const [apiData, setApiData] = useState<TodayTasksData | null>(null);
  const [apiError, setApiError] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const todayDayIndex = new Date().getDay() === 0 ? 6 : new Date().getDay() - 1;
  const currentDayName = DAYS_OF_WEEK[todayDayIndex];

  // Загрузка с API
  const fetchTasks = useCallback(async (userId: number) => {
    try {
      setIsLoading(true);
      const res = await fetch(`/api/users/${userId}/tasks/today`);
      if (!res.ok) throw new Error('API error');
      const json = await res.json();
      if (json?.data) {
        setApiData(json.data);
        setApiError(false);
      } else {
        setApiError(true);
      }
    } catch (e) {
      console.warn('TodayTasks: API недоступен, fallback на appState', e);
      setApiError(true);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTasks(activeUser.id);
  }, [activeUser.id, fetchTasks]);

  // Загрузка привычек (Habitica)
  const fetchHabits = useCallback(async () => {
    try {
      const res = await fetch(`/api/habits?userId=${activeUser.id}`);
      const json = await res.json();
      if (json?.success) setHabits(json.habits || []);
    } catch { /* тихо — привычки не критичны */ }
  }, [activeUser.id]);

  useEffect(() => {
    if (showHabits) fetchHabits();
  }, [showHabits, fetchHabits]);

  // Клик [+/-] по привычке
  const scoreHabit = async (habitId: number, direction: 'up' | 'down') => {
    triggerHaptic('impact', 'medium');
    try {
      const res = await fetch(`/api/habits/${habitId}/score`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ direction, userId: activeUser.id }),
      });
      const json = await res.json();
      if (json.success) {
        setHabitMsg({ text: json.message, ok: direction === 'up' });
        setTimeout(() => setHabitMsg(null), 2500);
        fetchHabits();
        onRefreshData?.();
      } else {
        setHabitMsg({ text: json.error, ok: false });
      }
    } catch {
      setHabitMsg({ text: 'Ошибка соединения', ok: false });
    }
  };

  // Создание привычки (промптом — простой путь для v1)
  const addHabit = async () => {
    const title = window.prompt('Название новой привычки:');
    if (!title || !title.trim()) return;
    await fetch('/api/habits/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: activeUser.id, title: title.trim() }),
    });
    triggerHaptic('notification', 'success');
    fetchHabits();
  };

  // Fallback: фильтруем из appState если API недоступен
  const scheduledTasks = tasks.filter((task) => {
    const isToday =
      task.task_type === 'daily' ||
      task.task_type === 'todo' ||
      (task.task_type === 'weekly' && task.day_of_week === todayDayIndex);

    if (!isToday) return false;

    if (searchQuery.trim() && !task.title.toLowerCase().includes(searchQuery.toLowerCase().trim())) {
      return false;
    }

    if (filter === 'mine') {
      return task.assignee === activeUser.assignee || task.assignee === 'both';
    }
    if (filter === 'joint') {
      return task.assignee === 'both';
    }
    return true;
  });

  const fallbackCompleted = scheduledTasks.filter((t) => t.done).length;
  const fallbackProgress = scheduledTasks.length > 0 ? Math.round((fallbackCompleted / scheduledTasks.length) * 100) : 0;

  // Активные данные: API или fallback
  const summary = apiData ? apiData.summary : {
    total: scheduledTasks.length,
    required_done: scheduledTasks.filter((t) => t.done && t.is_required).length,
    required_total: scheduledTasks.filter((t) => t.is_required).length,
    all_required_done: scheduledTasks.length > 0 && scheduledTasks.filter((t) => t.is_required).every((t) => t.done),
    progress_percent: fallbackProgress,
  };

  const remainingRequired = summary.required_total - summary.required_done;

  // Задачи для отображения: API или fallback
  const requiredTasks = apiData ? apiData.required : scheduledTasks.filter((t) => t.is_required);
  const choiceTasks = apiData ? apiData.choice : scheduledTasks.filter((t) => !t.is_required && t.task_type !== 'quest');
  const questTasks = apiData ? apiData.quests : scheduledTasks.filter((t) => t.task_type === 'quest');

  const hasAnyTask = (apiData && (apiData.required.length || apiData.choice.length || apiData.quests.length)) || scheduledTasks.length > 0;

  const renderTaskItem = (task: Task | TodayTaskApi) => {
    const isDone = !!task.done;
    const taskType = (task as any).task_type || '';
    const isQuest = taskType === 'quest';
    const isRequired = 'is_required' in task ? !!task.is_required : (task as any).is_required === true;

    const category = (task as any).category || '';

    const isMyOrJointTask = (task as Task).assignee
      ? (task as Task).assignee === activeUser.assignee || (task as Task).assignee === 'both'
      : true;

    const assigneeLabel = (task as Task).assignee
      ? (task as Task).assignee === 'misha'
        ? 'Миша'
        : (task as Task).assignee === 'regina'
        ? 'Регина'
        : 'Вместе'
      : activeUser.display_name;

    const crystals = (task as any).crystals || 0;

    // Habitica Task Value Decay (Этап 4): цвет и множитель от ценности
    const taskValue = typeof (task as any).value === 'number' ? (task as any).value : 0;
    const valueMult = valueColor(taskValue).goldMultiplier;
    const finalPoints = Math.max(1, Math.round(task.points * valueMult));

    return (
      <div
        key={task.id}
        className={`flex items-center justify-between p-3 sm:p-3.5 rounded-2xl border transition-all ${
          isDone
            ? 'bg-emerald-950/20 border-emerald-500/30 text-slate-400'
            : isRequired
            ? 'bg-red-950/20 border-red-500/30 hover:border-red-400/50'
            : isQuest
            ? 'bg-amber-950/20 border-amber-500/30 hover:border-amber-400/50'
            : 'bg-emerald-950/10 border-emerald-600/25 hover:border-emerald-400/50'
        }`}
      >
        <div className="flex items-center gap-3 min-w-0">
          <button
            disabled={isDone || !isMyOrJointTask}
            onClick={() => {
              if (!isDone && isMyOrJointTask) {
                triggerHaptic('impact', 'medium');
                setTaskToConfirm(task);
              }
            }}
            className={`transition-transform flex-shrink-0 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl ${
              isDone
                ? 'text-emerald-400 cursor-default'
                : !isMyOrJointTask
                ? 'text-slate-600 cursor-not-allowed opacity-60'
                : isRequired
                ? 'text-red-400 hover:text-red-300 active:scale-90 cursor-pointer hover:bg-white/5'
                : isQuest
                ? 'text-amber-400 hover:text-amber-300 active:scale-90 cursor-pointer hover:bg-white/5'
                : 'text-emerald-400 hover:text-emerald-300 active:scale-90 cursor-pointer hover:bg-white/5'
            }`}
            title={
              isDone
                ? 'Завершено'
                : !isMyOrJointTask
                ? `Задача назначена на: ${assigneeLabel}`
                : 'Отметить выполненной'
            }
          >
            {isDone ? (
              <div className="relative flex items-center justify-center">
                <CheckCircle2 className="w-5 h-5 fill-emerald-500/20 text-emerald-400" />
                <Lock className="w-2.5 h-2.5 text-emerald-300 absolute -bottom-1 -right-1 bg-slate-950 rounded-full" />
              </div>
            ) : !isMyOrJointTask ? (
              <div className="relative flex items-center justify-center" title={`Только ${assigneeLabel}`}>
                <Circle className="w-5 h-5 text-slate-600" />
                <Lock className="w-2.5 h-2.5 text-amber-400 absolute -bottom-1 -right-1 bg-slate-950 rounded-full" />
              </div>
            ) : (
              <Circle className="w-5 h-5" />
            )}
          </button>

          {/* Категория icon (32-bit pixel) */}
          <CategoryIcon category={category} taskType={taskType} />

          <div className="min-w-0">
            <p
              className={`text-sm font-medium tracking-tight truncate ${
                isDone
                  ? 'line-through text-slate-400 opacity-70'
                  : !isMyOrJointTask
                  ? 'text-slate-300'
                  : 'text-white'
              }`}
            >
              {task.title}
            </p>
            <div className="flex flex-wrap items-center gap-2 mt-0.5 text-[11px] text-slate-400">
              <span className="capitalize">
                {taskType === 'daily'
                  ? 'Ежедневно'
                  : taskType === 'weekly'
                  ? 'Еженедельно'
                  : taskType === 'quest'
                  ? 'Квест'
                  : 'Разовая'}
              </span>
              {isRequired && (
                <>
                  <span>•</span>
                  <span className="text-[10px] text-red-400 bg-red-400/10 px-1.5 py-0.5 rounded border border-red-400/20 flex items-center gap-1 font-semibold">
                    <ShieldAlert className="w-2.5 h-2.5" /> Обязательное
                  </span>
                </>
              )}
              {isQuest && (
                <>
                  <span>•</span>
                  <span className="text-[10px] text-amber-400 bg-amber-400/10 px-1.5 py-0.5 rounded border border-amber-400/20 flex items-center gap-1 font-semibold">
                    <Star className="w-2.5 h-2.5" /> Квест
                  </span>
                </>
              )}
              <span>•</span>
              <span>{assigneeLabel}</span>

              {!isMyOrJointTask && (
                <>
                  <span>•</span>
                  <span className="text-[10px] text-amber-400 bg-amber-400/10 px-1.5 py-0.5 rounded border border-amber-400/20 flex items-center gap-1 font-semibold">
                    <Lock className="w-2.5 h-2.5" /> Только {assigneeLabel}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0 ml-3">
          <span
            className={`px-2.5 py-1 rounded-xl text-xs font-bold flex items-center gap-1 ${
              isDone
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                : taskValue < 0
                  ? 'bg-orange-500/15 text-orange-300 border border-orange-400/30'   // запущенная (decay)
                  : 'bg-amber-400/10 text-amber-300 border border-amber-400/20'
            }`}
            title={taskValue !== 0 ? `Ценность: ${taskValue > 0 ? '+' : ''}${taskValue.toFixed(1)} (множитель золота ×${valueMult.toFixed(2)})` : undefined}
          >
            +{finalPoints}
            <CoinIcon />
            {crystals ? <span className="text-cyan-300">+{crystals}</span> : null}
          </span>
        </div>
      </div>
    );
  };

  const renderSection = (title: string, icon: React.ReactNode, color: string, tasks: (Task | TodayTaskApi)[], emptyText: string) => (
    <div className="mb-4">
      <div className={`flex items-center gap-2 mb-2 ${color}`}>
        {icon}
        <h3 className="text-xs sm:text-sm font-bold font-pixel-sub uppercase tracking-wide">{title}</h3>
        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/10 text-slate-400 ml-auto">
          {tasks.length}
        </span>
      </div>
      {tasks.length === 0 ? (
        <div className="text-center py-4 px-3 bg-black/20 rounded-xl border border-dashed border-white/10">
          <p className="text-xs text-slate-500">{emptyText}</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {tasks.map((task) => renderTaskItem(task))}
        </div>
      )}
    </div>
  );

  return (
    <div className="jrpg-quest-card rounded-2xl p-3.5 sm:p-5 backdrop-blur-md relative shadow-2xl">
      {/* Task Confirmation Modal */}
      <ConfirmModal
        isOpen={!!taskToConfirm}
        onClose={() => setTaskToConfirm(null)}
        onConfirm={() => {
          if (taskToConfirm) {
            onCompleteTask(taskToConfirm.id);
            setTaskToConfirm(null);
          }
        }}
        title="Подтверждение выполнения"
        description={
          taskToConfirm
            ? `Вы уверены, что действительно выполнили задачу «${taskToConfirm.title}»?`
            : ''
        }
        confirmText="Да, выполнено"
        cancelText="Отмена"
        badgeText={taskToConfirm ? `+${taskToConfirm.points} награда` : undefined}
        iconType="task"
      />

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 sm:gap-3 mb-3">
        <div>
          <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
            <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-1.5 sm:gap-2">
              <Calendar className="w-4 h-4 sm:w-5 sm:h-5 text-blue-400 shrink-0" />
              <span>Задачи на сегодня</span>
            </h2>
            <span className="text-[11px] sm:text-xs px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-300 border border-blue-500/20 font-medium">
              {currentDayName}
            </span>
          </div>
          <p className="text-[11px] sm:text-xs text-slate-400 mt-0.5">
            {isLoading ? 'Загрузка...' : apiData ? (
              <>Выполнено {summary.required_done}/{summary.required_total} обязательных · {summary.progress_percent}% всего</>
            ) : (
              <>Выполнено {fallbackCompleted} из {scheduledTasks.length} задач ({fallbackProgress}%)
                {summary.all_required_done && ' · Идеальный день!'}
              </>
            )}
          </p>
        </div>

        {/* Filter buttons & Add Task */}
        <div className="flex items-center gap-2 max-w-full overflow-x-auto w-full sm:w-auto justify-between sm:justify-end">
          <div className="flex items-center bg-black/40 p-1 rounded-xl border border-white/10 text-xs gap-0.5 overflow-x-auto scrollbar-none">
            <button
              onClick={() => {
                triggerHaptic('impact', 'light');
                setShowHabits((v) => !v);
                if (!showHabits) fetchHabits();
              }}
              className={`px-2 sm:px-2.5 py-1 sm:py-1.5 rounded-lg transition whitespace-nowrap text-[11px] sm:text-xs font-semibold flex items-center gap-1 ${
                showHabits ? 'bg-purple-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Sparkles className="w-3 h-3" />
              Привычки
            </button>
            <button
              onClick={() => {
                triggerHaptic('impact', 'light');
                setFilter('mine');
              }}
              className={`px-2 sm:px-2.5 py-1 sm:py-1.5 rounded-lg transition whitespace-nowrap text-[11px] sm:text-xs font-semibold ${
                filter === 'mine' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
              }`}
            >
              Мои
            </button>
            <button
              onClick={() => {
                triggerHaptic('impact', 'light');
                setFilter('all');
              }}
              className={`px-2 sm:px-2.5 py-1 sm:py-1.5 rounded-lg transition whitespace-nowrap text-[11px] sm:text-xs font-semibold ${
                filter === 'all' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
              }`}
            >
              Все
            </button>
            <button
              onClick={() => {
                triggerHaptic('impact', 'light');
                setFilter('joint');
              }}
              className={`px-2 sm:px-2.5 py-1 sm:py-1.5 rounded-lg transition whitespace-nowrap text-[11px] sm:text-xs font-semibold ${
                filter === 'joint' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
              }`}
            >
              Общие
            </button>
          </div>

          <button
            onClick={() => {
              triggerHaptic('impact', 'medium');
              onOpenAddModal();
            }}
            className="flex items-center gap-1.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white px-3.5 py-2 rounded-xl text-xs font-semibold shadow-md shadow-blue-500/20 transition shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">+ Задача</span>
          </button>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="w-full bg-black/40 h-2.5 rounded-full overflow-hidden border border-white/10 mb-1.5">
        <div
          className="h-full bg-gradient-to-r from-red-500 via-amber-400 to-emerald-400 transition-all duration-500"
          style={{ width: `${Math.max(0, Math.min(100, summary.progress_percent))}%` }}
        />
      </div>
      <div className="flex items-center justify-between text-[11px] text-slate-400 mb-4">
        <span>Прогресс: {summary.total} задач · {summary.progress_percent}%</span>
        {!summary.all_required_done && remainingRequired > 0 && (
          <span className="text-red-400 font-semibold flex items-center gap-1">
            <ShieldAlert className="w-3 h-3" />
            Осталось {remainingRequired} {remainingRequired === 1 ? 'обязательное' : 'обязательных'}
          </span>
        )}
        {summary.all_required_done && (
          <span className="text-emerald-400 font-semibold flex items-center gap-1">
            <Flame className="w-3 h-3" /> Streak сохранён!
          </span>
        )}
      </div>

      {/* === Habitica Habits Panel (Этап 3) === */}
      {showHabits && (
        <div className="mb-4 p-3 sm:p-4 rounded-2xl bg-purple-950/30 border border-purple-500/30 space-y-2">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-bold text-purple-300 font-pixel-sub uppercase tracking-wider">
              Привычки
            </span>
            {activeUser.family_role !== 'parent' && (
              <button
                onClick={addHabit}
                className="px-2.5 py-1 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-[10px] font-bold transition active:scale-95"
              >
                + Привычка
              </button>
            )}
          </div>

          {habitMsg && (
            <div className={`text-[11px] font-bold px-3 py-2 rounded-xl ${
              habitMsg.ok ? 'bg-emerald-500/15 text-emerald-300' : 'bg-red-500/15 text-red-300'
            }`}>
              {habitMsg.text}
            </div>
          )}

          {habits.length === 0 ? (
            <p className="text-[11px] text-slate-500 italic py-2">
              Привычек пока нет. Создай первую: читай, убирайся, помогай — и жми плюс!
            </p>
          ) : (
            habits.map((h) => {
              const color = h.value <= -5 ? '#991b1b' : h.value <= -1 ? '#ea580c' : h.value < 2 ? '#eab308' : h.value < 6 ? '#16a34a' : '#2563eb';
              const isParent = activeUser.family_role === 'parent';
              return (
                <div key={h.id} className="flex items-center gap-2 p-2 rounded-xl bg-white/5 border border-white/5">
                  <span
                    className="w-2 h-8 rounded-full shrink-0"
                    style={{ backgroundColor: color }}
                    title={`Ценность: ${h.value.toFixed(1)}`}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-slate-100 truncate">{h.title}</p>
                    <p className="text-[9px] text-slate-500">
                      +{h.counter_up} / −{h.counter_down} · ценность {h.value >= 0 ? '+' : ''}{h.value.toFixed(1)}
                    </p>
                  </div>
                  {!isParent && (
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => scoreHabit(h.id, 'up')}
                        className="w-11 h-9 rounded-lg bg-emerald-600/80 hover:bg-emerald-500 active:scale-95 transition text-white font-black text-sm flex items-center justify-center"
                        aria-label={`Плюс: ${h.title}`}
                      >
                        +
                      </button>
                      <button
                        onClick={() => scoreHabit(h.id, 'down')}
                        className="w-11 h-9 rounded-lg bg-rose-600/70 hover:bg-rose-500 active:scale-95 transition text-white font-black text-sm flex items-center justify-center"
                        aria-label={`Минус: ${h.title}`}
                      >
                        −
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Mobile Search Bar */}
      <div className="relative mb-4">
        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Поиск по задачам на сегодня..."
          className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-8 py-2 text-xs text-white placeholder-slate-500 focus:border-blue-500 outline-none transition"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-1"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Task Sections */}
      {isLoading ? (
        <div className="text-center py-10 px-4 bg-black/20 rounded-2xl border border-dashed border-white/10">
          <div className="w-12 h-12 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center mb-3 mx-auto">
            <Sparkles className="w-6 h-6 text-blue-400 animate-pulse" />
          </div>
          <p className="text-sm font-bold text-white">Загружаем задачи...</p>
        </div>
      ) : !hasAnyTask ? (
        <div className="text-center py-10 px-4 bg-black/20 rounded-2xl border border-dashed border-white/10 flex flex-col items-center justify-center">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mb-3">
            <Sparkles className="w-6 h-6 text-amber-400 animate-pulse" />
          </div>
          <p className="text-sm font-bold text-white">Нет задач на сегодня</p>
          <p className="text-xs text-slate-400 mt-1 max-w-xs leading-relaxed">
            Все задачи выполнены или выбранный фильтр пуст. Создайте новую задачу для себя или обоих игроков!
          </p>
          <button
            onClick={() => {
              triggerHaptic('impact', 'medium');
              onOpenAddModal();
            }}
            className="mt-4 px-5 py-2.5 min-h-[44px] rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 active:scale-95 text-white text-xs font-bold transition shadow-lg shadow-blue-500/20 inline-flex items-center gap-2 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Создать первую задачу</span>
          </button>
        </div>
      ) : (
        <>
          {/* ОБЯЗАТЕЛЬНЫЕ */}
          {renderSection(
            'Обязательные',
            <ShieldAlert className="w-4 h-4 text-red-400" />,
            'text-red-400',
            requiredTasks,
            'Нет обязательных задач'
          )}

          {/* НА ВЫБОР */}
          {renderSection(
            'На выбор',
            <Sparkles className="w-4 h-4 text-emerald-400" />,
            'text-emerald-400',
            choiceTasks,
            'Нет задач на выбор'
          )}

          {/* КВЕСТЫ */}
          {renderSection(
            'Квесты',
            <Star className="w-4 h-4 text-amber-400" />,
            'text-amber-400',
            questTasks,
            'Нет активных квестов'
          )}
        </>
      )}

      {/* Floating Action Button (FAB) for Mobile Quick Task Creation */}
      <button
        onClick={() => {
          triggerHaptic('impact', 'medium');
          onOpenAddModal();
        }}
        className="sm:hidden fixed bottom-20 right-4 z-40 p-4 rounded-full bg-gradient-to-tr from-blue-600 via-indigo-600 to-amber-400 text-white shadow-2xl shadow-blue-500/50 border border-white/20 active:scale-95 transition-transform"
        title="Создать новую задачу"
      >
        <Plus className="w-6 h-6" />
      </button>
    </div>
  );
};
