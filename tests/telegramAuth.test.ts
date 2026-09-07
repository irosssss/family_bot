/**
 * Регрессия Telegram HMAC и freshness (freshness не гарантирует одноразовость).
 * Фиксированный Python-vector независим от runtime и тестового signer.
 */
import { afterEach, describe, it, expect, vi } from 'vitest';
import crypto from 'crypto';
import vector from './fixtures/telegram-init-data.json';
import {
  validateTelegramWebAppData,
  parseInitDataUser,
} from '../src/utils/telegramAuth';

const BOT_TOKEN = '7000000000:TEST_TOKEN_FOR_UNIT_TESTS';
afterEach(() => vi.restoreAllMocks());

/** Подписать initData как это делает Telegram. */
function signInitData(pairs: Record<string, string>): string {
  const dataCheckString = Object.entries(pairs)
    .map(([k, v]) => `${k}=${v}`)
    .sort()
    .join('\n');
  const secretKey = crypto
    .createHmac('sha256', 'WebAppData')
    .update(BOT_TOKEN)
    .digest();
  const hash = crypto
    .createHmac('sha256', secretKey)
    .update(dataCheckString)
    .digest('hex');
  return new URLSearchParams({ ...pairs, hash }).toString();
}

function freshInitData(ageSeconds = 0): string {
  return signInitData({
    auth_date: String(Math.floor(Date.now() / 1000) - ageSeconds),
    query_id: 'AAF_test',
    user: JSON.stringify({ id: 69513172, first_name: 'Misha' }),
  });
}

describe('validateTelegramWebAppData', () => {
  it('принимает свежую валидную подпись', () => {
    expect(validateTelegramWebAppData(freshInitData(), BOT_TOKEN)).toBe(true);
  });

  it('отклоняет подпись с чужим токеном', () => {
    expect(validateTelegramWebAppData(freshInitData(), 'different-test-key')).toBe(false);
  });

  it('отклоняет подделанное значение после подписи (сорванная пара)', () => {
    const valid = freshInitData();
    // подменяем first_name, сохраняя hash → подпись не сходится
    const forged = valid.replace('Misha', 'Hacker');
    expect(forged).not.toBe(valid);
    expect(validateTelegramWebAppData(forged, BOT_TOKEN)).toBe(false);
  });

  it('отклоняет initData старше 24 часов', () => {
    expect(validateTelegramWebAppData(freshInitData(25 * 60 * 60), BOT_TOKEN)).toBe(false);
  });

  it('принимает initData в пределах 24 часов', () => {
    expect(validateTelegramWebAppData(freshInitData(23 * 60 * 60), BOT_TOKEN)).toBe(true);
  });

  it('отклоняет initData без auth_date', () => {
    const noDate = signInitData({
      query_id: 'AAF_test',
      user: '{"id":1}',
    });
    expect(validateTelegramWebAppData(noDate, BOT_TOKEN)).toBe(false);
  });

  it('отклоняет пустые входы', () => {
    expect(validateTelegramWebAppData('', BOT_TOKEN)).toBe(false);
    expect(validateTelegramWebAppData(freshInitData(), '')).toBe(false);
  });

  it('отклоняет мусор после корректного 64-символьного hash', () => {
    expect(validateTelegramWebAppData(`${freshInitData()}broken`, BOT_TOKEN)).toBe(false);
  });

  it('проверяет подпись декодированных значений ровно один раз', () => {
    const data = signInitData({
      auth_date: String(Math.floor(Date.now() / 1000)),
      query_id: 'AAF',
      user: JSON.stringify({ id: 1, first_name: 'Семён 50% + & = %26' }),
    });
    expect(validateTelegramWebAppData(data, BOT_TOKEN)).toBe(true);
  });

  it('принимает независимый Python-vector с Unicode, escaping и signature', () => {
    vi.spyOn(Date, 'now').mockReturnValue(vector.nowMs);
    expect(validateTelegramWebAppData(`${vector.query}&hash=${vector.hash}`, vector.botToken)).toBe(true);
  });

  it('не принимает прежнюю ошибочную подпись URL-кодированных пар', () => {
    vi.spyOn(Date, 'now').mockReturnValue(vector.nowMs);
    expect(validateTelegramWebAppData(`${vector.query}&hash=${vector.legacyEncodedHash}`, vector.botToken)).toBe(false);
  });

  it('не зависит от порядка query и эквивалентного кодирования пробелов', () => {
    vi.spyOn(Date, 'now').mockReturnValue(vector.nowMs);
    const reordered = `${vector.query}&hash=${vector.hash}`.split('&').reverse().join('&').replace(/\+/g, '%20');
    expect(validateTelegramWebAppData(reordered, vector.botToken)).toBe(true);
  });

  it('включает signature в HMAC и не пересериализует JSON', () => {
    vi.spyOn(Date, 'now').mockReturnValue(vector.nowMs);
    const params = new URLSearchParams(vector.query);
    params.set('hash', vector.hash);
    params.delete('signature');
    expect(validateTelegramWebAppData(params.toString(), vector.botToken)).toBe(false);
    const normalized = new URLSearchParams(vector.query);
    normalized.set('hash', vector.hash);
    normalized.set('user', JSON.stringify(JSON.parse(normalized.get('user')!)));
    expect(validateTelegramWebAppData(normalized.toString(), vector.botToken)).toBe(false);
  });

  it.each(['user=%7B%22id%22%3A2%7D', '%75ser=%7B%22id%22%3A2%7D', 'auth_date=1', 'hash=' + '0'.repeat(64)])('отклоняет повторное поле %s', (extra) => {
    expect(validateTelegramWebAppData(`${freshInitData()}&${extra}`, BOT_TOKEN)).toBe(false);
  });

  it.each(['%', '%GG', '%C3%28', '%FF'])('отклоняет повреждённое кодирование %s даже с совпадающей подписью', (raw) => {
    const date = String(Math.floor(Date.now() / 1000));
    const decodedByTolerantParser = new URLSearchParams(`extra=${raw}`).get('extra')!;
    const signed = signInitData({ auth_date: date, extra: decodedByTolerantParser });
    const hash = new URLSearchParams(signed).get('hash');
    expect(validateTelegramWebAppData(`auth_date=${date}&extra=${raw}&hash=${hash}`, BOT_TOKEN)).toBe(false);
  });

  it.each(['', '1.5', '1e9', '-1', 'NaN'])('отклоняет нецелый/некорректный auth_date %s', (auth_date) => {
    expect(validateTelegramWebAppData(signInitData({ auth_date }), BOT_TOKEN)).toBe(false);
  });

  it.each(['a\nb=c', 'a\rb=c'])('отклоняет подписанные значения с разделителями строк', (extra) => {
    expect(validateTelegramWebAppData(signInitData({
      auth_date: String(Math.floor(Date.now() / 1000)), extra,
    }), BOT_TOKEN)).toBe(false);
  });

  it('сохраняет границы freshness: 24 часа и опережение 60 секунд', () => {
    vi.spyOn(Date, 'now').mockReturnValue(vector.nowMs);
    expect(validateTelegramWebAppData(freshInitData(86400), BOT_TOKEN)).toBe(true);
    expect(validateTelegramWebAppData(freshInitData(86401), BOT_TOKEN)).toBe(false);
    expect(validateTelegramWebAppData(freshInitData(-60), BOT_TOKEN)).toBe(true);
    expect(validateTelegramWebAppData(freshInitData(-61), BOT_TOKEN)).toBe(false);
  });
});

describe('parseInitDataUser', () => {
  it('извлекает пользователя из валидной строки', () => {
    const u = parseInitDataUser(freshInitData());
    expect(u).not.toBeNull();
    expect(u!.id).toBe(69513172);
  });

  it('возвращает null без user-поля', () => {
    expect(parseInitDataUser(signInitData({ auth_date: '1' }))).toBeNull();
  });

  it('не декодирует user повторно, если имя содержит знак процента', () => {
    const initData = signInitData({
      auth_date: String(Math.floor(Date.now() / 1000)),
      user: JSON.stringify({ id: 17, first_name: 'Скидка 50%' }),
    });
    expect(parseInitDataUser(initData)).toMatchObject({ id: 17, first_name: 'Скидка 50%' });
  });

  it('отклоняет неоднозначное user-поле', () => {
    expect(parseInitDataUser(`${freshInitData()}&%75ser=%7B%22id%22%3A2%7D`)).toBeNull();
  });

  it.each([null, [], { id: '17' }, { id: null }, { id: true }, { id: -1 }, { id: 1.5 }, { id: 9007199254740992 }])('отклоняет некорректный user %j', (user) => {
    expect(parseInitDataUser(new URLSearchParams({ user: JSON.stringify(user) }).toString())).toBeNull();
  });
});
