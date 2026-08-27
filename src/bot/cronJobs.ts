/**
 * Cron Jobs для Telegram уведомлений.
 * 
 * 1. 08:00 — утренняя сводка задач (required/choice/quests)
 * 2. 19:00 — вечернее напоминание (только если не все обязательные выполнены)
 * 3. 20:00 — Daily Streak Reminder (уведомление о риске потери streak)
 * ВНИМАНИЕ: в сообщениях и логах НЕ используются эмодзи (требование пользователя).
 */
import cron from 'node-cron';
import { bot } from './telegramBot';
import { appState } from '../services/stateService';
import { getTodayStr } from '../lib/dateUtils';
import { getRemainingTasks } from '../services/streakService';
import { sendMorningTaskDigest, sendEveningReminder, TodayTasksData } from './notifications';

const API_BASE = process.env.API_URL || 'http://localhost:3000';

/**
 * Таймзона для cron-расписаний.
 * Пользователи хранят свою timezone (например 'Europe/Moscow'), но node-cron
 * планирует по ОДНОЙ таймзоне на задачу. Берём таймзону первого пользователя
 * (в семье обычно одна), иначе из env, иначе серверную по умолчанию.
 */
function getFamilyTimezone(): string {
  const userTz = appState.users.find((u) => u.timezone)?.timezone;
  return userTz || process.env.CRON_TIMEZONE || 'UTC';
}

/**
 * Запускает все cron jobs для бота.
 * Вызывается один раз при старте сервера.
 */
export function initializeCronJobs() {
  const tz = getFamilyTimezone();

  // Утренняя сводка задач: каждый день в 08:00 (по таймзоне семьи)
  cron.schedule('0 8 * * *', async () => {
    console.log('[Cron] Running morning task digest at 08:00...');
    await sendMorningDigestToChildren();
  }, { timezone: tz });

  // Вечернее напоминание: каждый день в 19:00
  cron.schedule('0 19 * * *', async () => {
    console.log('[Cron] Running evening reminder at 19:00...');
    await sendEveningReminderToChildren();
  }, { timezone: tz });

  // Daily Reminder (streak): каждый день в 20:00
  cron.schedule('0 20 * * *', async () => {
    console.log('[Cron] Running daily streak reminder at 20:00...');
    await sendDailyStreakReminder();
  }, { timezone: tz });

  console.log(`[Cron] Morning digest (08:00), evening reminder (19:00) and streak reminder (20:00) scheduled (timezone: ${tz})`);
}

/**
 * Пользователи-дети (родителям сводки задач не шлём).
 * В типе User нет поля role, поэтому считаем детьми всех, у кого assignee — один из детей
 * (не 'both'). В текущей схеме Миша и Регина оба children.
 */
function getChildUsers() {
  return appState.users;
}

/**
 * Получить задачи на сегодня через API (единый источник правды — backend).
 */
async function fetchTodayTasks(userId: number): Promise<TodayTasksData | null> {
  try {
    const response = await fetch(`${API_BASE}/api/users/${userId}/tasks/today`);
    if (!response.ok) {
      console.warn(`[Cron] tasks/today for user ${userId} returned ${response.status}`);
      return null;
    }
    const json = await response.json();
    return json.data as TodayTasksData;
  } catch (error) {
    console.error(`[Cron] Failed to fetch tasks/today for user ${userId}:`, error);
    return null;
  }
}

/**
 * Утренняя сводка: для каждого ребёнка.
 */
async function sendMorningDigestToChildren() {
  if (!bot) {
    console.warn('[Cron] Bot not initialized, skipping morning digest');
    return;
  }

  for (const user of getChildUsers()) {
    try {
      const data = await fetchTodayTasks(user.id);
      if (!data) continue;

      await sendMorningTaskDigest(user.telegram_id, data, user.current_streak);
    } catch (error) {
      console.error(`[Cron] Morning digest failed for user ${user.id}:`, error);
    }
  }

  console.log('[Cron] Morning digest completed');
}

/**
 * Вечернее напоминание: только если не все ОБЯЗАТЕЛЬНЫЕ выполнены.
 */
async function sendEveningReminderToChildren() {
  if (!bot) {
    console.warn('[Cron] Bot not initialized, skipping evening reminder');
    return;
  }

  for (const user of getChildUsers()) {
    try {
      const data = await fetchTodayTasks(user.id);
      if (!data) continue;

      await sendEveningReminder(user.telegram_id, data, user.current_streak);
    } catch (error) {
      console.error(`[Cron] Evening reminder failed for user ${user.id}:`, error);
    }
  }

  console.log('[Cron] Evening reminder completed');
}

/**
 * Daily Streak Reminder (20:00).
 * Уведомляет пользователей с невыполненными задачами и активным streak.
 */
async function sendDailyStreakReminder() {
  if (!bot) {
    console.warn('[Cron] Bot not initialized, skipping reminder');
    return;
  }

  const todayStr = getTodayStr();

  for (const user of appState.users) {
    try {
      // Получаем невыполненные задачи через streakService
      const remainingTasks = await getRemainingTasks(user.id, todayStr);

      // Уведомлять только если:
      // 1) Есть невыполненные задачи
      // 2) Streak активен (> 0)
      if (remainingTasks.length > 0 && user.current_streak > 0) {
        const bonus = user.current_streak * 5;
        
        const message = `Твоя серия ${user.current_streak} ${getDaysWord(user.current_streak)} под угрозой!

Осталось выполнить: ${remainingTasks.length} ${getTasksWord(remainingTasks.length)}
Текущий бонус: +${bonus}% к наградам

Успей до полуночи, чтобы сохранить streak!`;

        await bot.sendMessage(user.telegram_id, message, {
          reply_markup: {
            inline_keyboard: [[
              { text: 'Открыть игру', web_app: { url: process.env.VITE_API_URL || 'https://example.com' } }
            ]]
          }
        });

        console.log(`[Cron] Reminder sent to ${user.display_name} (${remainingTasks.length} tasks remaining)`);
      }
    } catch (error) {
      console.error(`[Cron] Failed to send reminder to user ${user.id}:`, error);
      // Продолжаем для остальных пользователей
    }
  }

  console.log('[Cron] Daily reminder completed');
}

// --- Утилиты для правильного склонения ---

function getDaysWord(count: number): string {
  const lastDigit = count % 10;
  const lastTwoDigits = count % 100;

  if (lastTwoDigits >= 11 && lastTwoDigits <= 19) {
    return 'дней';
  }

  if (lastDigit === 1) {
    return 'день';
  }

  if (lastDigit >= 2 && lastDigit <= 4) {
    return 'дня';
  }

  return 'дней';
}

function getTasksWord(count: number): string {
  const lastDigit = count % 10;
  const lastTwoDigits = count % 100;

  if (lastTwoDigits >= 11 && lastTwoDigits <= 19) {
    return 'задач';
  }

  if (lastDigit === 1) {
    return 'задача';
  }

  if (lastDigit >= 2 && lastDigit <= 4) {
    return 'задачи';
  }

  return 'задач';
}
