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
    const urlParams = new URLSearchParams(initData);
    const hash = urlParams.get('hash');
    
    if (!hash) return false;
    
    urlParams.delete('hash');
    
    const paramsList: string[] = [];
    urlParams.forEach((value, key) => {
      paramsList.push(`${key}=${value}`);
    });
    
    paramsList.sort();
    const dataCheckString = paramsList.join('\n');
    
    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
    const computedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
    
    return computedHash === hash;
  } catch (err) {
    console.error('Error validating Telegram initData:', err);
    return false;
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
      req.telegramUser = JSON.parse(decodeURIComponent(userStr));
    }
  } catch (e) {
    console.warn('Could not parse user from initData');
  }

  next();
}
