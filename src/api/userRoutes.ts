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
import { randomInt } from 'node:crypto';
import { Response, Router } from 'express';
import { db } from '../db';
import * as schema from '../db/schema';
import { and, eq, inArray } from 'drizzle-orm';
import { appState } from '../services/stateService';
import { persistProfile } from '../services/userService';
import { toStateUser } from '../services/userStateHydration';
import { processReferral } from '../services/referralService';
import { getStreakBonus, checkAllTasksCompleted, purchaseStreakFreeze } from '../services/streakService';
import { generateDailyTasks } from '../services/taskGenerator';
import { buildTodayTasksData } from '../services/todayTasksService';
import { getTodayStr } from '../lib/dateUtils';
import {
 canAccessUser,
 canActOn,
 getAuthFamilyId,
 getUserFamilyId,
 isAuthEnforced,
 requireAdmin,
 type AuthedRequest,
} from '../utils/apiAuth';
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

/** Все мутации этого роутера совершаются родителем и подписываются actorId. */
function requireAdminActor(req: AuthedRequest, res: Response, targetUserId?: number): boolean {
 const actorId = Number(req.body?.actorId);
 if (isAdmin(req, actorId)) {
   if (targetUserId === undefined) return true;
   if (isAuthEnforced()) {
     if (canActOn(req, targetUserId)) return true;
   } else {
     const actor = appState.users.find((u) => u.id === actorId);
     const target = appState.users.find((u) => u.id === targetUserId);
     const actorFamilyId = getUserFamilyId(actor) ?? appState.family?.id ?? null;
     const targetFamilyId = getUserFamilyId(target);
     if (actorFamilyId !== null && targetFamilyId === actorFamilyId) return true;
   }
 }
 res.status(403).json({ error: 'Только родитель (админ) может изменять профили' });
 return false;
}

async function commitProfileChange(user: User, change: (draft: User) => void): Promise<boolean> {
 const draft = structuredClone(user);
 change(draft);
 if (!(await persistProfile(draft))) return false;
 Object.assign(user, draft);
 return true;
}

/** GET /api/users — все пользователи семьи */
userRoutes.get('/', (req: AuthedRequest, res: Response) => {
 if (!requireAdmin(req)) {
   return res.status(403).json({ error: 'Forbidden: admin only' });
 }
 const authFamilyId = getAuthFamilyId(req);
 if (isAuthEnforced() && authFamilyId === null) {
   return res.status(403).json({ error: 'Forbidden: user has no family' });
 }
 const visibleUsers = isAuthEnforced()
   ? appState.users.filter((u) => getUserFamilyId(u) === authFamilyId)
   : appState.users;
 const users = visibleUsers.map((u) => ({
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
userRoutes.get('/:id', (req: AuthedRequest, res: Response) => {
 const userId = parseInt(req.params.id);
 const user = appState.users.find((u) => u.id === userId);
 if (!user) return res.status(404).json({ error: 'User not found' });
 if (!canAccessUser(req, userId)) return res.status(403).json({ error: 'Forbidden: not your family' });
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
 const actorFamilyId = getUserFamilyId(actor) ?? (!isAuthEnforced() ? appState.family?.id ?? null : null);
 if (actorFamilyId === null) {
 return res.status(400).json({ error: 'У родителя не назначена семья' });
 }
 if (!display_name || typeof display_name !== 'string' || !display_name.trim()) {
 return res.status(400).json({ error: 'Укажите имя' });
 }

 const nameExists = appState.users.some(
 (u) => getUserFamilyId(u) === actorFamilyId && u.display_name.trim().toLowerCase() === display_name.trim().toLowerCase()
 );
 if (nameExists) {
 return res.status(400).json({ error: 'Имя уже занято' });
 }

 let newUser: User;
 try {
 const created = await db.transaction(async (tx) => {
   const familyUsers = await tx.select({ display_name: schema.users.display_name })
     .from(schema.users)
     .where(eq(schema.users.family_id, actorFamilyId))
     .for('update');
   if (familyUsers.some((candidate) =>
     candidate.display_name.trim().toLowerCase() === display_name.trim().toLowerCase()
   )) {
     throw new Error('NAME_TAKEN');
   }
   const [row] = await tx.insert(schema.users).values({
     telegram_id: -(Date.now() * 1000 + randomInt(1000)),
     family_id: actorFamilyId,
     role: 'child',
     family_role: 'child',
     is_admin: false,
     display_name: display_name.trim(),
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
     gender: gender === 'female' ? 'female' : gender === 'male' ? 'male' : undefined,
     assignee: 'both',
     notify_partner: 1,
     age: age && Number(age) > 0 ? Number(age) : 8,
   }).returning();
   return row;
 });
 newUser = toStateUser(created);
 appState.users.push(newUser);
 } catch (e) {
 if (e instanceof Error && e.message === 'NAME_TAKEN') {
   return res.status(409).json({ error: 'Имя уже занято' });
 }
 console.error('[users] DB insert failed for managed child:', e);
 return res.status(500).json({ error: 'Ошибка базы данных, попробуйте ещё раз' });
 }

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
 const user = appState.users.find((u) => u.id === userId);
 if (!user) return res.status(404).json({ error: 'User not found' });
 if (!requireAdminActor(req, res, userId)) return;

 let nextDisplayName = user.display_name;
 let nextAge = user.age;
 let nextGender = user.gender;
 if (display_name !== undefined) {
 if (typeof display_name !== 'string' || !display_name.trim()) {
 return res.status(400).json({ error: 'Некорректное имя' });
 }
 nextDisplayName = display_name.trim();
 const duplicateName = appState.users.some((candidate) =>
   candidate.id !== user.id
   && candidate.family_id === user.family_id
   && candidate.display_name.trim().toLowerCase() === nextDisplayName.toLowerCase()
 );
 if (duplicateName) return res.status(409).json({ error: 'Имя уже занято' });
 }
 if (age !== undefined) {
 const a = Number(age);
 if (!Number.isFinite(a) || a < 4 || a > 99) {
 return res.status(400).json({ error: 'Возраст должен быть от 4 до 99' });
 }
 nextAge = a;
 }
 if (gender !== undefined) {
 nextGender = gender === 'female' ? 'female' : gender === 'male' ? 'male' : user.gender;
 }

 const updated = await db.update(schema.users).set({
 display_name: nextDisplayName,
 age: nextAge,
 gender: nextGender,
 }).where(eq(schema.users.id, userId)).returning({ id: schema.users.id });
 if (updated.length === 0) return res.status(404).json({ error: 'User not found' });
 user.display_name = nextDisplayName;
 user.age = nextAge;
 user.gender = nextGender;

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
 const user = appState.users.find((u) => u.id === userId);
 if (!user) return res.status(404).json({ error: 'User not found' });
 if (!requireAdminActor(req, res, userId)) return;
 if (user.is_admin || user.family_role === 'parent') {
 return res.status(400).json({ error: 'Нельзя удалить родителя' });
 }

 const deleted = await db.delete(schema.users).where(eq(schema.users.id, userId))
 .returning({ id: schema.users.id });
 if (deleted.length === 0) return res.status(404).json({ error: 'User not found' });
 appState.users = appState.users.filter((u) => u.id !== userId);

 res.json({ success: true, message: 'Пользователь удалён' });
 } catch (error: any) {
 console.error('Error deleting user:', error);
 res.status(500).json({ success: false, error: error.message });
 }
});

userRoutes.get('/:id/streak', async (req: AuthedRequest, res: Response) => {
 try {
 const userId = parseInt(req.params.id);
 const user = appState.users.find((u) => u.id === userId);
 if (!user) return res.status(404).json({ error: 'User not found' });
 if (!canAccessUser(req, userId)) return res.status(403).json({ error: 'Forbidden: not your family' });

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

userRoutes.post('/:id/streak/freeze', async (req: AuthedRequest, res: Response) => {
 try {
 const userId = parseInt(req.params.id);
 const { paymentType } = req.body;
 if (!requireAdminActor(req, res, userId)) return;

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
 const familyId = getUserFamilyId(appState.users.find((user) => user.id === userId));
 if (io && familyId !== null) {
 io.to(`family:${familyId}`).emit('stateUpdate');
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
userRoutes.get('/:id/tasks/today', async (req: AuthedRequest, res: Response) => {
 try {
 const userId = parseInt(req.params.id);
 const user = appState.users.find((u) => u.id === userId);
 if (!user) return res.status(404).json({ error: 'User not found' });
 if (!canAccessUser(req, userId)) return res.status(403).json({ error: 'Forbidden: not your family' });

 // Поддержка ?date=YYYY-MM-DD для тестирования
 const dateParam = typeof req.query.date === 'string' ? req.query.date : undefined;
 const data = buildTodayTasksData(userId, dateParam);
 if (!data) return res.status(400).json({ error: 'Invalid date' });
 res.json({ success: true, data });
 } catch (error: any) {
 console.error('Error fetching today tasks:', error);
 res.status(500).json({ success: false, error: error.message });
 }
});

userRoutes.post('/class', async (req: AuthedRequest, res: Response) => {
 const { userId, className } = req.body;
 if (!requireAdminActor(req, res, Number(userId))) return;
 const user = appState.users.find((u) => u.id === Number(userId));
 if (!user) return res.status(404).json({ error: 'User not found' });
 if (!['warrior', 'mage', 'rogue', 'healer'].includes(className)) {
 return res.status(400).json({ error: 'Некорректный класс' });
 }

 if (!(await commitProfileChange(user, (draft) => { draft.class = className; }))) {
 return res.status(500).json({ error: 'Ошибка базы данных, попробуйте ещё раз' });
 }

 res.json({ success: true, user });
});

userRoutes.post('/gender', async (req: AuthedRequest, res: Response) => {
 const { userId, gender } = req.body;
 if (!requireAdminActor(req, res, Number(userId))) return;
 const user = appState.users.find((u) => u.id === Number(userId));
 if (!user) return res.status(404).json({ error: 'User not found' });

 if (!(await commitProfileChange(user, (draft) => {
 draft.gender = gender === 'female' ? 'female' : 'male';
 }))) return res.status(500).json({ error: 'Ошибка базы данных, попробуйте ещё раз' });

 res.json({ success: true, user });
});

userRoutes.post('/update-character', async (req: AuthedRequest, res: Response) => {
 const { userId, gender, character_color, skin_tone, hair_style, hair_color, eye_color, custom_avatar_url, habitica_equipped } = req.body;
 if (!requireAdminActor(req, res, Number(userId))) return;
 const user = appState.users.find((u) => u.id === Number(userId));
 if (!user) return res.status(404).json({ error: 'User not found' });

 const saved = await commitProfileChange(user, (draft) => {
 if (gender) draft.gender = gender;
 if (character_color) draft.character_color = character_color;
 if (skin_tone) draft.skin_tone = skin_tone;
 if (hair_style) draft.hair_style = hair_style;
 if (hair_color) draft.hair_color = hair_color;
 if (eye_color) draft.eye_color = eye_color;
 if (custom_avatar_url !== undefined) draft.custom_avatar_url = custom_avatar_url;
 if (habitica_equipped !== undefined) {
   (draft as any).habitica_equipped = {
     ...((draft as any).habitica_equipped || {}),
     ...habitica_equipped,
   };
 }
 });
 if (!saved) return res.status(500).json({ error: 'Ошибка базы данных, попробуйте ещё раз' });

 res.json({ success: true, user });
});

userRoutes.post('/custom-background', async (req: AuthedRequest, res: Response) => {
 const { userId, bgUrl } = req.body;
 if (!requireAdminActor(req, res, Number(userId))) return;
 const user = appState.users.find((u) => u.id === Number(userId));
 if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
 if (typeof bgUrl !== 'string' || !bgUrl.trim()) {
 return res.status(400).json({ error: 'Некорректный URL фона' });
 }

 let created: typeof schema.items.$inferSelect;
 try {
 created = await db.transaction(async (tx) => {
   const [dbUser] = await tx.select({ id: schema.users.id }).from(schema.users)
     .where(eq(schema.users.id, user.id)).for('update').limit(1);
   if (!dbUser) throw new Error('USER_NOT_FOUND');
   const [item] = await tx.insert(schema.items).values({
     name: 'Пользовательский фон',
     code: `custom_background_${user.id}_${Date.now()}`,
     type: 'background',
     sprite_url: bgUrl.trim(),
     cost_coins: 0,
   }).returning();
   const backgroundRows = await tx.select({ id: schema.items.id }).from(schema.items)
     .where(eq(schema.items.type, 'background'));
   const backgroundIds = backgroundRows.map((row) => row.id);
   if (backgroundIds.length > 0) {
     await tx.update(schema.character_inventory).set({ is_equipped: false })
       .where(and(
         eq(schema.character_inventory.character_id, user.id),
         inArray(schema.character_inventory.item_id, backgroundIds),
       ));
   }
   await tx.insert(schema.character_inventory).values({
     character_id: user.id,
     item_id: item.id,
     is_equipped: true,
   });
   return item;
 });
 } catch (error) {
 console.error('[users] custom background transaction failed:', error);
 return res.status(error instanceof Error && error.message === 'USER_NOT_FOUND' ? 404 : 500)
   .json({ error: 'Не удалось сохранить фон' });
 }

 const newBgItem: ShopItem = {
 id: created.id,
 code: created.code || `custom_background_${created.id}`,
 title: created.name,
  emoji: '',
 imageUrl: created.sprite_url,
  slot: 'background',
  cost: 0,
 };
 appState.shopItems.push(newBgItem);
 for (const ui of appState.userItems) {
 if (ui.user_id === user.id) {
 const item = appState.shopItems.find((s) => s.id === ui.item_id);
 if (item?.slot === 'background') ui.equipped = 0;
 }
 }
 appState.userItems.push({
 user_id: user.id,
 item_id: created.id,
 equipped: 1,
 });

 res.json({ success: true, message: 'Установлен новый фон' });
});

userRoutes.post('/custom-avatar', async (req: AuthedRequest, res: Response) => {
 const { userId, avatarUrl } = req.body;
 if (!requireAdminActor(req, res, Number(userId))) return;
 const user = appState.users.find((u) => u.id === Number(userId));
 if (!user) return res.status(404).json({ error: 'Пользователь не найден' });

 if (!(await commitProfileChange(user, (draft) => { draft.custom_avatar_url = avatarUrl; }))) {
 return res.status(500).json({ error: 'Ошибка базы данных, попробуйте ещё раз' });
 }

 res.json({ success: true, message: 'Аватар успешно обновлён!' });
});

userRoutes.post('/reset', async (req: AuthedRequest, res: Response) => {
 const { userId } = req.body;
 if (!requireAdminActor(req, res, Number(userId))) return;
 const user = appState.users.find((u) => u.id === Number(userId));
 if (!user) return res.status(404).json({ error: 'User not found' });

 const updated = await db.update(schema.users).set({
 gold: 0,
 xp: 0,
 current_streak: 0,
 best_streak: 0,
 streak_status: 'active',
 skill_date: null,
 last_streak_update: null,
 }).where(eq(schema.users.id, user.id)).returning({ id: schema.users.id });
 if (updated.length === 0) return res.status(404).json({ error: 'User not found' });
 user.gold = 0;
 user.xp = 0;
 user.current_streak = 0;
 user.best_streak = 0;
 user.streak_status = 'active';
 user.skill_date = null;
 user.last_streak_update = undefined;

 res.json({ success: true, user });
});

userRoutes.post('/register', async (req: AuthedRequest, res: Response) => {
 if (!requireAdminActor(req, res)) return;
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
 } = req.body;

 const actor = appState.users.find((u) => u.id === Number(req.body.actorId));
 const actorFamilyId = getUserFamilyId(actor) ?? (!isAuthEnforced() ? appState.family?.id ?? null : null);
 if (actorFamilyId === null) {
 return res.status(400).json({ error: 'У родителя не назначена семья' });
 }

 if (!name || typeof name !== 'string' || !name.trim()) {
 return res.status(400).json({ error: 'Укажите корректное имя пользователя' });
 }

 const trimmedName = name.trim();

 // Check name uniqueness (case-insensitive)
 const nameExists = appState.users.some(
 (u) => getUserFamilyId(u) === actorFamilyId && u.display_name.trim().toLowerCase() === trimmedName.toLowerCase()
 );
 if (nameExists) {
 return res.status(400).json({
 error: `Имя «${trimmedName}» уже занято другим героем в семье! Пожалуйста, укажите уникальное имя.`,
 });
 }

 const selectedColor = character_color || color || '#f59e0b';
 const syntheticTelegramId = -(Date.now() * 1000 + randomInt(1000));

 // Этот legacy endpoint вызывается уже авторизованным родителем и создаёт только ребёнка.
 // Первого parent/admin создаёт публичный POST /api/auth/register.
 const familyRole: 'child' = 'child';
 const isAdmin = false;

 const newUser: User = {
 id: 0,
 telegram_id: syntheticTelegramId,
 family_id: actorFamilyId,
 display_name: trimmedName,
 family_role: familyRole,
 is_admin: isAdmin,
 assignee: 'both',
 gold: 50,
 xp: 0,
 crystals: 10,
 current_streak: 0,
 best_streak: 0,
 streak_status: 'active',
 streak_freeze_available: false,
 class: ((classKey as any) || 'warrior'),
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
 referral_code: undefined,
 referrals_count: 0,
 referral_earnings_gold: 0,
 referral_earnings_crystals: 0,
 };

 // ARC-02: family_id резолвится по коду семьи (не хардкод 1).
 // Код из body (RegistrationModal) → поиск в families; не найден → 404;
 // не передан → первая существующая семья (совместимость с текущей демо-семьёй).
 let resolvedFamilyId = actorFamilyId;
 try {
 if (familyCode) {
 const famRows = await db.select().from(schema.families)
 .where(eq(schema.families.family_code, String(familyCode).trim())).limit(1);
 if (famRows.length > 0) {
 if (famRows[0].id !== actorFamilyId) {
 return res.status(403).json({ error: 'Нельзя добавлять пользователя в другую семью' });
 }
 resolvedFamilyId = actorFamilyId;
 } else {
 return res.status(404).json({ error: 'Код семьи не найден. Проверьте код у родителя.' });
 }
 }
 } catch (e) {
 console.error('[users/register] family lookup failed:', e);
 return res.status(500).json({ error: 'Не удалось проверить семью' });
 }

 try {
 const created = await db.transaction(async (tx) => {
 const [row] = await tx.insert(schema.users).values({
 telegram_id: newUser.telegram_id,
 family_id: resolvedFamilyId,
 role: 'child',
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
 referred_by: newUser.referred_by,
 }).returning();
 const referralCode = `ref_${row.id}`;
 await tx.update(schema.users).set({ referral_code: referralCode })
 .where(eq(schema.users.id, row.id));
 await tx.insert(schema.character_inventory).values({
 character_id: row.id,
 item_id: classKey === 'mage' ? 2 : 1,
 is_equipped: true,
 }).onConflictDoNothing();
 return { ...row, referral_code: referralCode };
 });
 newUser.id = created.id;
 newUser.telegram_id = created.telegram_id;
 newUser.referral_code = created.referral_code;
 } catch (e) {
 console.error('[users/register] child transaction failed:', e);
 return res.status(500).json({ error: 'Ошибка базы данных, попробуйте ещё раз' });
 }

 appState.users.push(newUser);
 appState.userItems.push({
 user_id: newUser.id,
 item_id: classKey === 'mage' ? 2 : 1, // Staff or Sword
 equipped: 1,
 });

 let referralMessage = '';
 if (refCode) {
 const refResult = await processReferral(newUser, refCode);
 if (refResult.success) {
 referralMessage = refResult.message;
 }
 }

 res.json({ success: true, user: newUser, referralMessage });
});
