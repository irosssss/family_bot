/**
 * Роуты Telegram-вебхуков.
 * POST /api/webhook/telegram — обработка обновлений бота.
 * POST /api/webhook/stars — Telegram Stars (pre-checkout + payment).
 *
 * Безопасность (этап 2 аудита):
 *  - Telegram подписывает каждый webhook заголовком X-Telegram-Bot-Api-Secret-Token,
 *    заданным при setWebhook(secret_token=...). Если TELEGRAM_WEBHOOK_SECRET
 *    установлен — заголовок обязателен и должен совпасть.
 *  - Если секрет НЕ установлен в production — начисления Stars ОТКЛОНЯЮТСЯ
 *    (fail-closed): открытый webhook без подписи = печать игровой валюты.
 *  - Сумма платежа сверяется с прайсом SKU, валюта — только XTR.
 *  - Повторные доставки одного платежа (provider_charge_id) не начисляются дважды.
 *
 * Этап 7: при successful_payment парсим payload {userId, sku} и начисляем
 * кристаллы через creditPurchase (starsRoutes).
 */
import { Request, Response, Router } from 'express';
import { telegramWebhookHandler } from '../bot/telegramBot';
import { creditPurchase } from './starsRoutes';
import { config } from '../config';

export const webhookRoutes = Router();

const WEBHOOK_SECRET = config.telegram.webhookSecret;
const isProd = config.isProd;

/** Проверка заголовка X-Telegram-Bot-Api-Secret-Token. */
function webhookAuthorized(req: Request): boolean {
  if (!WEBHOOK_SECRET) return !isProd; // в prod без настроенного секрета — запрещено
  return req.headers['x-telegram-bot-api-secret-token'] === WEBHOOK_SECRET;
}

// Дедупликация платежей: provider_charge_id → true (память процесса;
// при переносе валюты в PostgreSQL (Фаза 6) заменить таблицей платежей).
const processedCharges = new Set<string>();

webhookRoutes.post('/telegram', (req: Request, res: Response) => {
  if (!webhookAuthorized(req)) {
    return res.sendStatus(403);
  }
  return telegramWebhookHandler(req, res);
});

webhookRoutes.post('/stars', (req: Request, res: Response) => {
  if (!webhookAuthorized(req)) {
    return res.sendStatus(403);
  }

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

    // 2a. Дедупликация: Telegram может повторно доставить то же обновление.
    const chargeId = String(sp.provider_payment_charge_id || sp.telegram_payment_charge_id || '');
    if (chargeId && processedCharges.has(chargeId)) {
      console.warn(`[Stars] duplicate delivery ignored: ${chargeId}`);
      return res.sendStatus(200);
    }

    // 2b. Валюта — только Stars (XTR).
    if (sp.currency !== 'XTR') {
      console.error(`[Stars] unexpected currency: ${sp.currency}`);
      return res.sendStatus(200);
    }

    // 2c. Payload и сверка суммы с прайсом SKU.
    const payloadRaw: string = sp.invoice_payload;
    console.log('[Stars] payment received:', payloadRaw, `${sp.total_amount} XTR`);

    try {
      const parsed = JSON.parse(payloadRaw);
      const userId = Number(parsed.userId);
      const sku = String(parsed.sku || '');

      const credited = creditPurchase(userId, sku, Number(sp.total_amount) || -1);
      if (credited) {
        if (chargeId) processedCharges.add(chargeId);
        console.log(`[Stars] Начислено ${credited.gems} кристаллов пользователю ${userId}` +
          (credited.proDays ? `, Family Pro на ${credited.proDays} дней` : ''));
      } else {
        // Неизвестный SKU ИЛИ сумма не совпала с прайсом — начисления нет.
        console.error(`[Stars] payment REJECTED: unknown SKU or amount mismatch (${sku}, ${sp.total_amount} XTR)`);
      }
    } catch (e) {
      console.error('[Stars] payload parse error:', e);
    }
  }

  res.sendStatus(200);
});
