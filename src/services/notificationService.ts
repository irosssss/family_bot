/**
 * Сервис пуш-уведомлений в семейный Telegram-чат.
 *
 * Перенесён из server.ts (Фаза 2) без изменения логики. Теперь читает
 * конфиг через централизованный модуль `config` вместо разбросанных
 * `process.env.*`.
 */
import { config } from '../config';

/**
 * Отправляет HTML-сообщение в общий семейный чат через Bot API.
 * Молча логирует ошибки — уведомление не должно рвать выполнение
 * игровой логики (например, начисления золота за задачу).
 */
export async function sendTelegramPushNotification(htmlText: string): Promise<void> {
 const token = config.telegram.botToken;
 const chatId = config.telegram.chatId;
 if (!token || !chatId) {
 console.log('[Telegram Push skipped]: Token or Chat ID not configured');
 return;
 }

 try {
 const url = `https://api.telegram.org/bot${token}/sendMessage`;
 const res = await fetch(url, {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({
 chat_id: chatId,
 text: htmlText,
 parse_mode: 'HTML',
 }),
 });
 const data = await res.json();
 if (!data.ok) {
 console.warn('[Telegram Push Error]:', data);
 } else {
 console.log(' [Telegram Push Sent]:', htmlText);
 }
 } catch (err) {
 console.error('[Telegram Push Exception]:', err);
 }
}
