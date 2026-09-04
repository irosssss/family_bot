import crypto from 'node:crypto';

export function createSignedInitData(
  telegramId: number,
  botToken: string,
  authDate = Math.floor(Date.now() / 1000),
): string {
  const pairs = [
    `auth_date=${authDate}`,
    'query_id=integration-test',
    `user=${encodeURIComponent(JSON.stringify({ id: telegramId, first_name: 'Test' }))}`,
  ];
  const dataCheckString = [...pairs].sort().join('\n');
  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const hash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
  return `${pairs.join('&')}&hash=${hash}`;
}
