/**
 * Контроль доступа Telegram-бота (этап H3 аудита).
 *
 * Модель: TELEGRAM_ALLOWED_USERS — whitelist Telegram-ID через запятую.
 *  - Список пуст → проверка отключена (dev / переходный период), все хендлеры работают.
 *  - Список задан → чужие id молча игнорируются (с одним вежливым отказом).
 *
 * Важно: callback_query «approve_task_*» начисляет золото — чужак не должен
 * иметь даже теоретического доступа к кнопкам, поэтому guard стоит первым
 * во всех четырёх хендлерах (включая /start и /invite).
 */
import { config } from '../config';

/** Парсинг "69513172,12345" → Set<number>; мусор молча отбрасывается. */
export function parseAllowedUsers(raw: string): Set<number> {
  return new Set(
    raw
      .split(',')
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isInteger(n) && n > 0)
  );
}

let cachedList: Set<number> | null = null;

function getList(): Set<number> {
  if (!cachedList) {
    cachedList = parseAllowedUsers(config.telegram.allowedUsers || '');
  }
  return cachedList;
}

/** true = хендлеру можно работать с этим пользователем. */
export function isUserAllowed(telegramId: number | undefined | null): boolean {
  if (!telegramId || !Number.isInteger(telegramId)) return false;
  const list = getList();
  if (list.size === 0) return true; // whitelist не задан — не режем
  return list.has(telegramId);
}

export const DENY_TEXT = 'Доступ закрыт: бот работает только для членов семьи.';
