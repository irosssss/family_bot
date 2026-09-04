/**
 * Роуты Telegram-вебхуков.
 * POST /api/webhook/telegram — ЕДИНСТВЕННЫЙ URL вебхука: апдейты бота + Stars.
 * POST /api/webhook/stars — отдельный путь для ручных тестов (Telegram его НЕ шлёт:
 * у бота один вебхук-URL, всё приходит на /telegram).
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
 * Фикс платёжного флоу (было): pre_checkout_query не обрабатывался нигде —
 * Telegram отменял платёж через 10 секунд ожидания. ВАЖНО: ответ на
 * pre_checkout отправляется МЕТОДОМ API answerPreCheckoutQuery, а не телом
 * HTTP-ответа (вебхук Telegram так не умеет — старый код в /stars молча не работал).
 */
import { Request, Response, Router } from 'express';
import { bot, telegramWebhookHandler } from '../bot/telegramBot';
import { creditPurchaseAtomic, SKUS } from './starsRoutes';
import { config } from '../config';
import { appState } from '../services/stateService';

export const webhookRoutes = Router();

const WEBHOOK_SECRET = config.telegram.webhookSecret;
const isProd = config.isProd;

/** Проверка заголовка X-Telegram-Bot-Api-Secret-Token. */
function webhookAuthorized(req: Request): boolean {
  if (!WEBHOOK_SECRET) return !isProd; // в prod без настроенного секрета — запрещено
  return req.headers['x-telegram-bot-api-secret-token'] === WEBHOOK_SECRET;
}

function invoicePayloadIsValid(updatePart: any): boolean {
  try {
    const parsed = JSON.parse(String(updatePart.invoice_payload || ''));
    const user = appState.users.find((candidate) => candidate.id === Number(parsed.userId));
    const sku = SKUS[String(parsed.sku || '')];
    return !!user
      && user.telegram_id === Number(updatePart.from?.id)
      && user.family_role === 'parent'
      && updatePart.currency === 'XTR'
      && Number(updatePart.total_amount) === sku?.stars;
  } catch {
    return false;
  }
}

/**
 * Платёжные апдейты Stars (pre_checkout_query / successful_payment).
 * Вызывается из /telegram перед processUpdate; /stars — обёртка для тестов.
 */
async function handlePaymentUpdate(update: any): Promise<void> {
  const preCheckout = update?.pre_checkout_query;
  const sp = update?.message?.successful_payment;
  if (!preCheckout && !sp) return;

  // 1. Pre-checkout: подтверждаем МЕТОДОМ API. Без этого вызова Telegram
  //    отменяет платёж (10s timeout), и successful_payment не придёт никогда.
  if (preCheckout) {
    if (!bot) {
      console.error('[Stars] pre_checkout received but BOT_TOKEN not set — cannot answer');
      return;
    }
    try {
      const valid = invoicePayloadIsValid(preCheckout);
      await bot.answerPreCheckoutQuery(
        preCheckout.id,
        valid,
        valid ? undefined : { error_message: 'Счёт устарел или не соответствует пользователю.' },
      );
      console.log(`[Stars] pre_checkout ${preCheckout.id} ${valid ? 'approved' : 'rejected'}`);
    } catch (e) {
      console.error('[Stars] answerPreCheckoutQuery failed:', e);
    }
    return;
  }

  // 2. Successful payment: дедупликация → валюта → payload → начисление.
  const chargeId = String(sp.provider_payment_charge_id || sp.telegram_payment_charge_id || '');
  if (!chargeId) return;

  // 2b. Валюта — только Stars (XTR).
  if (sp.currency !== 'XTR') {
    console.error(`[Stars] unexpected currency: ${sp.currency}`);
    return;
  }

  // 2c. Payload и сверка суммы с прайсом SKU.
  const payloadRaw: string = sp.invoice_payload;
  console.log('[Stars] payment received:', payloadRaw, `${sp.total_amount} XTR`);

  try {
    const parsed = JSON.parse(payloadRaw);
    const userId = Number(parsed.userId);
    const sku = String(parsed.sku || '');

    const credited = await creditPurchaseAtomic({
      chargeId,
      userId,
      payerTelegramId: Number(update?.message?.from?.id),
      sku,
      amount: Number(sp.total_amount) || -1,
      currency: String(sp.currency || ''),
    });
    if (credited.status === 'credited') {
      console.log(`[Stars] credited ${credited.gems} crystals to user ${userId}`);
    } else if (credited.status !== 'duplicate') {
      console.error(`[Stars] payment rejected (${credited.status}): ${sku}, ${sp.total_amount} XTR`);
    }
  } catch (e) {
    console.error('[Stars] payload parse error:', e);
  }
}

webhookRoutes.post('/telegram', async (req: Request, res: Response) => {
  if (!webhookAuthorized(req)) {
    return res.sendStatus(403);
  }
  try {
    await handlePaymentUpdate(req.body);
  } catch (e) {
    console.error('[webhook] payment update error:', e);
  }
  return telegramWebhookHandler(req, res);
});

// Ручные тесты платежей: curl -H "X-Telegram-Bot-Api-Secret-Token: ..." -d @update.json
webhookRoutes.post('/stars', async (req: Request, res: Response) => {
  if (!webhookAuthorized(req)) {
    return res.sendStatus(403);
  }
  try {
    await handlePaymentUpdate(req.body);
  } catch (e) {
    console.error('[webhook] stars test error:', e);
  }
  res.sendStatus(200);
});
