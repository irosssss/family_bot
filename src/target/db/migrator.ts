import { createHash } from 'node:crypto';
import { readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import type postgres from 'postgres';
import type { TargetConfig } from '../config';
import { closedObject, reject } from '../contracts/errors';
import { assertTargetDatabase } from './client';

interface Migration { readonly name: string; readonly checksum: string; readonly sql: string }

export async function loadMigrations(directory: string): Promise<readonly Migration[]> {
  const root = await realpath(directory);
  async function readLocal(name: string): Promise<string> {
    const resolved = await realpath(path.join(root, name));
    if (resolved !== path.join(root, name)) return reject('target.migration_path_invalid');
    const info = await stat(resolved);
    if (!info.isFile() || info.size > 1024 * 1024) return reject('target.migration_file_invalid');
    return readFile(resolved, 'utf8');
  }
  const manifest = closedObject(JSON.parse(await readLocal('manifest.json')), ['schema_version', 'migrations']);
  if (manifest.schema_version !== 1 || !Array.isArray(manifest.migrations) || manifest.migrations.length > 1000) {
    return reject('target.manifest_invalid');
  }
  const migrations: Migration[] = [];
  for (const [index, input] of manifest.migrations.entries()) {
    const row = closedObject(input, ['name', 'sha256']);
    if (typeof row.name !== 'string' || !/^\d{4}_[a-z][a-z0-9_]*\.sql$/.test(row.name)
      || Number(row.name.slice(0, 4)) !== index + 1
      || typeof row.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(row.sha256)) return reject('target.manifest_invalid');
    const source = await readLocal(row.name);
    if (createHash('sha256').update(source).digest('hex') !== row.sha256) return reject('target.migration_checksum_mismatch');
    migrations.push(Object.freeze({ name: row.name, checksum: row.sha256, sql: source }));
  }
  return Object.freeze(migrations);
}

/** Trusted, reviewed local migrations only; never a content-package SQL executor. */
export async function runTargetMigrations(sql: postgres.Sql, config: TargetConfig, directory: string): Promise<number> {
  const migrations = await loadMigrations(directory); // freeze every input before touching the DB
  const connection = await sql.reserve();
  let locked = false;
  let backendPid: number;
  // postgres.js 3.4.9 ReservedSql declares begin() but its runtime does not expose it.
  // Explicit transaction commands are safe here because reserve() pins one session.
  async function transaction(work: (tx: postgres.ReservedSql) => Promise<void>) {
    await connection`BEGIN`;
    try {
      const [session] = await connection`SELECT pg_backend_pid() AS pid`;
      if (session.pid !== backendPid) reject('target.migration_session_lost');
      await work(connection);
      await connection`COMMIT`;
    } catch (error) {
      await connection`ROLLBACK`;
      throw error;
    }
  }
  try {
    await assertTargetDatabase(connection, config);
    const [lock] = await connection`SELECT pg_advisory_lock(70201, 1), pg_backend_pid() AS pid`;
    backendPid = lock.pid;
    locked = true;
    await transaction(async tx => {
      await tx`CREATE SCHEMA IF NOT EXISTS rpg`;
      await tx`CREATE TABLE IF NOT EXISTS rpg.__target_migrations (
        ordinal integer PRIMARY KEY CHECK (ordinal > 0), name text UNIQUE NOT NULL,
        checksum text NOT NULL CHECK (checksum ~ '^[a-f0-9]{64}$'), applied_at timestamptz NOT NULL DEFAULT now()
      )`;
    });
    const applied = await connection`SELECT ordinal, name, checksum FROM rpg.__target_migrations ORDER BY ordinal`;
    for (const [index, row] of applied.entries()) {
      const expected = migrations[index];
      if (!expected || row.ordinal !== index + 1 || row.name !== expected.name || row.checksum !== expected.checksum) {
        return reject('target.migration_history_mismatch');
      }
    }
    for (let index = applied.length; index < migrations.length; index++) {
      const migration = migrations[index];
      await transaction(async tx => {
        await tx.unsafe(migration.sql);
        await tx`INSERT INTO rpg.__target_migrations (ordinal, name, checksum)
          VALUES (${index + 1}, ${migration.name}, ${migration.checksum})`;
      });
    }
    return migrations.length - applied.length;
  } finally {
    try { if (locked) await connection`SELECT pg_advisory_unlock(70201, 1)`; }
    finally { connection.release(); }
  }
}
