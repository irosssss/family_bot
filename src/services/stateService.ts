/**
 * In-memory состояние приложения.
 *
 * Перенесено из server.ts (Фаза 2 рефакторинга) без изменения логики.
 *
 * Это временный гибрид: часть коллекций (completions, purchases,
 * userItems, userPets, achievements, perfectDays, referrals) живёт
 * только в памяти и теряется при перезапуске. В Фазе 6 источником
 * правды станет PostgreSQL, а appState превратится в кэш/буфер.
 *
 * Все остальные сервисы импортируют `appState` отсюда, чтобы избежать
 * циклической зависимости с server.ts.
 */
import {
 BOSS_LIST,
 INITIAL_ACHIEVEMENTS,
 INITIAL_CHALLENGES,
 INITIAL_PETS,
 INITIAL_REWARDS,
 INITIAL_SHOP_ITEMS,
 INITIAL_TASKS,
 INITIAL_USERS,
} from '../data/initialData';
import { getWeekKey, getTodayStr, getNowTimestamp } from '../lib/dateUtils';
import type { AppState } from '../types';

export const appState: AppState = {
 users: INITIAL_USERS.map((user) => ({ ...JSON.parse(JSON.stringify(user)), family_id: 1 })),
 tasks: INITIAL_TASKS.map((task) => ({ ...JSON.parse(JSON.stringify(task)), family_id: 1 })),
 habits: [],
 completions: [
 {
 id: 1,
 user_id: 1,
 task_id: 1,
 completed_at: getTodayStr(),
 completed_at_ts: getNowTimestamp(),
 },
 {
 id: 2,
 user_id: 2,
 task_id: 5,
 completed_at: getTodayStr(),
 completed_at_ts: getNowTimestamp(),
 },
 ],
 rewards: JSON.parse(JSON.stringify(INITIAL_REWARDS)),
 purchases: [
 {
 id: 1,
 user_id: 1,
 reward_id: 1,
 reward_title: ' Выбрать фильм на вечер',
 created_at: getTodayStr(),
 user_name: 'Миша',
 },
 ],
 shopItems: JSON.parse(JSON.stringify(INITIAL_SHOP_ITEMS)),
 userItems: [
 { user_id: 1, item_id: 7, equipped: 1 }, // Cap
 { user_id: 1, item_id: 1, equipped: 1 }, // Sword
 { user_id: 1, item_id: 14, equipped: 1 }, // Castle background
 { user_id: 2, item_id: 9, equipped: 1 }, // Crown
 { user_id: 2, item_id: 2, equipped: 1 }, // Staff
 { user_id: 2, item_id: 13, equipped: 1 }, // Forest background
 ],
 pets: JSON.parse(JSON.stringify(INITIAL_PETS)),
 userPets: [
 { user_id: 1, pet_id: 1 },
 { user_id: 1, pet_id: 2 },
 { user_id: 2, pet_id: 4 },
 { user_id: 2, pet_id: 8 },
 ],
 achievements: JSON.parse(JSON.stringify(INITIAL_ACHIEVEMENTS)),
 userAchievements: [
 { user_id: 1, achievement_id: 1 },
 { user_id: 2, achievement_id: 1 },
 ],
 boss: {
 id: 1,
 week_key: getWeekKey(),
 name: BOSS_LIST[0].name,
 emoji: BOSS_LIST[0].emoji,
 icon: BOSS_LIST[0].icon,
 hp: 90,
 maxHp: 100,
 damage: 34,
 defeated: 0,
 },
 challenge: {
 code: INITIAL_CHALLENGES[0].code,
 title: INITIAL_CHALLENGES[0].title,
 description: INITIAL_CHALLENGES[0].description,
 target: INITIAL_CHALLENGES[0].target,
 bonus: INITIAL_CHALLENGES[0].bonus,
 progress: 7,
 completed: false,
 },
 perfectDays: [
 { user_id: 1, day: '2026-08-05' },
 { user_id: 2, day: '2026-08-06' },
 ],
 referrals: [
   {
     id: 1,
     referrer_id: 1,
     referee_id: 2,
     referee_name: 'Регина',
     created_at: getTodayStr(),
     bonus_gold: 100,
     bonus_crystals: 25,
   },
 ],
 // Этап 9: Family HP — гидрируется из БД при loadState()
 family: {
   id: 1,
   family_code: 'demo',
   name: 'Семья Поддубных',
   family_hp: 100,
   max_family_hp: 100,
   exhausted_until: null,
 },
 familyGameStates: {},
};

// Локальная песочница тоже использует тот же family-scoped контракт, что production.
appState.familyGameStates![1] = {
 family: JSON.parse(JSON.stringify(appState.family)),
 boss: JSON.parse(JSON.stringify(appState.boss)),
 challenge: JSON.parse(JSON.stringify(appState.challenge)),
};
