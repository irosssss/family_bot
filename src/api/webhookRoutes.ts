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
import { eq } from 'drizzle-orm';
import { bot, telegramWebhookHandler } from '../bot/telegramBot';
import { creditPurchase } from './starsRoutes';
import { config } from '../config';
import { db } from '../db';
import * as schema from '../db/schema';

export const webhookRoutes = Router();

const WEBHOOK_SECRET = config.telegram.webhookSecret;
const isProd = config.isProd;

/** Проверка заголовка X-Telegram-Bot-Api-Secret-Token. */
function webhookAuthorized(req: Request): boolean {
  if (!WEBHOOK_SECRET) return !isProd; // в prod без настроенного секрета — запрещено
  return req.headers['x-telegram-bot-api-secret-token'] === WEBHOOK_SECRET;
}

// Дедупликация (DAT-01 FIX): главный барьер — таблица payments с UNIQUE(charge_id)
// в PostgreSQL (переживает рестарты). In-memory Set остаётся быстрым пре-фильтром.
const processedCharges = new Set<string>();

/**
 * Попытка записать платёж в БД ДО начисления. Возвращает false, если charge_id
 * уже существует (повторная доставка) — начисление не производится.
 */
async function claimCharge(chargeId: string, userId: number, sku: string, amount: number): Promise<boolean> {
  try {
    // ON CONFLICT DO NOTHING: гонка двух повторных доставок решается на уровне БД
    const inserted = await db.insert(schema.payments)
      .values({ charge_id: chargeId, user_id: userId, sku, amount, status: 'pending' })
      .onConflictDoNothing({ target: schema.payments.charge_id })
      .returning({ id: schema.payments.id });
    return inserted.length > 0;
  } catch (e) {
    // БД недоступна (DEMO-режим): фолбэк на in-memory Set
    console.warn('[Stars] payments table unavailable, fallback to in-memory dedup:', e instanceof Error ? e.message : e);
    return !processedCharges.has(chargeId);
  }
}

/** Пометить платёж исполненным после успешного начисления. */
async function markChargeCredited(chargeId: string): Promise<void> {
  try {
    await db.update(schema.payments)
      .set({ status: 'credited' })
      .where(eq(schema.payments.charge_id, chargeId));
  } catch {
    // DEMO: таблицы нет — не критично
  }
  processedCharges.add(chargeId);
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
      await bot.answerPreCheckoutQuery(preCheckout.id, true);
      console.log(`[Stars] pre_checkout ${preCheckout.id} approved`);
    } catch (e) {
      console.error('[Stars] answerPreCheckoutQuery failed:', e);
    }
    return;
  }

  // 2. Successful payment: дедупликация → валюта → payload → начисление.
  // 2a. Telegram может повторно доставить то же обновление (быстрый пре-фильтр;
  //     главный барьер — claimCharge в БД).
  const chargeId = String(sp.provider_payment_charge_id || sp.telegram_payment_charge_id || '');
  if (chargeId && processedCharges.has(chargeId)) {
    console.warn(`[Stars] duplicate delivery ignored: ${chargeId}`);
    return;
  }

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

    // 2b'. DAT-01 FIX: сначала занимаем charge_id в БД (UNIQUE) —
    // повторная доставка отсекается ДО начисления.
    if (chargeId) {
      const claimed = await claimCharge(chargeId, userId, sku, Number(sp.total_amount) || 0);
      if (!claimed) {
        console.warn(`[Stars] duplicate charge ignored (DB): ${chargeId}`);
        return;
      }
    }

    const credited = creditPurchase(userId, sku, Number(sp.total_amount) || -1);
    if (credited) {
      if (chargeId) await markChargeCredited(chargeId);
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
