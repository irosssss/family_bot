import { createHmac, timingSafeEqual } from 'node:crypto';
import { parseStrictJson } from '../contracts/envelope.js';
import { V3Error } from '../contracts/errors.js';
import { digest } from './crypto.js';
/** The caller supplies a trusted bot token. This module never reads environment variables. */
export function telegramIdentityVerifier(botToken: string, now: () => number = Date.now) {
  if (!/^[1-9][0-9]*:[A-Za-z0-9_-]{20,}$/.test(botToken)) throw new Error('v3.telegram_config_invalid');
  const botId = botToken.split(':')[0];
  const secret = createHmac('sha256', 'WebAppData').update(botToken).digest();
  return async (raw: unknown): Promise<string> => {
    try {
      if (typeof raw !== 'string' || Buffer.byteLength(raw) > 16384 || !raw) throw 0;
      const pairs = new Map<string, string>();
      const fields = raw.split('&');
      if (fields.length > 32) throw 0;
      for (const field of fields) {
        const at = field.indexOf('=');
        if (at < 1) throw 0;
        const decode = (v: string) => decodeURIComponent(v.replace(/\+/g, ' '));
        const key = decode(field.slice(0, at)), value = decode(field.slice(at + 1));
        if (!/^[a-z_]+$/.test(key) || pairs.has(key) || /[\n\r\0]/.test(value)) throw 0;
        pairs.set(key, value);
      }
      const hash = pairs.get('hash');
      if (!hash || !/^[a-f0-9]{64}$/.test(hash)) throw 0;
      pairs.delete('hash');
      const check = [...pairs].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k,v]) => k + '=' + v).join('\n');
      if (!timingSafeEqual(createHmac('sha256', secret).update(check).digest(), Buffer.from(hash, 'hex'))) throw 0;
      const date = pairs.get('auth_date');
      if (!date || !/^[1-9][0-9]*$/.test(date)) throw 0;
      const timestamp = Number(date), seconds = Math.floor(now() / 1000);
      if (!Number.isSafeInteger(timestamp) || timestamp > seconds + 30 || seconds - timestamp > 300) throw 0;
      const user = parseStrictJson(pairs.get('user')) as { id?: unknown };
      if (!user || typeof user !== 'object' || !Number.isSafeInteger(user.id) || Number(user.id) <= 0) throw 0;
      return digest('telegram:' + botId + ':' + user.id);
    } catch { throw new V3Error('FORBIDDEN'); }
  };
}
