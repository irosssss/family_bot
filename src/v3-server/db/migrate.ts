import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { V3_MIGRATION_MANIFEST } from '../../../migrations/v3/manifest';
import { assertV3Database, type V3Database } from './client';

export interface V3Migration {
  readonly version: number;
  readonly name: string;
  readonly sql: string;
  readonly sha256: string;
}

export async function loadV3Migrations(): Promise<readonly V3Migration[]> {
  return Promise.all(V3_MIGRATION_MANIFEST.map(async entry => Object.freeze({
    version: entry.version, name: entry.name, sha256: entry.sha256, sql: await readFile(entry.file, 'utf8'),
  })));
}

function verifyManifest(migrations: readonly V3Migration[]): void {
  if (migrations.length === 0) throw new Error('v3.migration_manifest_invalid');
  for (const [index, entry] of migrations.entries()) {
    if (entry.version !== index + 1 || !/^[0-9]{4}_[a-z][a-z0-9_]*$/.test(entry.name) ||
        Number(entry.name.slice(0, 4)) !== entry.version || typeof entry.sql !== 'string' ||
        !/^[a-f0-9]{64}$/.test(entry.sha256) || createHash('sha256').update(entry.sql).digest('hex') !== entry.sha256) {
      throw new Error('v3.migration_checksum_or_manifest_invalid');
    }
  }
}

/** The optional manifest is a synthetic failure-test seam, never supplied by an HTTP request. */
export async function migrateV3Database(database: V3Database, input?: readonly V3Migration[]): Promise<{ applied: number[]; version: number }> {
  const migrations = input ?? await loadV3Migrations();
  verifyManifest(migrations);
  return database.sql.begin(async tx => {
    await assertV3Database(tx, database.config);
    // Transaction-level lock covers initial schema creation, history validation and all pending DDL.
    await tx`SELECT pg_advisory_xact_lock(30259, 31)`;
    await tx`CREATE SCHEMA IF NOT EXISTS rpg_v3`;
    await tx`CREATE TABLE IF NOT EXISTS rpg_v3.schema_migrations (
      version integer PRIMARY KEY CHECK (version > 0),
      name text NOT NULL UNIQUE,
      sha256 text NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
      applied_at timestamptz NOT NULL DEFAULT now()
    )`;
    const existing = await tx<{ version: number; name: string; sha256: string }[]>`
      SELECT version, name, sha256 FROM rpg_v3.schema_migrations ORDER BY version`;
    if (existing.length > migrations.length || existing.some((row, index) => {
      const expected = migrations[index];
      return row.version !== expected.version || row.name !== expected.name || row.sha256 !== expected.sha256;
    })) throw new Error('v3.migration_history_mismatch');
    const applied: number[] = [];
    for (const entry of migrations.slice(existing.length)) {
      await tx.unsafe(entry.sql);
      await tx`INSERT INTO rpg_v3.schema_migrations (version, name, sha256)
        VALUES (${entry.version}, ${entry.name}, ${entry.sha256})`;
      applied.push(entry.version);
    }
    return { applied, version: migrations.length };
  });
}
