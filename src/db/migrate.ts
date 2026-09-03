/**
 * Простой migrator (DAT-02 FIX): применяет SQL-файлы из migrations/ по порядку
 * и ведёт журнал в таблице __migrations. Идемпотентно: уже применённые файлы
 * пропускаются (по имени). Запуск: npm run db:migrate
 *
 * Старые ad-hoc файлы (002_*, add_*, fix_*) уже применены на живых стендах —
 * их имена добавлены в baseline ниже, чтобы migrator не пытался выполнить их
 * повторно на существующей БД. Новые файлы — только 00xx_*.sql по порядку.
 */
import fs from 'fs';
import path from 'path';
import { client } from './index';

const MIGRATIONS_DIR = path.resolve(process.cwd(), 'migrations');

/** Файлы, применённые до введения журнала (исторический порядок). */
const BASELINE_APPLIED = [
  '002_family_hp.sql',
  'add_family_roles.sql',
  'add_quest_tasks.sql',
  'add_streak_fields.sql',
  'add_streak_system_v2.sql',
  'add_task_system_v2.sql',
  'add_user_age.sql',
  'fix_streak_bugs.sql',
  'seed_parents.sql',
  '0013_payments_table.sql',
];

async function ensureTable(): Promise<void> {
  await client`CREATE TABLE IF NOT EXISTS __migrations (
    name TEXT PRIMARY KEY,
    applied_at TIMESTAMP DEFAULT NOW()
  )`;
}

async function isApplied(name: string): Promise<boolean> {
  const rows = await client`SELECT 1 FROM __migrations WHERE name = ${name}`;
  return rows.length > 0;
}

export async function runMigrations(): Promise<void> {
  await ensureTable();

  // Baseline: фиксируем исторические миграции как применённые (без выполнения)
  for (const name of BASELINE_APPLIED) {
    if (!(await isApplied(name))) {
      await client`INSERT INTO __migrations (name) VALUES (${name}) ON CONFLICT DO NOTHING`;
      console.log(`[migrate] baseline: ${name}`);
    }
  }

  // Файлы по порядку: 00xx_*.sql
  const files = fs.readdirSync(MIGRATIONS_DIR)
    .filter((f) => /^\d{4}_.*\.sql$/.test(f))
    .sort();

  for (const file of files) {
    if (await isApplied(file)) continue;
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf-8');
    console.log(`[migrate] applying ${file}...`);
    try {
      await client.unsafe(sql);
      await client`INSERT INTO __migrations (name) VALUES (${file}) ON CONFLICT DO NOTHING`;
      console.log(`[migrate] OK ${file}`);
    } catch (e) {
      console.error(`[migrate] FAILED ${file}:`, e);
      throw e;
    }
  }
  console.log('[migrate] up to date');
}

// CLI: npm run db:migrate
if (process.argv[1] && process.argv[1].endsWith('migrate.ts')) {
  runMigrations()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
