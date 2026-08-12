/**
 * Роуты Telegram-вебхуков.
 * POST /api/webhook/telegram — обработка обновлений бота.
 * POST /api/webhook/stars — Telegram Stars (pre-checkout + payment).
 */
import { Request, Response, Router } from 'express';
import { telegramWebhookHandler } from '../bot/telegramBot';

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
    const payload = message.successful_payment.invoice_payload;
    // Extract userId and productId from payload and grant rewards
    console.log('✅ Telegram Stars payment received:', payload);
    // ... grant gold / premium ...
  }

  res.sendStatus(200);
});
