import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const user = process.env.SQL_USER;
const password = process.env.SQL_PASSWORD;
const database = process.env.SQL_DB_NAME;
const host = process.env.SQL_HOST; // this is a unix socket path, e.g. /app/cloudsql/instance-name

// When using postgres.js with a Unix Domain Socket, we specify host as the socket directory path.
const client = postgres({
  host: host,
  user: user,
  password: password,
  database: database,
  ssl: false,
});

export const db = drizzle(client, { schema });

/**
 * Фаза 6: уникальный индекс завершений — идемпотентность POST /complete.
 * Двойной клик / гонка двух вкладок не создают дубль: повторная вставка
 * тихо пропускается (onConflictDoNothing), фактов «сгорело золото дважды» нет.
 */
export async function ensureCompletionsIndex(): Promise<void> {
  try {
    await client`CREATE UNIQUE INDEX IF NOT EXISTS uq_completions_user_task_day ON completions (user_id, task_id, completed_at)`;
    console.log('[Phase6] uq_completions_user_task_day ensured');
  } catch (e) {
    console.error('[Phase6] ensureCompletionsIndex failed:', e);
  }
}
