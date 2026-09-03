/**
 * Роуты пользователей.
 * POST /class — установить класс персонажа.
 * POST /gender — установить пол.
 * POST /update-character — кастомизация (тон, причёска, глаза, ава).
 * POST /custom-background — пользовательский фон.
 * POST /custom-avatar — URL аватара.
 * POST /reset — сброс прогресса.
 * POST /register — регистрация нового героя.
 *
 * Примечание: /api/user/reset из оригинала перенесён в /api/users/reset
 * для единообразия путей (был единственным роутом с единственным числом).
 */
import { Request, Response, Router } from 'express';
import { db } from '../db';
import * as schema from '../db/schema';
import { eq } from 'drizzle-orm';
import { appState } from '../services/stateService';
import { persistProfile } from '../services/userService';
import { processReferral } from '../services/referralService';
import { getStreakBonus, checkAllTasksCompleted, getTasksForDate, purchaseStreakFreeze } from '../services/streakService';
import { generateDailyTasks, calculateReward, seededRandom, getEffectiveTaskType } from '../services/taskGenerator';
import { valueColor } from '../services/habitService';
import { getTodayStr } from '../lib/dateUtils';
import { isAuthEnforced, type AuthedRequest } from '../utils/apiAuth';
import type { ShopItem, User } from '../types';

export const userRoutes = Router();

/**
 * РОЛЕВАЯ МОДЕЛЬ (Этап R1): CRUD пользователей.
 * Все операции — только для админов (родителей). Дети — без ограничений по количеству.
 */

// Проверка админа: request body должен содержать actorId (кто выполняет операцию).
// В production (auth включён) actorId дополнительно сверяется с подписанным
// пользователем из initData (req.auth) — подделать админ-действие извне нельзя.
// В dev — унаследованное поведение по actorId из body.
function isAdmin(req: AuthedRequest, actorId: number | undefined): boolean {
 if (!actorId) return false;
 if (isAuthEnforced()) {
   if (!req.auth) return false;
   if (req.auth.userId !== actorId) return false;
   return req.auth.isAdmin;
 }
 const actor = appState.users.find((u) => u.id === actorId);
 return !!actor && (actor.is_admin || actor.family_role === 'parent');
}

/** GET /api/users — все пользователи семьи */
userRoutes.get('/', (req: Request, res: Response) => {
 const users = appState.users.map((u) => ({
 id: u.id,
 telegram_id: u.telegram_id,
 display_name: u.display_name,
 family_role: u.family_role || 'child',
 is_admin: !!u.is_admin,
 gender: u.gender || null,
 age: u.age ?? null,
 class: u.class,
 gold: u.gold,
 xp: u.xp,
 crystals: u.crystals || 0,
 current_streak: u.current_streak,
 best_streak: u.best_streak || 0,
 streak_status: u.streak_status || 'active',
 avatar_url: u.custom_avatar_url || null,
 }));
 res.json({ success: true, data: users });
});

/** GET /api/users/:id — один пользователь */
userRoutes.get('/:id', (req: Request, res: Response) => {
 const userId = parseInt(req.params.id);
 const user = appState.users.find((u) => u.id === userId);
 if (!user) return res.status(404).json({ error: 'User not found' });
 res.json({ success: true, data: user });
});

/** POST /api/users — добавить ребёнка (только админ). ARC-02: family_id — из семьи актора. */
userRoutes.post('/', async (req: AuthedRequest, res: Response) => {
 try {
 const { actorId, display_name, age, gender } = req.body;
 if (!isAdmin(req, Number(actorId))) {
 return res.status(403).json({ error: 'Только родитель (админ) может добавлять пользователей' });
 }
 const actor = appState.users.find((u) => u.id === Number(actorId));
 const actorFamilyId = (actor as any)?.family_id ?? 1;
 if (!display_name || typeof display_name !== 'string' || !display_name.trim()) {
 return res.status(400).json({ error: 'Укажите имя' });
 }

 const nameExists = appState.users.some(
 (u) => u.display_name.trim().toLowerCase() === display_name.trim().toLowerCase()
 );
 if (nameExists) {
 return res.status(400).json({ error: 'Имя уже занято' });
 }

 const newId = Math.max(...appState.users.map((u) => u.id), 0) + 1;
 const newUser: User = {
 id: newId,
 telegram_id: 100000 + newId,
 display_name: display_name.trim(),
 family_role: 'child',
 is_admin: false,
 assignee: 'both',
 gender: gender === 'female' ? 'female' : gender === 'male' ? 'male' : undefined,
 age: age && Number(age) > 0 ? Number(age) : 8,
 gold: 0,
 xp: 0,
 crystals: 0,
 current_streak: 0,
 best_streak: 0,
 streak_status: 'active',
 class: 'warrior',
 skill_date: null,
 notify_partner: 1,
 equipped: {},
 pets: [],
 };

 appState.users.push(newUser);

 // В БД (async, non-blocking)
 db.insert(schema.users).values({
 telegram_id: newUser.telegram_id,
 family_id: actorFamilyId,
 role: 'child',
 family_role: 'child',
 is_admin: false,
 display_name: newUser.display_name,
 class_type: 'warrior',
 gold: 0,
 xp: 0,
 crystals: 0,
 hp: 50,
 max_hp: 50,
 mp: 30,
 max_mp: 30,
 current_streak: 0,
 best_streak: 0,
 streak_status: 'active',
 gender: newUser.gender,
 assignee: 'both',
 notify_partner: 1,
 age: newUser.age,
 }).execute().catch((e) => console.error('DB Insert error (new child):', e));

 res.json({ success: true, user: newUser });
 } catch (error: any) {
 console.error('Error adding user:', error);
 res.status(500).json({ success: false, error: error.message });
 }
});

/** PUT /api/users/:id — редактировать имя/возраст (только админ) */
userRoutes.put('/:id', async (req: AuthedRequest, res: Response) => {
 try {
 const userId = parseInt(req.params.id);
 const { actorId, display_name, age, gender } = req.body;
 if (!isAdmin(req, Number(actorId))) {
 return res.status(403).json({ error: 'Только родитель (админ) может редактировать' });
 }
 const user = appState.users.find((u) => u.id === userId);
 if (!user) return res.status(404).json({ error: 'User not found' });

 if (display_name !== undefined) {
 if (typeof display_name !== 'string' || !display_name.trim()) {
 return res.status(400).json({ error: 'Некорректное имя' });
 }
 user.display_name = display_name.trim();
 }
 if (age !== undefined) {
 const a = Number(age);
 if (!Number.isFinite(a) || a < 4 || a > 99) {
 return res.status(400).json({ error: 'Возраст должен быть от 4 до 99' });
 }
 user.age = a;
 }
 if (gender !== undefined) {
 user.gender = gender === 'female' ? 'female' : gender === 'male' ? 'male' : user.gender;
 }

 db.update(schema.users).set({
 display_name: user.display_name,
 age: user.age,
 gender: user.gender,
 }).where(eq(schema.users.id, userId)).execute().catch((e) => console.error('DB Update error (user):', e));

 res.json({ success: true, user });
 } catch (error: any) {
 console.error('Error updating user:', error);
 res.status(500).json({ success: false, error: error.message });
 }
});

/** DELETE /api/users/:id — удалить (только админ, нельзя удалить админа) */
userRoutes.delete('/:id', async (req: AuthedRequest, res: Response) => {
 try {
 const userId = parseInt(req.params.id);
 const { actorId } = req.body;
 if (!isAdmin(req, Number(actorId))) {
 return res.status(403).json({ error: 'Только родитель (админ) может удалять' });
 }
 const user = appState.users.find((u) => u.id === userId);
 if (!user) return res.status(404).json({ error: 'User not found' });
 if (user.is_admin || user.family_role === 'parent') {
 return res.status(400).json({ error: 'Нельзя удалить родителя' });
 }

 appState.users = appState.users.filter((u) => u.id !== userId);
 db.delete(schema.users).where(eq(schema.users.id, userId)).execute()
 .catch((e) => console.error('DB Delete error (user):', e));

 res.json({ success: true, message: 'Пользователь удалён' });
 } catch (error: any) {
 console.error('Error deleting user:', error);
 res.status(500).json({ success: false, error: error.message });
 }
});

userRoutes.get('/:id/streak', async (req: Request, res: Response) => {
 try {
 const userId = parseInt(req.params.id);
 const user = appState.users.find((u) => u.id === userId);
 if (!user) return res.status(404).json({ error: 'User not found' });

 const todayStr = getTodayStr();
 // БАГ #5 FIX: единый источник правды — generateDailyTasks (как в tasks/today)
 const userTasks = generateDailyTasks(user, appState.tasks, new Date(todayStr));
 const userTaskIds = new Set(userTasks.map((t) => t.id));

 // BUG #7 FIX: Считаем ТОЛЬКО выполненные задачи из расписания на сегодня,
 // а не все completions за день (кастомные задачи в подсчёт не входят)
 const completedTaskIds = appState.completions
 .filter((c) => c.user_id === userId && c.completed_at === todayStr && userTaskIds.has(c.task_id))
 .map((c) => c.task_id);

 const tasksCompletedToday = completedTaskIds.length;
 const tasksTotalToday = userTasks.length;
 const allCompleted = checkAllTasksCompleted(userId, todayStr);

 res.json({
 success: true,
 data: {
 current_streak: user.current_streak || 0,
 best_streak: user.best_streak || 0,
 status: user.streak_status || 'active',
 bonus_percentage: getStreakBonus(user.current_streak || 0),
 freeze_available: user.streak_freeze_available || false,
 tasks_completed_today: tasksCompletedToday,
 tasks_total_today: tasksTotalToday,
 all_completed: allCompleted,
 },
 });
 } catch (error: any) {
 console.error('Error fetching user streak:', error);
 res.status(500).json({ success: false, error: error.message });
 }
});

userRoutes.post('/:id/streak/freeze', async (req: Request, res: Response) => {
 try {
 const userId = parseInt(req.params.id);
 const { paymentType } = req.body;

 if (!paymentType || !['gold', 'crystals'].includes(paymentType)) {
 return res.status(400).json({ 
 success: false, 
 error: 'paymentType должен быть "gold" или "crystals"' 
 });
 }

 const result = await purchaseStreakFreeze(userId, paymentType);

 if (!result.success) {
 return res.status(400).json(result);
 }

 // Broadcast update
 const io = req.app.get('io');
 if (io) {
 io.emit('stateUpdate');
 }

 res.json({
 success: true,
 message: 'Streak Freeze успешно куплен! Твоя серия будет защищена при пропуске дня.',
 });
 } catch (error: any) {
 console.error('Error purchasing streak freeze:', error);
 res.status(500).json({ success: false, error: error.message });
 }
});

/**
 * GET /api/users/:id/tasks/today
 * Возвращает сгенерированный список задач на сегодня (или на переданную дату)
 * с разделением: required / choice / quests + summary.
 */
userRoutes.get('/:id/tasks/today', async (req: Request, res: Response) => {
 try {
 const userId = parseInt(req.params.id);
 const user = appState.users.find((u) => u.id === userId);
 if (!user) return res.status(404).json({ error: 'User not found' });

 // Поддержка ?date=YYYY-MM-DD для тестирования
 const dateParam = typeof req.query.date === 'string' ? req.query.date : null;
 const date = dateParam ? new Date(dateParam) : new Date();
 const dateStr = dateParam || getTodayStr();

 const tasks = generateDailyTasks(user, appState.tasks, date);

 const completedTaskIds = appState.completions
 .filter((c) => c.user_id === userId && c.completed_at === dateStr)
 .map((c) => c.task_id);

 // Вспомогательная функция: сериализуем задачу для API
 // БАГ #3 FIX: seeded random от (date+userId+taskId) — детерминированная награда
 const serializeTask = (t: (typeof tasks)[number]) => {
 const rewardRand = seededRandom(`${dateStr}:${user.id}:${t.id}`);
 const reward = calculateReward(t, user, rewardRand);
 // Habitica decay (Этап 4): ценность задачи влияет на награду и цвет
 const tAny = t as any;
 const taskValue = typeof tAny.value === 'number' ? tAny.value : 0;
 const vMult = valueColor(taskValue).goldMultiplier;
 return {
 id: t.id,
 code: t.code,
 title: t.title,
 points: Math.max(1, Math.round(reward.gold * vMult)), // итоговая награда с учётом decay
 value: taskValue,
 category: t.category ?? null,
 task_type: t.task_type,
 is_required: !!t.is_required,
 done: completedTaskIds.includes(t.id),
 crystals: reward.crystals,
 };
 };

 // БАГ #2 (продолжение): разделение по типам с учётом нормализации старых задач
 const required = tasks
 .filter((t) => getEffectiveTaskType(t) === 'personal' && t.is_required)
 .map(serializeTask);
 const choice = tasks
 .filter((t) => {
 const et = getEffectiveTaskType(t);
 return et === 'core' || (et === 'personal' && !t.is_required);
 })
 .map(serializeTask);
 const quests = tasks
 .filter((t) => getEffectiveTaskType(t) === 'quest')
 .map(serializeTask);

 const requiredTotal = required.length;
 const requiredDone = required.filter((t) => t.done).length;
 const allRequiredDone = requiredTotal > 0 && requiredDone === requiredTotal;
 const total = tasks.length;
 const doneTotal = tasks.filter((t) => completedTaskIds.includes(t.id)).length;
 const progressPercent = total === 0 ? 0 : Math.round((doneTotal / total) * 100);

 res.json({
 success: true,
 data: {
 date: dateStr,
 user: {
 id: user.id,
 display_name: user.display_name,
 age: user.age ?? 8,
 },
 required,
 choice,
 quests,
 summary: {
 total,
 required_done: requiredDone,
 required_total: requiredTotal,
 all_required_done: allRequiredDone,
 progress_percent: progressPercent,
 },
 },
 });
 } catch (error: any) {
 console.error('Error fetching today tasks:', error);
 res.status(500).json({ success: false, error: error.message });
 }
});

userRoutes.post('/class', (req: Request, res: Response) => {
 const { userId, className } = req.body;
 const user = appState.users.find((u) => u.id === Number(userId));
 if (!user) return res.status(404).json({ error: 'User not found' });

 user.class = className;
 // Сохранить профиль в БД
 persistProfile(user);

 res.json({ success: true, user });
});

userRoutes.post('/gender', (req: Request, res: Response) => {
 const { userId, gender } = req.body;
 const user = appState.users.find((u) => u.id === Number(userId));
 if (!user) return res.status(404).json({ error: 'User not found' });

 user.gender = gender === 'female' ? 'female' : 'male';
 // Сохранить профиль в БД
 persistProfile(user);

 res.json({ success: true, user });
});

userRoutes.post('/update-character', (req: Request, res: Response) => {
 const { userId, gender, character_color, skin_tone, hair_style, hair_color, eye_color, custom_avatar_url, habitica_equipped } = req.body;
 const user = appState.users.find((u) => u.id === Number(userId));
 if (!user) return res.status(404).json({ error: 'User not found' });

 if (gender) user.gender = gender;
 if (character_color) user.character_color = character_color;
 if (skin_tone) user.skin_tone = skin_tone;
 if (hair_style) user.hair_style = hair_style;
 if (hair_color) user.hair_color = hair_color;
 if (eye_color) user.eye_color = eye_color;
 if (custom_avatar_url !== undefined) user.custom_avatar_url = custom_avatar_url;
 // Habitica V3: образ (кожа/причёска/сет) хранится как jsonb
 if (habitica_equipped !== undefined) {
   const merged = { ...((user as any).habitica_equipped || {}), ...habitica_equipped };
   (user as any).habitica_equipped = merged;
 }
 // Сохранить профиль в БД
 persistProfile(user);

 res.json({ success: true, user });
});

userRoutes.post('/custom-background', (req: Request, res: Response) => {
 const { userId, bgUrl } = req.body;
 const user = appState.users.find((u) => u.id === Number(userId));
 if (!user) return res.status(404).json({ error: 'Пользователь не найден' });

 // Create a custom background item in shop, then own & equip it
 const newBackgroundId = appState.shopItems.length + 1000 + Math.floor(Math.random() * 9000);
 const newBgItem: ShopItem = {
 id: newBackgroundId,
 code: bgUrl,
 title: 'Пользовательский Фон',
 emoji: '',
 slot: 'background',
 cost: 0,
 };

 appState.shopItems.push(newBgItem);

 // Unequip current backgrounds for user
 for (const ui of appState.userItems) {
 if (ui.user_id === user.id && ui.equipped) {
 const item = appState.shopItems.find((s) => s.id === ui.item_id);
 if (item && item.slot === 'background') {
 ui.equipped = 0;
 }
 }
 }

 // Add and equip
 appState.userItems.push({
 user_id: user.id,
 item_id: newBackgroundId,
 equipped: 1,
 });

 res.json({ success: true, message: 'Установлен новый AI фон !' });
});

userRoutes.post('/custom-avatar', (req: Request, res: Response) => {
 const { userId, avatarUrl } = req.body;
 const user = appState.users.find((u) => u.id === Number(userId));
 if (!user) return res.status(404).json({ error: 'Пользователь не найден' });

 user.custom_avatar_url = avatarUrl;
 // Сохранить профиль в БД
 persistProfile(user);

 res.json({ success: true, message: 'Аватар успешно обновлён!' });
});

userRoutes.post('/reset', (req: Request, res: Response) => {
 const { userId } = req.body;
 const user = appState.users.find((u) => u.id === Number(userId));
 if (!user) return res.status(404).json({ error: 'User not found' });

 user.gold = 0;
 user.xp = 0;
 user.current_streak = 0;
 user.skill_date = null;

 res.json({ success: true, user });
});

userRoutes.post('/register', async (req: Request, res: Response) => {
 const {
 name,
 classKey = 'warrior',
 gender = 'male',
 familyCode,
 customAvatarUrl,
 character_color,
 color,
 refCode,
 age,
 telegram_id,
 } = req.body;

 if (!name || typeof name !== 'string' || !name.trim()) {
 return res.status(400).json({ error: 'Укажите корректное имя пользователя' });
 }

 const trimmedName = name.trim();

 // Check name uniqueness (case-insensitive)
 const nameExists = appState.users.some(
 (u) => u.display_name.trim().toLowerCase() === trimmedName.toLowerCase()
 );
 if (nameExists) {
 return res.status(400).json({
 error: `Имя «${trimmedName}» уже занято другим героем в семье! Пожалуйста, укажите уникальное имя.`,
 });
 }

 const selectedColor = character_color || color || '#f59e0b';
 const newId = Math.max(...appState.users.map((u) => u.id), 0) + 1;

 // РОЛЕВАЯ МОДЕЛЬ (Этап R1): первый пользователь — родитель (admin), остальные — дети
 const isFirstUser = appState.users.length === 0;
 const familyRole: 'parent' | 'child' = isFirstUser ? 'parent' : 'child';
 const isAdmin = isFirstUser;

 const newUser: User = {
 id: newId,
 telegram_id: 100000 + newId,
 display_name: trimmedName,
 family_role: familyRole,
 is_admin: isAdmin,
 assignee: 'both',
 gold: isFirstUser ? 0 : 50,
 xp: 0,
 crystals: isFirstUser ? 0 : 10,
 current_streak: 0,
 best_streak: 0,
 streak_status: isFirstUser ? 'paused' : 'active',
 streak_freeze_available: false,
 class: isFirstUser ? '' : ((classKey as any) || 'warrior'),
 gender: gender === 'female' ? 'female' : 'male',
 character_color: selectedColor,
 color: selectedColor,
 hp: 50,
 max_hp: 50,
 mp: 30,
 max_mp: 30,
 custom_avatar_url: customAvatarUrl,
 skill_date: null,
 notify_partner: 1,
 age: age && Number(age) > 0 ? Number(age) : 8,
 equipped: {},
 pets: [],
 referral_code: `ref_${newId}`,
 referrals_count: 0,
 referral_earnings_gold: 0,
 referral_earnings_crystals: 0,
 };

 appState.users.push(newUser);

 // ARC-02: family_id резолвится по коду семьи (не хардкод 1).
 // Код из body (RegistrationModal) → поиск в families; не найден → 404;
 // не передан → первая существующая семья (совместимость с текущей демо-семьёй).
 let resolvedFamilyId = 1;
 try {
 if (familyCode) {
 const famRows = await db.select().from(schema.families)
 .where(eq(schema.families.family_code, String(familyCode).trim())).limit(1);
 if (famRows.length > 0) {
 resolvedFamilyId = famRows[0].id;
 } else {
 // откат in-memory добавления — семья не найдена
 appState.users.pop();
 return res.status(404).json({ error: 'Код семьи не найден. Проверьте код у родителя.' });
 }
 }
 } catch (e) {
 console.error('[users/register] family lookup failed:', e);
 }

 // Update DB (async)
 db.insert(schema.users).values({
 telegram_id: newUser.telegram_id,
 family_id: resolvedFamilyId,
 role: familyRole === 'parent' ? 'parent' : 'child',
 family_role: familyRole,
 is_admin: isAdmin,
 display_name: newUser.display_name,
 class_type: newUser.class || 'warrior',
 gold: newUser.gold,
 xp: newUser.xp,
 crystals: newUser.crystals || 0,
 hp: newUser.hp || 50,
 max_hp: newUser.max_hp || 50,
 mp: newUser.mp || 30,
 max_mp: newUser.max_mp || 30,
 current_streak: newUser.current_streak || 0,
 best_streak: newUser.best_streak || 0,
 streak_status: newUser.streak_status || 'active',
 streak_freeze_available: newUser.streak_freeze_available || false,
 gender: newUser.gender,
 character_color: newUser.character_color,
 assignee: newUser.assignee,
 notify_partner: newUser.notify_partner,
 age: newUser.age,
 referral_code: newUser.referral_code,
 referred_by: newUser.referred_by
 }).execute().catch(e => console.error('DB Insert error (user):', e));

 // Give starter item to new user
 appState.userItems.push({
 user_id: newId,
 item_id: classKey === 'mage' ? 2 : 1, // Staff or Sword
 equipped: 1,
 });

 let referralMessage = '';
 if (refCode) {
 const refResult = processReferral(newUser, refCode);
 if (refResult.success) {
 referralMessage = refResult.message;
 }
 }

 res.json({ success: true, user: newUser, referralMessage });
});
