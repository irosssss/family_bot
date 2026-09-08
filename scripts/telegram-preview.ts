import path from 'node:path';
import { createTelegramPreviewApp } from '../src/preview/app';

try {
  const portText = process.env.PREVIEW_PORT ?? '3210';
  if (!['3210', '3211'].includes(portText)) throw new Error('Preview port invalid');
  const port = Number(portText);
  const app = createTelegramPreviewApp({
    botToken: process.env.BOT_TOKEN ?? '', origin: process.env.PREVIEW_ORIGIN ?? '',
    directory: path.resolve('work/telegram-preview/dist'),
  });
  app.listen(port, '127.0.0.1', () => console.log(`Telegram preview listening on 127.0.0.1:${port}`));
} catch { console.error('Preview configuration invalid'); process.exitCode = 1; }
