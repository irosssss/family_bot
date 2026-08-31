/**
 * Прод-деплой: автоматическая регистрация Telegram-вебхука при старте.
 *
 * Без этого шага бот после docker compose up оставался немым — setWebhook
 * приходилось звать вручную. Теперь сервер сам регистрирует URL при старте
 * (идемпотентно: Telegram игнорирует повторную регистрацию того же URL).
 *
 * Условия регистрации (все обязательны):
 *   1. BOT_TOKEN задан (иначе bot === null — DEMO MODE).
 *   2. NODE_ENV=production — в dev сервер не имеет публичного URL.
 *   3. TELEGRAM_WEBHOOK_SECRET — prod без секрета отклоняет апдейты
 *      (см. webhookRoutes.webhookAuthorized).
 *   4. VITE_API_URL — публичный https (Telegram не принимает http и
 *      localhost; порт — 443/80/88/8443).
 */
import { bot } from './telegramBot';
import { config } from '../config';

export async function registerTelegramWebhook(): Promise<void> {
  if (!bot) {
    console.log('[webhook] BOT_TOKEN not set — registration skipped (DEMO MODE)');
    return;
  }
  if (!config.isProd) {
    console.log('[webhook] NODE_ENV!=production — registration skipped (dev)');
    return;
  }
  const secret = config.telegram.webhookSecret;
  if (!secret) {
    console.error('[webhook] TELEGRAM_WEBHOOK_SECRET is not set — bot would be muted; registration skipped');
    return;
  }
  const base = config.webAppUrl;
  if (!base || !base.startsWith('https://')) {
    console.error(`[webhook] VITE_API_URL must be a public https URL, got "${base}" — registration skipped`);
    return;
  }

  const url = `${base.replace(/\/+$/, '')}/api/webhook/telegram`;
  try {
    await bot.setWebHook(url, {
      secret_token: secret,
      // pre_checkout_query нужен для Stars-платежей (см. /api/webhook/stars —
      // сейчас недостижим: Telegram шлёт всё на один URL; follow-up — слить
      // обработку платежей в /telegram).
      allowed_updates: ['message', 'callback_query', 'pre_checkout_query'],
      drop_pending_updates: false,
    });
    const info = await bot.getWebHookInfo();
    console.log(
      `[webhook] registered: ${info.url} (pending_updates=${info.pending_update_count}, last_error=${info.last_error_message ?? 'none'})`
    );
  } catch (e) {
    console.error('[webhook] setWebHook failed:', e);
  }
}
