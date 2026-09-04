import TelegramBot from 'node-telegram-bot-api';
import { Request, Response } from 'express';
import { isUserAllowed, DENY_TEXT } from './accessControl';

export interface BotActionResult {
  ok: boolean;
  message?: string;
}

type TaskCreateCallback = (
  title: string,
  points: number,
  chatId: number,
  actorTelegramId: number,
) => Promise<BotActionResult> | BotActionResult;

type InviteCallback = (actorTelegramId: number) => Promise<BotActionResult & { code?: string }>;

let taskCreateCallback: TaskCreateCallback | null = null;
let inviteCallback: InviteCallback | null = null;

export const onTaskCreate = (cb: TaskCreateCallback) => { taskCreateCallback = cb; };
export const onInviteRequest = (cb: InviteCallback) => { inviteCallback = cb; };

const token = process.env.BOT_TOKEN;

// Initialize bot without polling (we will use Webhooks)
export const bot = token ? new TelegramBot(token, { polling: false }) : null;

if (bot) {
  // Command: /start
  bot.onText(/\/start(?:\s+(.+))?/, (msg, match) => {
    if (!isUserAllowed(msg.from?.id)) return; // whitelist: чужие игнорируются
    const chatId = msg.chat.id;
    const startPayload = match ? match[1] : null; // Handles deep linking like /start invite_XYZ

    let text = 'Добро пожаловать в Family Chores RPG!\n\nПревратите рутинные дела в увлекательную игру для всей семьи.';
    
    if (startPayload && startPayload.startsWith('invite_')) {
      const code = startPayload.replace('invite_', '');
      text += `\n\nВы перешли по инвайт-коду: *${code}*. Откройте Mini App, чтобы присоединиться к семье!`;
    }

    bot.sendMessage(chatId, text, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            { 
              text: 'Открыть Mini App', 
              web_app: { url: process.env.VITE_API_URL || 'https://example.com' } // Укажите реальный URL вашего приложения
            }
          ]
        ]
      }
    });
  });

  // Command: /invite - генерация инвайт-кода
  bot.onText(/\/invite/, async (msg) => {
    if (!isUserAllowed(msg.from?.id)) return;
    const chatId = msg.chat.id;
    const actorTelegramId = msg.from?.id;
    if (!actorTelegramId || !inviteCallback) return;
    const result: BotActionResult & { code?: string } = await inviteCallback(actorTelegramId).catch((error) => {
      console.error('[bot] invite callback error:', error);
      return { ok: false, message: 'Не удалось получить код семьи. Попробуйте ещё раз.' };
    });
    if (!result.ok || !result.code) {
      await bot.sendMessage(chatId, result.message || 'Код семьи недоступен.');
      return;
    }
    const botUsername = process.env.BOT_USERNAME || 'FamilyChoresBot';
    await bot.sendMessage(
      chatId,
      `Ваш семейный инвайт-код: *${result.code}*\n\nОтправьте этот код членам вашей семьи или перешлите ссылку:\nhttps://t.me/${botUsername}?start=invite_${result.code}`,
      { parse_mode: 'Markdown' },
    );
  });

  // Обработка Callback-запросов (инлайн-кнопки подтверждения/отклонения)
  // Handle text messages for natural language task creation
  bot.on('message', async (msg) => {
    if (!isUserAllowed(msg.from?.id)) return;
    const text = msg.text;
    const chatId = msg.chat.id;
    if (!text || text.startsWith('/')) return;

    // Regex to match "Task name 50"
    const match = text.match(/^(.*?)\s+(\d+)$/);
    if (match) {
      const title = match[1].trim();
      const points = parseInt(match[2], 10);
      
      if (title && points > 0) {
        if (taskCreateCallback) {
          // ARC-01: колбэк может быть async — ошибка не рушит бот-хендлер
          const result = await Promise.resolve(taskCreateCallback(title, points, chatId, msg.from!.id))
            .catch((e) => {
              console.error('[bot] taskCreate callback error:', e);
              return { ok: false, message: 'Не удалось создать задачу. Попробуйте ещё раз.' };
            });
          if (!result.ok) {
            await bot.sendMessage(chatId, result.message || 'Создание задачи недоступно.');
          }
        }
      }
    }
  });

  bot.on('callback_query', async (query) => {
    if (!isUserAllowed(query.from?.id)) {
      // Чужак нажал инлайн-кнопку (approve начисляет золото) — отказ без обработки.
      if (query.id) await bot.answerCallbackQuery(query.id, { text: DENY_TEXT, show_alert: true });
      return;
    }
    const chatId = query.message?.chat.id;
    const messageId = query.message?.message_id;
    const data = query.data; // Пример: 'approve_task_123'

    if (!chatId || !messageId || !data) return;

    if (data.startsWith('approve_task_') || data.startsWith('reject_task_')) {
      // Старые сообщения могли содержать кнопки ревизии. Начисление происходит
      // атомарно при отметке задачи в Mini App, поэтому повторное действие запрещено.
      await bot.answerCallbackQuery(query.id, {
        text: 'Задача уже учтена в Mini App.',
        show_alert: true,
      });
    }
  });
}

// Утилита для отправки уведомлений родителю из нашего API
export async function notifyTaskCreated(chatId: number, title: string, points: number) {
  if (!bot) return;
  await bot.sendMessage(chatId, `Квест добавлен в Mini App!\n\n«${title}» — награда ${points}`, { parse_mode: 'Markdown' });
}

export async function notifyParentAboutTaskCompletion(parentId: number, _taskId: string | number, taskName: string, childName: string) {
  if (!bot) return;

  const text = `*Квест выполнен*\n\nГерой *${childName}* выполнил квест:\n«${taskName}»`;
  
  await bot.sendMessage(parentId, text, {
    parse_mode: 'Markdown',
  });
}

// Express Route/Middleware для обработки вебхуков от Telegram
export const telegramWebhookHandler = (req: Request, res: Response) => {
  if (bot) {
    bot.processUpdate(req.body);
  }
  res.sendStatus(200);
};
