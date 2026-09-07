import crypto from 'node:crypto';

export function createSignedInitData(
  telegramId: number,
  botToken: string,
  authDate = Math.floor(Date.now() / 1000),
): string {
  const fields = {
    auth_date: String(authDate),
    query_id: 'integration-test',
    user: JSON.stringify({ id: telegramId, first_name: 'Тест 50% + &' }),
  };
  const dataCheckString = Object.entries(fields).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
    .map(([key, value]) => `${key}=${value}`).join('\n');
  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const hash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
  return new URLSearchParams({ ...fields, hash }).toString();
}
