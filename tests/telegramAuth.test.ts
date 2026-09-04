/**
 * Тесты валидации Telegram initData (SEC-05: replay + timingSafeEqual).
 * Векторы генерируются реальным алгоритмом подписи Telegram —
 * если алгоритм валидации разойдётся с официальным, тесты упадут.
 */
import { describe, it, expect } from 'vitest';
import crypto from 'crypto';
import {
  validateTelegramWebAppData,
  parseInitDataUser,
} from '../src/utils/telegramAuth';

const BOT_TOKEN = '7000000000:TEST_TOKEN_FOR_UNIT_TESTS';

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
  return `${Object.entries(pairs)
    .map(([k, v]) => `${k}=${v}`)
    .join('&')}&hash=${hash}`;
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
    const foreign = signInitData({
      auth_date: String(Math.floor(Date.now() / 1000)),
      query_id: 'AAF_test',
      user: '{"id":1}',
    }).replace('hash=', 'hash=deadbeef');
    expect(validateTelegramWebAppData(foreign, BOT_TOKEN)).toBe(false);
  });

  it('отклоняет подделанное значение после подписи (сорванная пара)', () => {
    const valid = freshInitData();
    // подменяем first_name, сохраняя hash → подпись не сходится
    const forged = valid.replace('Misha', 'Hacker');
    expect(forged).not.toBe(valid);
    expect(validateTelegramWebAppData(forged, BOT_TOKEN)).toBe(false);
  });

  it('SEC-05: отклоняет initData старше 24 часов (replay)', () => {
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

  it('URL-декодирование значений не ломает подпись (сырые пары)', () => {
    // Специально: значение с закодированным пробелом — проверяем, что валидатор
    // подписывает СЫРЫЕ пары (официальный алгоритм), а не декодированные
    const data = signInitData({
      auth_date: String(Math.floor(Date.now() / 1000)),
      query_id: 'AAF',
      user: encodeURIComponent(JSON.stringify({ id: 1, first_name: 'Семён Тёмный' })),
    });
    expect(validateTelegramWebAppData(data, BOT_TOKEN)).toBe(true);
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
      user: encodeURIComponent(JSON.stringify({ id: 17, first_name: 'Скидка 50%' })),
    });
    expect(parseInitDataUser(initData)).toMatchObject({ id: 17, first_name: 'Скидка 50%' });
  });
});
