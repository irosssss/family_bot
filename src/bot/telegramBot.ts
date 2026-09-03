import TelegramBot from 'node-telegram-bot-api';
import { Request, Response } from 'express';
import { Server as SocketIOServer } from 'socket.io';
import { isUserAllowed, DENY_TEXT } from './accessControl';
export let taskApproveCallback: ((taskId: number) => void) | null = null;
export const onTaskApprove = (cb: (taskId: number) => void) => { taskApproveCallback = cb; };
export let taskCreateCallback: ((title: string, points: number, chatId: number) => void) | null = null;
export const onTaskCreate = (cb: (title: string, points: number, chatId: number) => Promise<void> | void) => { taskCreateCallback = cb; };

let ioInstance: SocketIOServer | null = null;
export const setSocketIO = (io: SocketIOServer) => { ioInstance = io; };

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
  bot.onText(/\/invite/, (msg) => {
    if (!isUserAllowed(msg.from?.id)) return;
    const chatId = msg.chat.id;
    // В реальном проекте мы бы сгенерировали код в базе данных для текущего Family ID пользователя
    const inviteCode = 'FAM-' + Math.floor(1000 + Math.random() * 9000);
    
    bot.sendMessage(chatId, `Ваш семейный инвайт-код: *${inviteCode}*\n\nОтправьте этот код членам вашей семьи или перешлите ссылку:\nhttps://t.me/your_bot_username?start=invite_${inviteCode}`, {
      parse_mode: 'Markdown'
    });
  });

  // Обработка Callback-запросов (инлайн-кнопки подтверждения/отклонения)
  // Handle text messages for natural language task creation
  bot.on('message', (msg) => {
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
          Promise.resolve(taskCreateCallback(title, points, chatId))
            .catch((e) => console.error('[bot] taskCreate callback error:', e));
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

    if (data.startsWith('approve_task_')) {
      const taskId = data.replace('approve_task_', '');
      
      // Здесь был бы вызов API базы данных для обновления статуса задачи и начисления XP/Золота
      if (taskApproveCallback) taskApproveCallback(Number(taskId));
      
      await bot.editMessageText(`Квест #${taskId} успешно подтвержден!\n\nГерою начислены Золото и XP.`, {
        chat_id: chatId,
        message_id: messageId
      });
      if (ioInstance) {
        ioInstance.emit('taskApproved', { taskId: Number(taskId), message: 'Квест подтвержден!' });
      }
      await bot.answerCallbackQuery(query.id, { text: 'Квест подтвержден!' });
    
    } else if (data.startsWith('reject_task_')) {
      const taskId = data.replace('reject_task_', '');
      
      await bot.editMessageText(`Квест #${taskId} отклонен родителем.\n\nПопросите ребенка переделать задачу.`, {
        chat_id: chatId,
        message_id: messageId
      });
      if (ioInstance) {
        ioInstance.emit('taskRejected', { taskId: Number(taskId), message: 'Квест отклонен!' });
      }
      await bot.answerCallbackQuery(query.id, { text: 'Квест отклонен' });
    }
  });
}

// Утилита для отправки уведомлений родителю из нашего API
export async function notifyTaskCreated(chatId: number, title: string, points: number) {
  if (!bot) return;
  await bot.sendMessage(chatId, `Квест добавлен в Mini App!\n\n«${title}» — награда ${points}`, { parse_mode: 'Markdown' });
}

export async function notifyParentAboutTaskCompletion(parentId: number, taskId: string | number, taskName: string, childName: string) {
  if (!bot) return;

  const text = `*Ревизия квеста!*\n\nГерой *${childName}* сообщает, что выполнил квест:\n«${taskName}»\n\nПодтверждаете выполнение?`;
  
  await bot.sendMessage(parentId, text, {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [
          { text: 'Подтвердить', callback_data: `approve_task_${taskId}` },
          { text: 'Отклонить', callback_data: `reject_task_${taskId}` }
        ]
      ]
    }
  });
}

// Express Route/Middleware для обработки вебхуков от Telegram
export const telegramWebhookHandler = (req: Request, res: Response) => {
  if (bot) {
    bot.processUpdate(req.body);
  }
  res.sendStatus(200);
};
