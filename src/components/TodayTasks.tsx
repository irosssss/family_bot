import React, { useState } from 'react';
import { Task, User } from '../types';
import { CheckCircle2, Circle, Plus, Sparkles, Filter, Calendar, Users, Flame, Lock, Search, X } from 'lucide-react';
import { DAYS_OF_WEEK } from '../data/initialData';
import { ConfirmModal } from './ConfirmModal';
import { triggerHaptic } from '../utils/haptics';

interface TodayTasksProps {
  tasks: Task[];
  activeUser: User;
  onCompleteTask: (taskId: number) => void;
  onOpenAddModal: () => void;
  onToggleUndoTask?: (taskId: number) => void;
}

export const TodayTasks: React.FC<TodayTasksProps> = ({
  tasks,
  activeUser,
  onCompleteTask,
  onOpenAddModal,
}) => {
  const [filter, setFilter] = useState<'all' | 'mine' | 'joint'>('mine');
  const [searchQuery, setSearchQuery] = useState('');
  const [taskToConfirm, setTaskToConfirm] = useState<Task | null>(null);

  const todayDayIndex = new Date().getDay() === 0 ? 6 : new Date().getDay() - 1;
  const currentDayName = DAYS_OF_WEEK[todayDayIndex];

  // Filter tasks for today
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

  const completedCount = scheduledTasks.filter((t) => t.done).length;
  const totalCount = scheduledTasks.length;
  const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
  const allCompleted = totalCount > 0 && completedCount === totalCount;

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
        badgeText={taskToConfirm ? `+${taskToConfirm.points} 💰 награда` : undefined}
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
            Выполнено {completedCount} из {totalCount} задач ({progressPercent}%)
            {allCompleted && ' · 🌟 Идеальный день!'}
          </p>
        </div>

        {/* Filter buttons & Add Task */}
        <div className="flex items-center gap-2 max-w-full overflow-x-auto w-full sm:w-auto justify-between sm:justify-end">
          <div className="flex items-center bg-black/40 p-1 rounded-xl border border-white/10 text-xs gap-0.5 overflow-x-auto scrollbar-none">
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
              Общие 🤝
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

      {/* Progress Bar (Mobile Checklist Pattern) */}
      <div className="w-full bg-black/40 h-2 rounded-full overflow-hidden border border-white/10 mb-4">
        <div
          className="h-full bg-gradient-to-r from-blue-500 via-indigo-400 to-emerald-400 transition-all duration-500"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      {/* Mobile Search Bar */}
      <div className="relative mb-3">
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

      {/* Task List */}
      <div className="space-y-2.5">
        {scheduledTasks.length === 0 ? (
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
          scheduledTasks.map((task) => {
            const isDone = !!task.done;
            const isMyOrJointTask =
              task.assignee === activeUser.assignee || task.assignee === 'both';

            const assigneeLabel =
              task.assignee === 'misha'
                ? 'Миша ⚔️'
                : task.assignee === 'regina'
                ? 'Регина 🔮'
                : 'Вместе 🤝';

            return (
              <div
                key={task.id}
                className={`flex items-center justify-between p-3.5 rounded-2xl border transition-all ${
                  isDone
                    ? 'bg-emerald-950/20 border-emerald-500/30 text-slate-400'
                    : !isMyOrJointTask
                    ? 'bg-slate-950/40 border-slate-800/80 text-slate-400'
                    : 'bg-white/5 border-white/10 hover:border-blue-500/40 text-slate-200 hover:bg-white/10'
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
                        : 'text-slate-400 hover:text-blue-400 active:scale-90 cursor-pointer hover:bg-white/5'
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
                        {task.task_type === 'daily'
                          ? 'Ежедневно'
                          : task.task_type === 'weekly'
                          ? 'Еженедельно'
                          : 'Разовая'}
                      </span>
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
                    className={`px-2.5 py-1 rounded-xl text-xs font-bold ${
                      isDone
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                        : 'bg-amber-400/10 text-amber-300 border border-amber-400/20'
                    }`}
                  >
                    +{task.points} 💰
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>

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
