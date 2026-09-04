/**
 * Сервис Streak (серия выполненных дней) v2.1.
 * 
 * ИСПРАВЛЕНИЯ:
 * - BUG #1: Race condition fix с DB transaction + FOR UPDATE lock
 * - BUG #2: Milestone rewards дублирование fix с tracking таблицей
 * - BUG #3: Freeze cooldown calculation fix
 * - BUG #5: Socket.IO event name fix (streak:updated → streak_updated)
 */
import { appState } from './stateService';
import { grantMilestoneReward } from './persistService';
import { getTodayStr } from '../lib/dateUtils';
import { db } from '../db';
import * as schema from '../db/schema';
import { eq, and } from 'drizzle-orm';
import { getTasksForUser, generateDailyTasks } from './taskGenerator';
import { 
 notifyMilestone3, 
 notifyMilestone7, 
 notifyMilestone10,
 notifyStreakSaved as sendStreakSavedTelegram,
 notifyStreakBroken as sendStreakBrokenTelegram,
 notifyStreakPaused as sendStreakPausedTelegram
} from '../bot/notifications';
import type { Task, User } from '../types';

export type StreakStatus = 'active' | 'paused' | 'broken' | 'frozen';

function emitToUserFamily(io: any, user: User, event: string, payload: unknown): void {
 const familyId = Number(user.family_id);
 if (!io || !Number.isInteger(familyId) || familyId <= 0) return;
 io.to(`family:${familyId}`).emit(event, payload);
}

/**
 * Получить бонусный процент на основе текущего streak.
 * +5% за каждый день, максимум +50% (10 дней).
 */
export function getStreakBonus(streak: number): number {
 // Отрицательный streak (некорректные данные) не должен давать отрицательный бонус
 return Math.min(Math.max(streak, 0) * 5, 50);
}

/**
 * Получить бонусный множитель (для применения к наградам).
 */
export function getStreakMultiplier(streak: number): number {
 const bonusPercent = getStreakBonus(streak);
 return 1 + bonusPercent / 100;
}

/**
 * Получить ОБЯЗАТЕЛЬНЫЕ задачи пользователя на указанную дату.
 * БАГ #1 FIX (Вариант A): использует generateDailyTasks — тот же список,
 * что показывает API tasks/today. streak проверяет ТОЛЬКО те обязательные,
 * которые реально видны пользователю.
 */
export function getRequiredTasksForDate(userId: number, date: string): Task[] {
 const user = appState.users.find(u => u.id === userId);
 if (!user) return [];
 // РОЛЕВАЯ МОДЕЛЬ (Этап R1): родители не участвуют в streak
 if (user.family_role === 'parent') return [];
 const dateObj = new Date(date);
 return generateDailyTasks(user, appState.tasks, dateObj)
 .filter((t) => t.task_type === 'personal' && t.is_required);
}

/**
 * Получить все задачи пользователя на указанную дату (для совместимости).
 * Использует генератор задач (Этап 7).
 */
export function getTasksForDate(userId: number, date: string): Task[] {
 const user = appState.users.find(u => u.id === userId);
 if (!user) return [];
 return getTasksForUser(user, appState.tasks, new Date(date));
}

/**
 * Проверить, выполнены ли ВСЕ ОБЯЗАТЕЛЬНЫЕ задачи пользователя на дату.
 * SPEC 2.4: core/quest НЕ влияют на streak, только personal required.
 */
export function checkAllTasksCompleted(userId: number, date: string): boolean {
 const requiredTasks = getRequiredTasksForDate(userId, date);
 
 if (requiredTasks.length === 0) return false;

 const completedTaskIds = appState.completions
 .filter((c) => c.user_id === userId && c.completed_at === date)
 .map((c) => c.task_id);

 return requiredTasks.every((t) => completedTaskIds.includes(t.id));
}

/**
 * Получить список невыполненных ОБЯЗАТЕЛЬНЫХ задач на дату.
 * Для напоминаний: важны только обязательные (SPEC 2.4).
 */
export function getRemainingTasks(userId: number, date: string): Task[] {
 const requiredTasks = getRequiredTasksForDate(userId, date);
 
 const completedTaskIds = appState.completions
 .filter((c) => c.user_id === userId && c.completed_at === date)
 .map((c) => c.task_id);

 return requiredTasks.filter((t) => !completedTaskIds.includes(t.id));
}

/**
 * Отправить уведомление о milestone.
 * BUG #2 FIX: Проверяет дублирование наград через таблицу milestone_rewards_given.
 */
async function notifyMilestone(userId: number, milestone: number, io?: any): Promise<void> {
 const user = appState.users.find(u => u.id === userId);
 if (!user) return;

 // Проверка: не выдана ли уже награда за этот milestone
 const alreadyRewarded = await db
 .select()
 .from(schema.milestone_rewards_given)
 .where(
 and(
 eq(schema.milestone_rewards_given.user_id, userId),
 eq(schema.milestone_rewards_given.milestone_day, milestone)
 )
 )
 .limit(1);

 if (alreadyRewarded.length > 0) {
 console.log(` Milestone ${milestone} reward already given to user ${userId}`);
 return; // Награда уже выдана
 }

 // Milestone rewards
 const rewards: { [key: number]: { gold: number; crystals: number } } = {
 3: { gold: 30, crystals: 5 },
 7: { gold: 70, crystals: 10 },
 10: { gold: 150, crystals: 20 },
 };

 const reward = rewards[milestone];
 if (!reward) return;

 // Выдать награду. ARC-01: атомарно в БД (начисление + отметка в одной
 // транзакции), память зеркалится только после подтверждения записи.
 const granted = await grantMilestoneReward(userId, milestone, {
 gold: reward.gold,
 crystals: reward.crystals,
 });
 if (!granted) {
 console.error(` Milestone ${milestone} reward NOT granted to ${user.display_name} (db failed)`);
 return; // память не мутируем: начисление не подтверждено
 }

 user.gold = granted.gold;
 user.crystals = granted.crystals;

 console.log(` Milestone ${milestone} reached by ${user.display_name}! Reward: ${reward.gold} gold, ${reward.crystals} crystals`);

 // Telegram уведомление (после выдачи награды, чтобы текст совпадал с начисленным)
 if (milestone === 3) {
 await notifyMilestone3(user.telegram_id);
 } else if (milestone === 7) {
 await notifyMilestone7(user.telegram_id);
 } else if (milestone === 10) {
 await notifyMilestone10(user.telegram_id);
 }

 // Socket.IO событие (BUG #5b FIX: streak:milestone — как слушает frontend)
 emitToUserFamily(io, user, 'streak:milestone', {
 userId,
 userName: user.display_name,
 milestone,
 reward,
 });
}

/**
 * Уведомление о сохранении streak через freeze.
 */
async function notifyStreakSaved(userId: number, io?: any): Promise<void> {
 const user = appState.users.find(u => u.id === userId);
 if (!user) return;

 console.log(` Streak saved for ${user.display_name} using Streak Freeze!`);

 // Telegram уведомление
 await sendStreakSavedTelegram(user.telegram_id, user.current_streak);

 emitToUserFamily(io, user, 'streak:saved', {
 userId,
 userName: user.display_name,
 message: 'Streak Freeze использован! Твоя серия сохранена.',
 });
}

/**
 * Уведомление о сбросе streak.
 */
async function notifyStreakBroken(userId: number, io?: any): Promise<void> {
 const user = appState.users.find(u => u.id === userId);
 if (!user) return;

 console.log(` Streak broken for ${user.display_name}`);

 // Telegram уведомление
 await sendStreakBrokenTelegram(user.telegram_id, user.current_streak || 0);

 emitToUserFamily(io, user, 'streak:broken', {
 userId,
 userName: user.display_name,
 message: 'Серия прервана. Начни заново!',
 });
}

/**
 * Уведомление о паузе streak (нет задач на день).
 * BUG #6 FIX: Добавлена и вызывается при tasksAssigned === 0.
 */
async function notifyStreakPaused(userId: number, currentStreak: number, io?: any): Promise<void> {
 const user = appState.users.find(u => u.id === userId);
 if (!user) return;

 console.log(`Streak paused for ${user.display_name} (no tasks today)`);

 // Telegram уведомление
 await sendStreakPausedTelegram(user.telegram_id, currentStreak);

 emitToUserFamily(io, user, 'streak:paused', {
 userId,
 userName: user.display_name,
 current_streak: currentStreak,
 message: 'Сегодня нет задач — серия на паузе. Она не сгорит!',
 });
}

/**
 * Обновить streak пользователя на основе выполненных задач за дату.
 * 
 * BUG #1 FIX: Использует DB transaction с FOR UPDATE lock для предотвращения race condition.
 * 
 * Логика (Вариант C от Game Designer):
 * - Если нет задач на день → streak замораживается (paused)
 * - Если все задачи выполнены → streak += 1
 * - Если не все выполнены + есть freeze → используем freeze
 * - Если не все выполнены + нет freeze → сброс streak = 0
 */
export async function updateStreak(userId: number, date: string, io?: any): Promise<void> {
 const user = appState.users.find(u => u.id === userId);
 if (!user) return;
 const memoryBefore = structuredClone(user);
 let postCommit: { newStatus: StreakStatus; milestoneReached: number | null } | null = null;
 // BUG #1 FIX: Используем транзакцию с row-level lock
 try {
 await db.transaction(async (tx) => {
 // Lock row для предотвращения race condition
 const userRows = await tx
 .select()
 .from(schema.users)
 .where(eq(schema.users.id, userId))
 .for('update') // PostgreSQL row lock
 .limit(1);

 if (userRows.length === 0) {
 console.error(`User ${userId} not found`);
 return;
 }

 const dbUser = userRows[0];

 // Проверка: уже обновляли сегодня?
 if (dbUser.last_streak_update === date) {
 console.log(` Streak already updated for user ${userId} on ${date}`);
 return; // Идемпотентность
 }

 // SPEC 2.4: streak считается ТОЛЬКО по обязательным задачам (personal required)
 const tasksToday = getRequiredTasksForDate(userId, date);
 const tasksAssigned = tasksToday.length;
 
 const completedTaskIds = appState.completions
 .filter((c) => c.user_id === userId && c.completed_at === date)
 .map((c) => c.task_id);
 
 const tasksCompleted = tasksToday.filter(t => completedTaskIds.includes(t.id)).length;

 let newStatus: StreakStatus = dbUser.streak_status as StreakStatus || 'active';
 let newStreak = dbUser.current_streak || 0;
 let milestoneReached: number | null = null;

 // Новый день после сброса: broken — разовый статус прошлого дня, со свежего дня серия активна с нуля
 if (newStatus === 'broken') {
 newStatus = 'active';
 }

 if (tasksAssigned === 0) {
 // Вариант C: заморозка streak
 newStatus = 'paused';
 // Обновить БД внутри транзакции
 await tx.update(schema.users)
 .set({
 streak_status: newStatus,
 last_streak_update: date,
 })
 .where(eq(schema.users.id, userId))
 .execute();
 user.streak_status = newStatus;
 user.last_streak_update = date;
 console.log(`No tasks for user ${userId} on ${date} - streak paused`);
 } else if (tasksCompleted === tasksAssigned) {
 // Все задачи выполнены
 newStreak += 1;
 newStatus = 'active';

 // Обновить best_streak
 const newBestStreak = Math.max(dbUser.best_streak || 0, newStreak);

 console.log(` All tasks completed for user ${userId} - streak: ${newStreak}`);

 // Milestone check (вызывается вне транзакции)
 if ([3, 7, 10].includes(newStreak)) {
 milestoneReached = newStreak;
 }

 // Обновить БД внутри транзакции
 await tx.update(schema.users)
 .set({
 current_streak: newStreak,
 best_streak: newBestStreak,
 streak_status: newStatus,
 last_streak_update: date,
 })
 .where(eq(schema.users.id, userId))
 .execute();

 // Обновить appState
 user.current_streak = newStreak;
 user.best_streak = newBestStreak;
 user.streak_status = newStatus;
 user.last_streak_update = date;

 } else {
 // Не все задачи выполнены
 if (dbUser.streak_freeze_available) {
 // Используем freeze
 newStatus = 'frozen';
 
 await tx.update(schema.users)
 .set({
 streak_freeze_available: false,
 streak_freeze_last_used: new Date(),
 streak_status: newStatus,
 last_streak_update: date,
 })
 .where(eq(schema.users.id, userId))
 .execute();

 user.streak_freeze_available = false;
 user.streak_freeze_last_used = new Date().toISOString();
 user.streak_status = newStatus;
 user.last_streak_update = date;

 console.log(` Streak saved for user ${userId} using freeze`);
 } else {
 // Сброс streak
 newStreak = 0;
 newStatus = 'broken';

 await tx.update(schema.users)
 .set({
 current_streak: 0,
 streak_status: newStatus,
 last_streak_update: date,
 })
 .where(eq(schema.users.id, userId))
 .execute();

 user.current_streak = 0;
 user.streak_status = newStatus;
 user.last_streak_update = date;

 console.log(` Streak broken for user ${userId}`);
 }
 }

 postCommit = { newStatus, milestoneReached };
 });
 } catch (error) {
 Object.assign(user, memoryBefore);
 throw error;
 }

 if (!postCommit) return;
 const committed = postCommit as { newStatus: StreakStatus; milestoneReached: number | null };
 // Внешние транзакции и сеть запускаются только после освобождения FOR UPDATE.
 if (committed.milestoneReached) {
 await notifyMilestone(userId, committed.milestoneReached, io);
 }
 await Promise.all([
 committed.newStatus === 'frozen' ? notifyStreakSaved(userId, io) : Promise.resolve(),
 committed.newStatus === 'broken' ? notifyStreakBroken(userId, io) : Promise.resolve(),
 committed.newStatus === 'paused' ? notifyStreakPaused(userId, user.current_streak || 0, io) : Promise.resolve(),
 ]);
 emitToUserFamily(io, user, 'streak_updated', {
 userId,
 userName: user.display_name,
 current_streak: user.current_streak,
 status: user.streak_status,
 milestone: committed.milestoneReached,
 bonus_percentage: getStreakBonus(user.current_streak || 0),
 });
}

/**
 * Купить Streak Freeze за золото или кристаллы.
 * 
 * BUG #3 FIX: Исправлен расчет дней с учетом полуночи.
 * 
 * Цена: 500 золота ИЛИ 50 кристаллов.
 * Лимит: 1 раз в неделю.
 */
export async function purchaseStreakFreeze(
 userId: number,
 paymentType: 'gold' | 'crystals'
): Promise<{ success: boolean; error?: string }> {
 const user = appState.users.find(u => u.id === userId);
 if (!user) {
 return { success: false, error: 'User not found' };
 }

 try {
 const persisted = await db.transaction(async (tx) => {
   const [dbUser] = await tx.select().from(schema.users)
     .where(eq(schema.users.id, userId)).for('update').limit(1);
   if (!dbUser) return { status: 'missing' as const };
   if (dbUser.streak_freeze_available) return { status: 'active' as const };

   if (dbUser.streak_freeze_last_used) {
     const lastFreezeDate = new Date(dbUser.streak_freeze_last_used);
     const now = new Date();
     lastFreezeDate.setHours(0, 0, 0, 0);
     now.setHours(0, 0, 0, 0);
     const daysSinceFreeze = Math.floor(
       (now.getTime() - lastFreezeDate.getTime()) / (1000 * 60 * 60 * 24),
     );
     if (daysSinceFreeze < 7) {
       return { status: 'cooldown' as const, daysLeft: 7 - daysSinceFreeze };
     }
   }

   if (paymentType === 'gold' && dbUser.gold < 500) return { status: 'gold' as const };
   if (paymentType === 'crystals' && dbUser.crystals < 50) return { status: 'crystals' as const };
   const purchaseDate = new Date();
   const [updated] = await tx.update(schema.users).set({
     gold: paymentType === 'gold' ? dbUser.gold - 500 : dbUser.gold,
     crystals: paymentType === 'crystals' ? dbUser.crystals - 50 : dbUser.crystals,
     streak_freeze_available: true,
     streak_freeze_last_used: purchaseDate,
   }).where(eq(schema.users.id, userId)).returning();
   return { status: 'purchased' as const, updated };
 });

 if (persisted.status === 'missing') return { success: false, error: 'User not found' };
 if (persisted.status === 'active') {
   return { success: false, error: 'У вас уже есть активный Streak Freeze' };
 }
 if (persisted.status === 'cooldown') {
   return {
     success: false,
     error: `Streak Freeze можно купить раз в неделю. Осталось: ${persisted.daysLeft} дн.`,
   };
 }
 if (persisted.status === 'gold') {
   return { success: false, error: 'Недостаточно золота (нужно 500)' };
 }
 if (persisted.status === 'crystals') {
   return { success: false, error: 'Недостаточно кристаллов (нужно 50)' };
 }

 user.gold = persisted.updated.gold;
 user.crystals = persisted.updated.crystals;
 user.streak_freeze_available = true;
 user.streak_freeze_last_used = persisted.updated.streak_freeze_last_used?.toISOString();
 console.log(`User ${userId} purchased Streak Freeze for ${paymentType}`);
 return { success: true };
 } catch (error) {
 console.error(`[streak] freeze purchase failed for ${userId}:`, error);
 return { success: false, error: 'Ошибка базы данных, попробуйте ещё раз' };
 }
}
