/**
 * Telegram уведомления для Streak системы и ежедневных сводок задач.
 * Тексты утверждены Game Designer'ом + психология из CHILD_PSYCHOLOGY_GUIDE.md.
 * ВНИМАНИЕ: в сообщениях НЕ используются эмодзи (требование пользователя).
 */
import { bot } from './telegramBot';
import { getDailyLimit, getRequiredCount } from '../services/taskGenerator';

// Rate limiting: минимум 1 минута между уведомлениями одному пользователю
const sentNotifications = new Map<number, number>();

/** DTO задачи из GET /api/users/:id/tasks/today */
export interface TodayTaskDTO {
  id: number;
  code: string;
  title: string;
  points: number;
  category: string | null;
  task_type: string;
  is_required: boolean;
  done: boolean;
  crystals: number;
}

/** Ответ API tasks/today */
export interface TodayTasksData {
  date: string;
  user: { id: number; display_name: string; age?: number };
  required: TodayTaskDTO[];
  choice: TodayTaskDTO[];
  quests: TodayTaskDTO[];
  summary: {
    total: number;
    required_done: number;
    required_total: number;
    all_required_done: boolean;
    progress_percent: number;
  };
}

async function sendWithRateLimit(telegramId: number, message: string, options?: any) {
  const lastSent = sentNotifications.get(telegramId);
  const now = Date.now();
  
  // Минимум 1 минута между уведомлениями одному пользователю
  if (lastSent && now - lastSent < 60000) {
    console.log(`[Rate Limit] Skipping notification for user ${telegramId}`);
    return;
  }
  
  if (!bot) {
    console.warn('[Notifications] Bot not initialized');
    return;
  }
  
  try {
    await bot.sendMessage(telegramId, message, options);
    sentNotifications.set(telegramId, now);
  } catch (error) {
    console.error(`[Notifications] Failed to send to ${telegramId}:`, error);
  }
}

/** Кнопка "Открыть игру" → WebApp */
function openGameButton() {
  return {
    reply_markup: {
      inline_keyboard: [[
        { text: 'Открыть игру', web_app: { url: process.env.VITE_API_URL || 'https://example.com' } }
      ]]
    }
  };
}

/**
 * Утренняя сводка задач (08:00).
 * Психология: ПОЛОЖИТЕЛЬНОЕ, мотивирующее начало дня.
 * Показывает: обязательные / на выбор / квесты + streak.
 */
export async function sendMorningTaskDigest(
  telegramId: number,
  data: TodayTasksData,
  currentStreak: number
) {
  const name = data.user.display_name;
  const { required, choice, quests, summary } = data;

  // Прогресс вчерашнего дня не показываем — только сегодняшние задачи.
  // Мотивация: "Сегодня у тебя..." (позитивный настрой, не давление)
  let message = `*Доброе утро, ${name}!* Сегодня у тебя:\n`;

  // Обязательные
  if (required.length > 0) {
    message += `\n*ОБЯЗАТЕЛЬНО:*\n`;
    for (const t of required) {
      const doneMark = t.done ? '[x]' : '[ ]';
      message += `${doneMark} ${t.title} (+${t.points})\n`;
    }
  }

  // На выбор
  if (choice.length > 0) {
    const age = data.user.age ?? 8;
    const choiceCount = getChoiceCount(age, required.length, choice.length);
    message += `\n*ВЫБЕРИ ЛЮБЫЕ ${choiceCount}:*\n`;
    for (const t of choice) {
      const doneMark = t.done ? '[x]' : '[ ]';
      message += `${doneMark} ${t.title} (+${t.points})\n`;
    }
  }

  // Квесты
  if (quests.length > 0) {
    message += `\n*КВЕСТ:*\n`;
    for (const t of quests) {
      const doneMark = t.done ? '[x]' : '[ ]';
      const crystalText = t.crystals > 0 ? ` +${t.crystals} кристаллов` : '';
      message += `${doneMark} ${t.title} (+${t.points}${crystalText})\n`;
    }
  }

  // Streak — позитивная мотивация
  if (currentStreak > 0) {
    const bonus = Math.min(currentStreak * 5, 50);
    message += `\nТвой streak: ${currentStreak} ${getDaysWord(currentStreak)} (+${bonus}% к наградам)`;
  } else {
    message += `\nНачни свою серию сегодня — каждый день важен!`;
  }

  await sendWithRateLimit(telegramId, message, {
    parse_mode: 'Markdown',
    ...openGameButton(),
  });

  console.log(`[Morning Digest] Sent to ${name} (tg:${telegramId}), ${summary.total} tasks`);
}

/**
 * Вечернее напоминание (19:00).
 * Только если не все ОБЯЗАТЕЛЬНЫЕ выполнены.
 * Психология: мягкое, заботливое, НЕ агрессивное. Показываем прогресс.
 */
export async function sendEveningReminder(
  telegramId: number,
  data: TodayTasksData,
  currentStreak: number
) {
  const name = data.user.display_name;
  const { required, summary } = data;

  if (summary.all_required_done) {
    return; // Все обязательные сделаны — не беспокоим
  }

  // Только невыполненные ОБЯЗАТЕЛЬНЫЕ
  const remainingRequired = required.filter((t) => !t.done);

  let message = `${name}, до конца дня осталось совсем немного времени!\n`;

  if (remainingRequired.length > 0) {
    message += `\nОсталось *ОБЯЗАТЕЛЬНОЕ*:\n`;
    for (const t of remainingRequired) {
      message += `[ ] ${t.title} (+${t.points})\n`;
    }
  }

  // Прогресс — мягкая мотивация, а не давление
  message += `\nСделано *${summary.required_done} из ${summary.required_total}* обязательных задач`;

  if (currentStreak > 0) {
    message += `\nStreak ${currentStreak} ${getDaysWord(currentStreak)} — у тебя всё получится!`;
  }

  await sendWithRateLimit(telegramId, message, {
    parse_mode: 'Markdown',
    ...openGameButton(),
  });

  console.log(`[Evening Reminder] Sent to ${name} (tg:${telegramId}), ${remainingRequired.length} required left`);
}

/** Сколько задач «на выбор» предложить (по возрастному лимиту APPROVED_SPEC 2.2). */
function getChoiceCount(age: number, requiredCount: number, availableChoice: number): number {
  const limit = getDailyLimit(age);          // макс задач в день
  const req = getRequiredCount(age);         // сколько обязательных положено
  // Сколько «на выбор» можно взять = лимит - обязательные (но не больше доступных)
  const maxByAge = Math.max(1, limit - req);
  return Math.min(maxByAge, availableChoice);
}

// --- Утилиты ---

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

/**
 * Milestone: 3 дня подряд
 */
export async function notifyMilestone3(telegramId: number) {
  const message = `*Поздравляю!*

3 дня подряд! Ты на верном пути.
Текущий бонус: *+15% к наградам*

Продолжай в том же духе!`;

  await sendWithRateLimit(telegramId, message, {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [[
        { text: 'Открыть игру', web_app: { url: process.env.VITE_API_URL || 'https://example.com' } }
      ]]
    }
  });

  console.log(`[Milestone] 3 days sent to user ${telegramId}`);
}

/**
 * Milestone: 7 дней подряд
 * Награда: +50 золота
 */
export async function notifyMilestone7(telegramId: number) {
  const message = `*НЕДЕЛЯ ЗАВЕРШЕНА!*

7 дней подряд — это впечатляет!
Текущий бонус: *+35% к наградам*
Награда: *+50 золота*

Так держать! До максимального streak осталось 3 дня!`;

  await sendWithRateLimit(telegramId, message, {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [[
        { text: 'Открыть игру', web_app: { url: process.env.VITE_API_URL || 'https://example.com' } }
      ]]
    }
  });

  console.log(`[Milestone] 7 days sent to user ${telegramId}`);
}

/**
 * Milestone: 10 дней подряд (максимальный streak)
 * Награда: +100 золота, +10 кристаллов, badge "Streak Master"
 */
export async function notifyMilestone10(telegramId: number) {
  const message = `*МАКСИМАЛЬНЫЙ STREAK!*

10 дней подряд — ты легенда!
Бонус: *+50% к наградам*
Награда: *+100 золота* *+10 кристаллов*
Badge: *Streak Master*

Продолжай поддерживать максимальный streak!`;

  await sendWithRateLimit(telegramId, message, {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [[
        { text: 'Открыть игру', web_app: { url: process.env.VITE_API_URL || 'https://example.com' } }
      ]]
    }
  });

  console.log(`[Milestone] 10 days sent to user ${telegramId}`);
}

/**
 * Streak на паузе (день без задач)
 */
export async function notifyStreakPaused(telegramId: number, currentStreak: number) {
  const message = `Streak на паузе

Сегодня нет задач, streak ${currentStreak} ${getDaysWord(currentStreak)} сохранён.
Завтра продолжим!`;

  await sendWithRateLimit(telegramId, message, {
    parse_mode: 'Markdown'
  });

  console.log(`[Streak Paused] Sent to user ${telegramId}`);
}

/**
 * Streak сохранён через Freeze
 */
export async function notifyStreakSaved(telegramId: number, streak: number) {
  const message = `*Streak сохранён!*

Ты пропустил день, но Streak Freeze защитила твою серию.
Текущий streak: *${streak} ${getDaysWord(streak)}*

Freeze использована. Следующая будет доступна через 7 дней.`;

  await sendWithRateLimit(telegramId, message, {
    parse_mode: 'Markdown'
  });

  console.log(`[Streak Saved] Sent to user ${telegramId}`);
}

/**
 * Streak сброшен
 */
export async function notifyStreakBroken(telegramId: number, brokenStreak: number) {
  const message = `Streak сброшен

Твоя серия ${brokenStreak} ${getDaysWord(brokenStreak)} прервалась.
Но это не конец! Начни новую серию сегодня.

Совет: купи *Streak Freeze* в магазине, чтобы защититься от пропуска.`;

  await sendWithRateLimit(telegramId, message, {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [[
        { text: 'Открыть игру', web_app: { url: process.env.VITE_API_URL || 'https://example.com' } }
      ]]
    }
  });

  console.log(`[Streak Broken] Sent to user ${telegramId}`);
}
