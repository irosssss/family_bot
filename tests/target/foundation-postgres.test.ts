import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { eq, sql as query } from 'drizzle-orm';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { generateDrizzleJson, generateMigration } from 'drizzle-kit/api';
import { readTargetConfig } from '../../src/target/config';
import { assertTargetDatabase, createTargetClient } from '../../src/target/db/client';
import { openTargetDatabase } from '../../src/target/db/database';
import { loadMigrations, runTargetMigrations } from '../../src/target/db/migrator';
import * as schema from '../../src/target/db/schema/foundation';
import { foundationRecordToDto, parseRetentionPolicyRecord } from '../../src/target/contracts/foundation';
import { int, uint } from '../../src/target/contracts/numbers';
import { assertOwnedContainer } from '../../scripts/target/test-environment';
import { accountFixture, familyFixture, fixturePayloadParser, playerFixture, profileFixture, retentionFixture, time } from './foundation-fixtures';

const enabled = process.env.RPG_TARGET_PG_TESTS === '1';
describe.skipIf(!enabled)('family foundation in owned PostgreSQL (FB01–FB06)', () => {
  let config: ReturnType<typeof readTargetConfig>;
  let raw: ReturnType<typeof createTargetClient>;
  let database: Awaited<ReturnType<typeof openTargetDatabase>>;
  const directories: string[] = [];
  beforeAll(async () => {
    config = readTargetConfig(process.env);
    await assertOwnedContainer({ id: process.env.RPG_TARGET_CONTAINER_ID ?? '', runId: config.runId });
    raw = createTargetClient(config);
    await assertTargetDatabase(raw, config);
    database = await openTargetDatabase(config);
  });
  async function reset() {
    await assertTargetDatabase(raw, config);
    await raw`DROP SCHEMA IF EXISTS content CASCADE`;
    await raw`DROP SCHEMA IF EXISTS rpg CASCADE`;
  }
  beforeEach(async () => {
    await runTargetMigrations(raw, config, 'migrations/target');
    await database.db.insert(schema.retentionPolicyRevisions).values(retentionFixture());
  });
  afterEach(async () => {
    if (raw !== undefined) await reset();
    for (const directory of directories.splice(0)) await rm(directory, { recursive: true });
  });
  afterAll(async () => {
    try { if (database) await database.close(); }
    finally { if (raw) await raw.end({ timeout: 5 }); }
  });
  async function familyGraph() {
    const first = familyFixture(), second = familyFixture();
    const parent = profileFixture(first.id, 'parent'), child = profileFixture(first.id), otherChild = profileFixture(second.id);
    await database.db.insert(schema.families).values([first, second]);
    await database.db.insert(schema.memberProfiles).values([parent, child, otherChild]);
    return { first, second, parent, child, otherChild };
  }
  // Direct postgres writes deliberately bypass all TypeScript record validators and Drizzle mappings.
  async function insertPlayer(familyId: string, profileId: string, role = 'child') {
    const p = playerFixture(familyId, profileId);
    return raw`INSERT INTO rpg.players (id,schema_version,created_at,retention_policy_id,retention_policy_revision,family_id,profile_id,role)
      VALUES (${p.id},${p.schema_version},${p.created_at},${p.retention_policy_id},${p.retention_policy_revision},${familyId},${profileId},${role})`;
  }
  it('creates the complete schema concurrently and repeats without duplicate history', async () => {
    await reset();
    const other = createTargetClient(config);
    try {
      expect((await Promise.all([runTargetMigrations(raw, config, 'migrations/target'), runTargetMigrations(other, config, 'migrations/target')])).sort()).toEqual([0, 4]);
      expect(await runTargetMigrations(raw, config, 'migrations/target')).toBe(0);
      expect((await raw`SELECT name FROM rpg.__target_migrations ORDER BY ordinal`).map(r => r.name)).toEqual(['0001_bootstrap.sql', '0002_family_foundation.sql', '0003_identity_exchange.sql', '0004_family_access.sql']);
      expect((await raw`SELECT count(*)::int AS n FROM rpg.retention_policy_revisions`)[0].n).toBe(0);
    } finally { await other.end({ timeout: 5 }); }
  });
  it('rejects cross-family and parent players even through direct SQL, including reverse role changes', async () => {
    const { first, second, parent, child } = await familyGraph();
    await expect(insertPlayer(second.id, child.id)).rejects.toMatchObject({ code: '23503', constraint_name: 'players_child_profile_fk' });
    await expect(insertPlayer(first.id, parent.id)).rejects.toMatchObject({ code: '23503', constraint_name: 'players_child_profile_fk' });
    await expect(insertPlayer(first.id, parent.id, 'parent')).rejects.toMatchObject({ code: '23514', constraint_name: 'players_child_only' });
    await insertPlayer(first.id, child.id);
    await expect(insertPlayer(first.id, child.id)).rejects.toMatchObject({ code: '23505', constraint_name: 'players_family_profile_uq' });
    await expect(raw`UPDATE rpg.member_profiles SET family_role = 'parent' WHERE id = ${child.id}`).rejects.toMatchObject({ code: '23503' });
    await expect(raw`UPDATE rpg.member_profiles SET family_id = ${second.id} WHERE id = ${child.id}`).rejects.toMatchObject({ code: '23503' });
    await expect(raw`DELETE FROM rpg.families WHERE id = ${first.id}`).rejects.toMatchObject({ code: '23503' });
    expect((await raw`SELECT count(*)::int AS n FROM rpg.member_profiles WHERE display_name = 'Саша'`)[0].n).toBe(3);
    expect((await raw`SELECT count(*)::int AS n FROM rpg.players`)[0].n).toBe(1);
  });
  it('enforces exact retention references, revisions, UUID version and state/timestamp coherence', async () => {
    const account = accountFixture(), { first, child } = await familyGraph();
    await database.db.insert(schema.accounts).values(account);
    await expect(raw`UPDATE rpg.accounts SET retention_policy_revision = 2 WHERE id = ${account.id}`).rejects.toMatchObject({ code: '23503' });
    await expect(raw`DELETE FROM rpg.retention_policy_revisions`).rejects.toMatchObject({ code: '23503' });
    await expect(raw`UPDATE rpg.accounts SET id = '017f22e2-79b0-4cc3-98c4-dc0c0c07398f' WHERE id = ${account.id}`).rejects.toMatchObject({ code: '23514' });
    for (const changes of [query`state_revision = 0`, query`schema_version = 2`, query`status = 'unknown'`, query`status = 'disabled'`,
      query`disabled_at = ${time}::timestamptz`, query`updated_at = 'infinity'::timestamptz`, query`updated_at = created_at - interval '1 millisecond'`]) {
      await expect(database.db.execute(query`UPDATE ${schema.accounts} SET ${changes} WHERE id = ${account.id}`)).rejects.toThrow();
    }
    await expect(raw`UPDATE rpg.accounts SET state_revision = ${'1.5'} WHERE id = ${account.id}`).rejects.toMatchObject({ code: '22P02' });
    await expect(raw`UPDATE rpg.accounts SET state_revision = ${'2147483648'} WHERE id = ${account.id}`).rejects.toMatchObject({ code: '22003' });
    await expect(raw`UPDATE rpg.families SET calendar_revision = 0 WHERE id = ${first.id}`).rejects.toMatchObject({ code: '23514' });
    await expect(raw`UPDATE rpg.families SET membership_revision = 0 WHERE id = ${first.id}`).rejects.toMatchObject({ code: '23514' });
    await expect(raw`UPDATE rpg.families SET recurrence_paused = true WHERE id = ${first.id}`).rejects.toMatchObject({ code: '23514' });
    await expect(raw`UPDATE rpg.families SET status = 'archived' WHERE id = ${first.id}`).rejects.toMatchObject({ code: '23514' });
    await expect(raw`UPDATE rpg.member_profiles SET status = 'left' WHERE id = ${child.id}`).rejects.toMatchObject({ code: '23514' });
    await raw`UPDATE rpg.accounts SET status = 'disabled', disabled_at = ${time}, state_revision = 2 WHERE id = ${account.id}`;
    await raw`UPDATE rpg.families SET status = 'archived', archived_at = ${time}, recurrence_paused = true, recurrence_paused_at = ${time}, state_revision = 2 WHERE id = ${first.id}`;
    await raw`UPDATE rpg.member_profiles SET status = 'left', left_at = ${time}, state_revision = 2 WHERE id = ${child.id}`;
  });
  it('roundtrips Drizzle dates/JSON/exact values without modifying the separate raw client serializers', async () => {
    const account = { ...accountFixture(), state_revision: 2147483647 }, family = familyFixture();
    await database.db.insert(schema.accounts).values(account);
    await database.db.insert(schema.families).values(family);
    const [stored] = await database.db.select().from(schema.accounts).where(eq(schema.accounts.id, account.id));
    expect(foundationRecordToDto('account', stored)).toEqual(account);
    const [storedFamily] = await database.db.select().from(schema.families);
    expect(foundationRecordToDto('family', storedFamily)).toEqual(family);
    const [policy] = await database.db.select().from(schema.retentionPolicyRevisions);
    expect(parseRetentionPolicyRecord(policy, fixturePayloadParser)).toEqual(retentionFixture());
    expect(JSON.parse(JSON.stringify(policy)).policy_payload.value.exact_probe).toBe('9223372036854775807');
    const [limits] = await database.db.select({ max: query<bigint>`9223372036854775807::bigint`.mapWith(BigInt),
      min: query<bigint>`(-9223372036854775807)::bigint`.mapWith(BigInt) }).from(schema.retentionPolicyRevisions);
    expect(uint(limits.max.toString())).toBe('9223372036854775807');
    expect(int(limits.min.toString())).toBe('-9223372036854775807');
    expect(limits.max + limits.min).toBe(0n);
    const probe = { exact: '9223372036854775807', label: 'Тест' };
    expect((await raw`SELECT ${raw.json(probe)}::jsonb AS value`)[0].value).toEqual(probe);
    for (const payload of [{}, [], null, { contract_id: 'fixture_retention', schema_version: 1, value: null },
      { contract_id: 'fixture_retention', schema_version: 1, value: {}, unexpected: true }]) {
      await expect(raw`UPDATE rpg.retention_policy_revisions SET policy_payload = ${JSON.stringify(payload)}::jsonb`).rejects.toThrow();
    }
  });
  it('matches reviewed generated DDL and actual PostgreSQL columns, constraints and FK actions', async () => {
    const before = generateDrizzleJson({ rpg: schema.rpg });
    const statements = await generateMigration(before, generateDrizzleJson(schema.foundationSchema, before.id));
    expect(await readFile('migrations/target/0002_family_foundation.sql', 'utf8')).toBe(
      '-- G02-B: generated from the target Drizzle schema; reviewed before disposable execution.\n' + statements.join('\n\n') + '\n');
    for (const table of schema.foundationTables) {
      const cfg = getTableConfig(table);
      const columns = await raw`SELECT a.attname AS name, format_type(a.atttypid,a.atttypmod) AS type, a.attnotnull AS required,
        co.collname AS collation FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace
        LEFT JOIN pg_collation co ON co.oid=a.attcollation WHERE n.nspname='rpg' AND c.relname=${cfg.name} AND a.attnum>0 AND NOT a.attisdropped ORDER BY a.attnum`;
      expect(columns.map(c => [c.name, c.type, c.required])).toEqual(cfg.columns.map(c => [c.name, c.getSQLType().replace(' COLLATE "C"', ''), c.notNull]));
      for (const column of cfg.columns.filter(c => c.getSQLType().includes('COLLATE'))) expect(columns.find(c => c.name === column.name)?.collation).toBe('C');
      const constraints = await raw`SELECT con.conname AS name, con.contype AS type, con.convalidated AS validated,
        con.confdeltype AS delete_action, con.confupdtype AS update_action FROM pg_constraint con JOIN pg_class c ON c.oid=con.conrelid
        JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='rpg' AND c.relname=${cfg.name} AND con.contype <> 'n'`;
      const expected = [...cfg.checks.map(c => c.name), ...cfg.uniqueConstraints.map(c => c.getName()), ...cfg.foreignKeys.map(c => c.getName()),
        ...cfg.primaryKeys.map(c => c.getName()), ...(cfg.columns.some(c => c.primary) ? [`${cfg.name}_pkey`] : [])];
      expect(constraints.map(c => c.name).sort()).toEqual(expected.sort());
      expect(constraints.every(c => c.validated)).toBe(true);
      for (const fk of constraints.filter(c => c.type === 'f')) expect([fk.delete_action, fk.update_action]).toEqual(['a', 'a']);
    }
    expect((await raw`SELECT indexname FROM pg_indexes WHERE schemaname='rpg' AND indexname='member_profiles_home_idx'`).length).toBe(1);
  });
  it('rolls back an injected failure after the real second migration, keeping only bootstrap', async () => {
    await reset();
    const migrations = await loadMigrations('migrations/target');
    const directory = await mkdtemp(path.join(tmpdir(), 'family-rpg-g02-b-'));
    directories.push(directory);
    const manifest = [];
    for (const [i, migration] of migrations.entries()) {
      const source = migration.sql + (i === 1 ? '\nSELECT 1 / 0;' : '');
      await writeFile(path.join(directory, migration.name), source);
      manifest.push({ name: migration.name, sha256: createHash('sha256').update(source).digest('hex') });
    }
    await writeFile(path.join(directory, 'manifest.json'), JSON.stringify({ schema_version: 1, migrations: manifest }));
    await expect(runTargetMigrations(raw, config, directory)).rejects.toMatchObject({ code: '22012' });
    expect((await raw`SELECT name FROM rpg.__target_migrations ORDER BY ordinal`).map(r => r.name)).toEqual(['0001_bootstrap.sql']);
    expect((await raw`SELECT to_regclass('rpg.families') AS family, to_regclass('rpg.retention_policy_revisions') AS policy`)[0]).toEqual({ family: null, policy: null });
    expect(await runTargetMigrations(raw, config, 'migrations/target')).toBe(3);
  });
});
