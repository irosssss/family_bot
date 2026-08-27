/**
 * Роуты Telegram-вебхуков.
 * POST /api/webhook/telegram — обработка обновлений бота.
 * POST /api/webhook/stars — Telegram Stars (pre-checkout + payment).
 *
 * Этап 7: при successful_payment парсим payload {userId, sku} и начисляем
 * кристаллы через creditPurchase (starsRoutes).
 */
import { Request, Response, Router } from 'express';
import { telegramWebhookHandler } from '../bot/telegramBot';
import { creditPurchase } from './starsRoutes';

export const webhookRoutes = Router();

webhookRoutes.post('/telegram', telegramWebhookHandler);

webhookRoutes.post('/stars', (req: Request, res: Response) => {
 const { pre_checkout_query, message } = req.body;

 // 1. Answer Pre-checkout query
 if (pre_checkout_query) {
 return res.json({
 method: 'answerPreCheckoutQuery',
 pre_checkout_query_id: pre_checkout_query.id,
 ok: true
 });
 }

 // 2. Handle Successful Payment
 if (message?.successful_payment) {
 const sp = message.successful_payment;
 const payloadRaw: string = sp.invoice_payload;
 console.log('[Stars] payment received:', payloadRaw, `${sp.total_amount} XTR`);

 // Payload format: JSON {"userId":N,"sku":"gems_small"}
 try {
   const parsed = JSON.parse(payloadRaw);
   const userId = Number(parsed.userId);
   const sku = String(parsed.sku || '');
   const credited = creditPurchase(userId, sku);
   if (credited) {
     console.log(`[Stars] Начислено ${credited.gems} кристаллов пользователю ${userId}` +
       (credited.proDays ? `, Family Pro на ${credited.proDays} дней` : ''));
   } else {
     console.error(`[Stars] Неизвестный SKU: ${sku}`);
   }
 } catch (e) {
   console.error('[Stars] payload parse error:', e);
 }
 }

 res.sendStatus(200);
});
