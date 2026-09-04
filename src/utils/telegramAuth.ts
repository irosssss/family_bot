import crypto from 'crypto';

/**
 * Validates the Telegram initData string to ensure it's authentic and hasn't been tampered with.
 * @param initData The raw initData string from Telegram WebApp
 * @param botToken The Telegram Bot API Token used as the secret key
 * @returns boolean indicating whether the data is valid
 */
export function validateTelegramWebAppData(initData: string, botToken: string): boolean {
  if (!initData || !botToken) return false;

  try {
    // SEC-05 FIX (replay): initData старше 24 ч отклоняется — перехваченная строка
    // не должна быть бессрочным ключом. auth_date в секундах.
    const authDatePair = initData.split('&').find((p) => p.startsWith('auth_date='));
    const authDate = authDatePair ? Number(authDatePair.slice('auth_date='.length)) : NaN;
    if (!Number.isFinite(authDate)) return false;
    const ageSeconds = Date.now() / 1000 - authDate;
    const MAX_AGE_SECONDS = 24 * 60 * 60;
    if (ageSeconds < -60 || ageSeconds > MAX_AGE_SECONDS) return false; // -60s: допуск часов клиента

    // Telegram подписывает СЫРЫЕ пары ключ=значение (URL-кодированные значения).
    // Официальный алгоритм: убрать hash, отсортировать пары, склеить '\n'.
    // НЕ использовать URLSearchParams для check-string: он декодирует значения
    // и подпись перестаёт сходиться (это и был баг валидации).
    const rawPairs = initData.split('&').filter((p) => p.length > 0 && !p.startsWith('hash='));
    rawPairs.sort();
    const dataCheckString = rawPairs.join('\n');

    const hashPair = initData.split('&').find((p) => p.startsWith('hash='));
    const hash = hashPair ? hashPair.slice('hash='.length) : null;
    // Buffer.from(value, 'hex') молча отбрасывает не-hex хвост. Без строгой
    // проверки строка "<валидный hash>broken" проходила timingSafeEqual.
    if (!hash || !/^[a-f0-9]{64}$/i.test(hash)) return false;
    
    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
    const computedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

    // SEC-05 FIX (timing-safe): сравнение буферов постоянного времени
    const a = Buffer.from(computedHash, 'hex');
    const b = Buffer.from(hash, 'hex');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch (err) {
    console.error('Error validating Telegram initData:', err);
    return false;
  }
}

/**
 * Extracts the Telegram user object from initData.
 * Returns null if the user field is missing or malformed.
 */
export function parseInitDataUser(initData: string): { id: number; [key: string]: unknown } | null {
  try {
    const urlParams = new URLSearchParams(initData);
    const userStr = urlParams.get('user');
    if (!userStr) return null;
    // URLSearchParams.get уже декодирует значение. Повторный decodeURIComponent
    // ломал корректные имена, содержащие обычный символ "%".
    const parsed = JSON.parse(userStr);
    if (!parsed || typeof parsed !== 'object' || !Number.isFinite(Number((parsed as any).id))) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Express middleware to validate Telegram initData in Authorization header.
 * Example header: Authorization: tma <initData>
 */
export function telegramAuthMiddleware(req: any, res: any, next: any) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('tma ')) {
    return res.status(401).json({ error: 'Unauthorized: Missing or invalid tma token' });
  }

  const initData = authHeader.split(' ')[1];
  const botToken = process.env.BOT_TOKEN;

  if (!botToken) {
    console.error('BOT_TOKEN is not configured');
    return res.status(500).json({ error: 'Internal Server Error: Bot token missing' });
  }

  const isValid = validateTelegramWebAppData(initData, botToken);

  if (!isValid) {
    return res.status(403).json({ error: 'Forbidden: Invalid Telegram initData' });
  }

  // If valid, parse user data and attach to request
  try {
    const urlParams = new URLSearchParams(initData);
    const userStr = urlParams.get('user');
    if (userStr) {
      req.telegramUser = JSON.parse(userStr);
    }
  } catch (e) {
    console.warn('Could not parse user from initData');
  }

  next();
}
