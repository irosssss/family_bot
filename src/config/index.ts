/**
 * Централизованная конфигурация приложения.
 *
 * Все переменные окружения читаются в одном месте — остальной код
 * импортирует типобезопасный объект `config` вместо разбросанных
 * `process.env.*`. Дефолты подобраны так, чтобы не ломать прод при
 * отсутствии необязательных переменных.
 *
 * Источник правды для `.env.example` — при добавлении новой переменной
 * обновляйте и `.env.example`.
 */

function required(key: string, fallback?: string): string | undefined {
  const value = process.env[key];
  if (value === undefined || value === '') {
    return fallback;
  }
  return value;
}

function asInt(key: string, fallback: number): number {
  const raw = process.env[key];
  if (raw === undefined || raw === '') return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

export const config = {
  env: process.env.NODE_ENV || 'production',
  isProd: (process.env.NODE_ENV || 'production') === 'production',
  isDev: process.env.NODE_ENV === 'development',

  port: asInt('PORT', 3000),

  /** Telegram-бот: токен, чат для пуш-уведомлений и секрет вебхуков. */
  telegram: {
    botToken: required('BOT_TOKEN'),
    chatId: required('TELEGRAM_CHAT_ID'),
    /** Секрет из setWebhook(secret_token=...); без него Stars-начисления в prod запрещены. */
    webhookSecret: required('TELEGRAM_WEBHOOK_SECRET'),
  },

  /** Подключение к PostgreSQL (Cloud SQL через Unix-сокет или обычный хост). */
  database: {
    user: required('SQL_USER'),
    password: required('SQL_PASSWORD'),
    name: required('SQL_DB_NAME'),
    host: required('SQL_HOST'),
    adminUser: required('SQL_ADMIN_USER'),
    adminPassword: required('SQL_ADMIN_PASSWORD'),
  },

  /** URL Mini App (используется кнопкой web_app в Telegram). */
  webAppUrl: required('VITE_API_URL'),

  /** Sentry (мониторинг ошибок) — необязательно. */
  sentryDsn: required('SENTRY_DSN'),

  /** S3-хранилище игровых ассетов. */
  s3: {
    region: required('S3_REGION'),
    endpoint: required('S3_ENDPOINT'),
    accessKeyId: required('S3_ACCESS_KEY_ID'),
    secretAccessKey: required('S3_SECRET_ACCESS_KEY'),
    bucketName: required('S3_BUCKET_NAME'),
    publicUrl: required('S3_PUBLIC_URL'),
  },
} as const;

export type AppConfig = typeof config;
