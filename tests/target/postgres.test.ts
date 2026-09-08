import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { readTargetConfig } from '../../src/target/config';
import { assertTargetDatabase, createTargetClient } from '../../src/target/db/client';
import { loadMigrations, runTargetMigrations } from '../../src/target/db/migrator';
import { assertOwnedContainer } from '../../scripts/target/test-environment';

const enabled = process.env.RPG_TARGET_PG_TESTS === '1';

describe.skipIf(!enabled)('task-owned PostgreSQL 18 (FT03/FT06–FT10)', () => {
  let config: ReturnType<typeof readTargetConfig>;
  let sql: ReturnType<typeof createTargetClient>;
  const directories: string[] = [];
  beforeAll(async () => {
    config = readTargetConfig(process.env);
    await assertOwnedContainer({ id: process.env.RPG_TARGET_CONTAINER_ID ?? '', runId: config.runId });
    sql = createTargetClient(config);
    await assertTargetDatabase(sql, config);
  });
  afterEach(async () => {
    if (!sql) return;
    await assertTargetDatabase(sql, config);
    await sql`DROP SCHEMA IF EXISTS content CASCADE`;
    await sql`DROP SCHEMA IF EXISTS rpg CASCADE`;
    for (const directory of directories.splice(0)) await rm(directory, { recursive: true });
  });
  afterAll(async () => { if (sql) await sql.end({ timeout: 5 }); });

  async function fixture(sources: string[]): Promise<string> {
    const directory = await mkdtemp(path.join(tmpdir(), 'family-rpg-g02-migrations-'));
    directories.push(directory);
    const migrations = [];
    for (const [index, source] of sources.entries()) {
      const name = `${String(index + 1).padStart(4, '0')}_fixture.sql`;
      await writeFile(path.join(directory, name), source);
      migrations.push({ name, sha256: createHash('sha256').update(source).digest('hex') });
    }
    await writeFile(path.join(directory, 'manifest.json'), JSON.stringify({ schema_version: 1, migrations }));
    return directory;
  }

  it('applies the reviewed bootstrap and repeats without effects', async () => {
    expect(await runTargetMigrations(sql, config, 'migrations/target')).toBe(7);
    expect(await runTargetMigrations(sql, config, 'migrations/target')).toBe(0);
    const schemas = await sql`SELECT schema_name FROM information_schema.schemata WHERE schema_name IN ('rpg', 'content') ORDER BY schema_name`;
    expect(schemas.map(row => row.schema_name)).toEqual(['content', 'rpg']);
    const rows = await sql`SELECT name FROM rpg.__target_migrations ORDER BY ordinal`;
    expect(rows.map(row => row.name)).toEqual(['0001_bootstrap.sql', '0002_family_foundation.sql', '0003_identity_exchange.sql', '0004_family_access.sql', '0005_adult_protection.sql', '0006_access_lifecycle.sql', '0007_content_release.sql']);
    expect((await sql`SELECT to_regclass('public.__migrations') AS legacy`)[0].legacy).toBeNull();
  });
  it('serializes two independent connections executing the same manifest', async () => {
    const directory = await fixture(['CREATE TABLE rpg.fixture (id integer PRIMARY KEY); INSERT INTO rpg.fixture VALUES (1); SELECT pg_sleep(0.15);']);
    const other = createTargetClient(config);
    try {
      const results = await Promise.all([runTargetMigrations(sql, config, directory), runTargetMigrations(other, config, directory)]);
      expect(results.sort()).toEqual([0, 1]);
      expect((await sql`SELECT count(*)::integer AS n FROM rpg.fixture`)[0].n).toBe(1);
    } finally { await other.end({ timeout: 5 }); }
  });
  it('rejects changed file bytes before touching DB and changed applied history before new migrations', async () => {
    const directory = await fixture(['CREATE TABLE rpg.fixture (id integer);']);
    await runTargetMigrations(sql, config, directory);
    await writeFile(path.join(directory, '0001_fixture.sql'), 'CREATE TABLE rpg.different (id integer);');
    await expect(runTargetMigrations(sql, config, directory)).rejects.toThrow('target.migration_checksum_mismatch');
    const rewritten = await fixture(['CREATE TABLE rpg.different (id integer);', 'CREATE TABLE rpg.should_not_exist (id integer);']);
    await expect(runTargetMigrations(sql, config, rewritten)).rejects.toThrow('target.migration_history_mismatch');
    expect((await sql`SELECT to_regclass('rpg.should_not_exist') AS result`)[0].result).toBeNull();
    expect((await sql`SELECT count(*)::integer AS n FROM rpg.__target_migrations`)[0].n).toBe(1);
  });
  it('rolls back failing migration SQL and journal together, preserving preceding commits', async () => {
    const directory = await fixture(['CREATE TABLE rpg.kept (id integer);',
      'CREATE TABLE rpg.rolled_back (id integer); INSERT INTO rpg.rolled_back VALUES (1); SELECT 1 / 0;']);
    await expect(runTargetMigrations(sql, config, directory)).rejects.toThrow();
    expect((await sql`SELECT to_regclass('rpg.kept') AS kept, to_regclass('rpg.rolled_back') AS lost`)[0])
      .toEqual({ kept: 'rpg.kept', lost: null });
    expect((await sql`SELECT count(*)::integer AS n FROM rpg.__target_migrations`)[0].n).toBe(1);
    // A failed migration must also release the runner lock.
    expect(await runTargetMigrations(sql, config, await fixture(['CREATE TABLE rpg.kept (id integer);']))).toBe(0);
  });
  it('rejects mismatched run marker and foreign cleanup identity without changing the database', async () => {
    const wrong = { ...config, password: config.password, runId: '0'.repeat(32) };
    await expect(runTargetMigrations(sql, wrong, 'migrations/target')).rejects.toThrow('target.database_identity_mismatch');
    expect((await sql`SELECT to_regclass('rpg.__target_migrations') AS result`)[0].result).toBeNull();
    await expect(assertOwnedContainer({ id: process.env.RPG_TARGET_CONTAINER_ID!, runId: '0'.repeat(32) }))
      .rejects.toThrow('target.cleanup_owner_mismatch');
    await expect(assertOwnedContainer({ id: 'other-container', runId: config.runId })).rejects.toThrow('target.cleanup_identity_invalid');
  });
  it('rejects missing/out-of-order/traversal manifest inputs', async () => {
    const directory = await fixture(['SELECT 1;']);
    const manifest = JSON.parse(await readFile(path.join(directory, 'manifest.json'), 'utf8'));
    for (const name of ['../0001_fixture.sql', '0002_fixture.sql', '0001_missing.sql']) {
      await writeFile(path.join(directory, 'manifest.json'), JSON.stringify({ ...manifest, migrations: [{ ...manifest.migrations[0], name }] }));
      await expect(loadMigrations(directory)).rejects.toThrow();
    }
  });
});
