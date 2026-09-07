import crypto from 'crypto';

/** Один строгий разбор для подписи и user: без неоднозначных дублей/замены UTF-8. */
function parseInitDataFields(initData: string): Map<string, string> {
  const fields = new Map<string, string>();
  for (const pair of initData.split('&')) {
    const separator = pair.indexOf('=');
    if (separator <= 0) throw new Error('Invalid initData field');
    const decode = (value: string) => decodeURIComponent(value.replace(/\+/g, ' '));
    const key = decode(pair.slice(0, separator));
    const value = decode(pair.slice(separator + 1));
    if (!key || /[\r\n=]/.test(key) || /[\r\n]/.test(value) || fields.has(key)) {
      throw new Error('Ambiguous initData field');
    }
    fields.set(key, value);
  }
  return fields;
}

/**
 * Validates the Telegram initData string to ensure it's authentic and hasn't been tampered with.
 * @param initData The raw initData string from Telegram WebApp
 * @param botToken The Telegram Bot API Token used as the secret key
 * @returns boolean indicating whether the data is valid
 */
export function validateTelegramWebAppData(initData: string, botToken: string): boolean {
  if (!initData || !botToken) return false;

  try {
    const fields = parseInitDataFields(initData);
    // Сохраняем существующее окно свежести. Это не защита от повторного обмена.
    const authDateText = fields.get('auth_date');
    if (!authDateText || !/^[0-9]+$/.test(authDateText)) return false;
    const authDate = Number(authDateText);
    if (!Number.isSafeInteger(authDate) || authDate <= 0) return false;
    const ageSeconds = Date.now() / 1000 - authDate;
    const MAX_AGE_SECONDS = 24 * 60 * 60;
    if (ageSeconds < -60 || ageSeconds > MAX_AGE_SECONDS) return false; // допуск серверных часов

    // HMAC подписывает декодированные значения query, JSON не пересериализуется.
    // Исключается только hash: signature (если есть) тоже входит в HMAC.
    // https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
    const dataCheckString = [...fields.keys()]
      .filter((key) => key !== 'hash')
      .sort()
      .map((key) => `${key}=${fields.get(key)}`)
      .join('\n');

    const hash = fields.get('hash');
    // Buffer.from(value, 'hex') молча отбрасывает не-hex хвост. Без строгой
    // проверки строка "<валидный hash>broken" проходила timingSafeEqual.
    if (!hash || !/^[a-f0-9]{64}$/i.test(hash)) return false;
    
    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
    const computedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

    // SEC-05 FIX (timing-safe): сравнение буферов постоянного времени
    const a = Buffer.from(computedHash, 'hex');
    const b = Buffer.from(hash, 'hex');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch {
    // Невалидный ввод не должен попадать вместе с ошибкой в логи авторизации.
    return false;
  }
}

/**
 * Extracts the Telegram user object from initData.
 * Returns null if the user field is missing or malformed. Does not verify identity:
 * callers must validateTelegramWebAppData before trusting this result.
 */
export function parseInitDataUser(initData: string): { id: number; [key: string]: unknown } | null {
  try {
    const userStr = parseInitDataFields(initData).get('user');
    if (!userStr) return null;
    // parseInitDataFields уже декодирует значение. Повторный decodeURIComponent
    // ломал корректные имена, содержащие обычный символ "%".
    const parsed = JSON.parse(userStr);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)
      || !Number.isSafeInteger(parsed.id) || parsed.id <= 0) {
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
  if (typeof authHeader !== 'string' || !authHeader.startsWith('tma ')) {
    return res.status(401).json({ error: 'Unauthorized: Missing or invalid tma token' });
  }

  const initData = authHeader.slice(4).trim();
  const botToken = process.env.BOT_TOKEN;

  if (!botToken) {
    console.error('BOT_TOKEN is not configured');
    return res.status(500).json({ error: 'Internal Server Error: Bot token missing' });
  }

  const isValid = validateTelegramWebAppData(initData, botToken);

  if (!isValid) {
    return res.status(403).json({ error: 'Forbidden: Invalid Telegram initData' });
  }

  const user = parseInitDataUser(initData);
  if (!user) return res.status(403).json({ error: 'Forbidden: no user in initData' });
  req.telegramUser = user;
  next();
}
