import { createHash, randomBytes } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parseV3DatabaseConfig, readV3FoundationTestConfig } from '../../src/v3-server/db/config';
import { assertV3Database, connectV3Database, type V3Database } from '../../src/v3-server/db/client';
import { loadV3Migrations, migrateV3Database, type V3Migration } from '../../src/v3-server/db/migrate';
import { cleanupV3OwnedContainer, validateV3ContainerOwnership, v3FoundationChildEnvironment } from '../../scripts/v3/verify-foundation';

const configFixture = () => ({ mode: 'synthetic', host: '127.0.0.1', port: 12345,
  database: `family_v3_31_${'a'.repeat(32)}`, user: 'family_v3_31', password: 'b'.repeat(64),
  runId: 'a'.repeat(32), clusterName: `family-v3-31-${'a'.repeat(32)}` });
const migration = (version: number, sql: string): V3Migration => ({ version,
  name: `${String(version).padStart(4, '0')}_synthetic`, sql, sha256: createHash('sha256').update(sql).digest('hex') });

describe('V3 explicit destination and exact cleanup', () => {
  it('requires the explicit isolated JSON config and never falls back to legacy environment', () => {
    expect(() => readV3FoundationTestConfig({ SQL_HOST: 'localhost', SQL_DB_NAME: 'family_bot' })).toThrow('v3.foundation_test_config_required');
    expect(() => readV3FoundationTestConfig({ V3_FOUNDATION_TEST_CONFIG: '{broken' })).toThrow('v3.foundation_test_config_invalid');
    expect(parseV3DatabaseConfig(configFixture()).database).toBe(configFixture().database);
    for (const override of [{ host: 'localhost' }, { host: '192.0.2.1' }, { database: 'postgres' }, { user: 'postgres' },
      { clusterName: 'legacy' }, { runId: '' }, { port: '5432' }, { port: 0 }, { port: 65536 }, { password: '' },
      { mode: 'production' }, { ssl: false }]) expect(() => parseV3DatabaseConfig({ ...configFixture(), ...override })).toThrow();
  });

  it('drops ambient credentials and Node preload hooks before spawning any child', () => {
    const result = v3FoundationChildEnvironment({ PATH: '/bin', HOME: '/synthetic', TMPDIR: '/tmp', DOCKER_CONTEXT: 'desktop-linux',
      SQL_PASSWORD: 'synthetic-canary', DATABASE_URL: 'synthetic-canary', PGPASSWORD: 'synthetic-canary',
      NODE_OPTIONS: '--import synthetic-canary', DOTENV_CONFIG_PATH: '.env', BOT_TOKEN: 'synthetic-canary' });
    expect(result).toEqual({ PATH: '/bin', HOME: '/synthetic', TMPDIR: '/tmp', DOCKER_CONTEXT: 'desktop-linux' });
  });

  it('rejects migration checksum drift before opening a transaction', async () => {
    const fakeDb = { sql: { begin: () => { throw new Error('unexpected_database_access'); } } } as unknown as V3Database;
    const entry = migration(1, 'SELECT 1');
    await expect(migrateV3Database(fakeDb, [{ ...entry, sql: 'SELECT 2' }])).rejects.toThrow('v3.migration_checksum_or_manifest_invalid');
    await expect(migrateV3Database(fakeDb, [migration(2, 'SELECT 1')])).rejects.toThrow('v3.migration_checksum_or_manifest_invalid');
  });

  it('cleanup rejects a neighboring container and targets only the verified owned ID', async () => {
    const owned = { id: 'c'.repeat(64), runId: 'd'.repeat(32) };
    const neighbor = 'e'.repeat(64);
    const labels = { 'org.family-v3.owner': 'family-v3-31', 'org.family-v3.run': owned.runId };
    expect(() => validateV3ContainerOwnership(owned, { Id: neighbor, Config: { Labels: labels } })).toThrow('v3.cleanup_owner_mismatch');
    const calls: string[][] = [];
    await expect(cleanupV3OwnedContainer(owned, async args => {
      calls.push(args); return `${JSON.stringify(owned.id)} ${JSON.stringify({ ...labels, 'org.family-v3.run': 'wrong' })}`;
    })).rejects.toThrow('v3.cleanup_owner_mismatch');
    expect(calls.map(args => args[0])).toEqual(['inspect']);
    const containers = new Set([owned.id, neighbor]);
    calls.length = 0;
    await cleanupV3OwnedContainer(owned, async args => {
      calls.push(args);
      if (args[0] === 'inspect') return `${JSON.stringify(owned.id)} ${JSON.stringify(labels)}`;
      if (args[0] === 'rm') { expect(args).toEqual(['rm', '--force', '--volumes', owned.id]); containers.delete(owned.id); }
      if (args[0] === 'ps') expect(args.at(-1)).toBe(`id=${owned.id}`);
      return '';
    });
    expect([...containers]).toEqual([neighbor]);
  });
});

function uuid7(): string {
  const time = Date.now().toString(16).padStart(12, '0');
  const tail = randomBytes(10).toString('hex');
  return `${time.slice(0, 8)}-${time.slice(8)}-7${tail.slice(0, 3)}-8${tail.slice(3, 6)}-${tail.slice(6, 18)}`;
}
interface Fixture { family: string; account: string; member: string; player: string; binding: string; session: string }
const pg = process.env.V3_FOUNDATION_TEST_CONFIG ? describe : describe.skip;

pg('V3 PostgreSQL foundation constraints', () => {
  let db: V3Database;
  const fixtures: Fixture[] = [];
  let adult: Fixture;
  let child: Fixture;

  async function seed(role: 'adult' | 'child' = 'adult', withPlayer = true): Promise<Fixture> {
    const f = { family: uuid7(), account: uuid7(), member: uuid7(), player: uuid7(), binding: uuid7(), session: uuid7() };
    await db.sql.begin(async tx => {
      await tx`INSERT INTO rpg_v3.accounts (id, status) VALUES (${f.account}, 'active')`;
      await tx`INSERT INTO rpg_v3.families (id, status) VALUES (${f.family}, 'active')`;
      await tx`INSERT INTO rpg_v3.member_profiles (id, family_id, family_role, display_name, status)
        VALUES (${f.member}, ${f.family}, ${role}, 'Synthetic member', 'active')`;
      if (withPlayer) await tx`INSERT INTO rpg_v3.players (id, family_id, member_id, status) VALUES (${f.player}, ${f.family}, ${f.member}, 'active')`;
      await tx`INSERT INTO rpg_v3.access_bindings (id, account_id, family_id, member_id, player_id, mode, status)
        VALUES (${f.binding}, ${f.account}, ${f.family}, ${f.member}, ${withPlayer ? f.player : null}, ${role === 'adult' ? 'adult' : 'own_child'}, 'active')`;
      await tx`INSERT INTO rpg_v3.sessions (id, family_id, binding_id, status, expires_at)
        VALUES (${f.session}, ${f.family}, ${f.binding}, 'active', now() + interval '1 hour')`;
    });
    fixtures.push(f); return f;
  }

  async function remove(f: Fixture) {
    await db.sql.begin(async tx => {
      await tx`DELETE FROM rpg_v3.sessions WHERE family_id = ${f.family}`;
      await tx`DELETE FROM rpg_v3.access_bindings WHERE family_id = ${f.family}`;
      await tx`DELETE FROM rpg_v3.capability_grants WHERE family_id = ${f.family}`;
      await tx`DELETE FROM rpg_v3.players WHERE family_id = ${f.family}`;
      await tx`DELETE FROM rpg_v3.member_profiles WHERE family_id = ${f.family}`;
      await tx`DELETE FROM rpg_v3.families WHERE id = ${f.family}`;
      await tx`DELETE FROM rpg_v3.accounts WHERE id = ${f.account}`;
    });
  }

  beforeAll(async () => {
    db = await connectV3Database(readV3FoundationTestConfig(process.env));
    await migrateV3Database(db);
    adult = await seed('adult'); child = await seed('child');
  });
  afterAll(async () => {
    try { if (db) for (const f of fixtures) await remove(f); }
    finally { await db?.close(); }
  });

  it('stores adult and child Players and permits an adult binding without a Player', async () => {
    const rows = await db.sql`SELECT m.family_role FROM rpg_v3.players p
      JOIN rpg_v3.member_profiles m ON m.id = p.member_id AND m.family_id = p.family_id
      WHERE p.id IN (${adult.player}, ${child.player}) ORDER BY m.family_role`;
    expect(rows.map(row => row.family_role)).toEqual(['adult', 'child']);
    const admin = await seed('adult', false);
    const [binding] = await db.sql`SELECT player_id FROM rpg_v3.access_bindings WHERE id = ${admin.binding}`;
    expect(binding.player_id).toBeNull();
  });

  it('rejects cross-family players, grants, nullable-player bindings, player bindings and sessions', async () => {
    await expect(db.sql`INSERT INTO rpg_v3.players (id,family_id,member_id,status)
      VALUES (${uuid7()},${adult.family},${child.member},'active')`).rejects.toMatchObject({ code: '23503' });
    await expect(db.sql`INSERT INTO rpg_v3.capability_grants (id,family_id,member_id,capability,scope,status)
      VALUES (${uuid7()},${adult.family},${child.member},'family.read','family','active')`).rejects.toMatchObject({ code: '23503' });
    await expect(db.sql`INSERT INTO rpg_v3.access_bindings (id,account_id,family_id,member_id,player_id,mode,status)
      VALUES (${uuid7()},${adult.account},${adult.family},${child.member},NULL,'adult','active')`).rejects.toMatchObject({ code: '23503' });
    await expect(db.sql`INSERT INTO rpg_v3.access_bindings (id,account_id,family_id,member_id,player_id,mode,status)
      VALUES (${uuid7()},${adult.account},${adult.family},${adult.member},${child.player},'managed_child','active')`).rejects.toMatchObject({ code: '23503' });
    await expect(db.sql`INSERT INTO rpg_v3.sessions (id,family_id,binding_id,status,expires_at)
      VALUES (${uuid7()},${adult.family},${child.binding},'active',now())`).rejects.toMatchObject({ code: '23503' });
  });

  it('allows exactly one Player when two independent transactions create it concurrently', async () => {
    const f = await seed('child', false);
    const second = await connectV3Database(db.config);
    let announceWinner!: (pid: number) => void, announceLoser!: (pid: number) => void, releaseWinner!: () => void;
    const winnerReady = new Promise<number>(resolve => { announceWinner = resolve; });
    const loserReady = new Promise<number>(resolve => { announceLoser = resolve; });
    const release = new Promise<void>(resolve => { releaseWinner = resolve; });
    try {
      const winner = db.sql.begin(async tx => {
        const [identity] = await tx`SELECT pg_backend_pid() AS pid`;
        await tx`INSERT INTO rpg_v3.players (id,family_id,member_id,status) VALUES (${uuid7()},${f.family},${f.member},'active')`;
        announceWinner(Number(identity.pid));
        await release;
        return identity.pid;
      });
      const winnerPid = await winnerReady;
      const loser = second.sql.begin(async tx => {
        const [identity] = await tx`SELECT pg_backend_pid() AS pid`;
        announceLoser(Number(identity.pid));
        await tx`INSERT INTO rpg_v3.players (id,family_id,member_id,status) VALUES (${uuid7()},${f.family},${f.member},'active')`;
      }).then(() => null, error => error);
      const loserPid = await loserReady;
      try {
        expect(loserPid).not.toBe(winnerPid);
        let blocked = false;
        const deadline = Date.now() + 5000;
        while (Date.now() < deadline) {
          const [state] = await db.sql`SELECT ${winnerPid}=ANY(pg_blocking_pids(${loserPid})) AS blocked`;
          if (state.blocked) { blocked = true; break; }
          await delay(10);
        }
        expect(blocked).toBe(true);
      } finally { releaseWinner(); }
      await winner;
      expect(await loser).toMatchObject({ code: '23505' });
      const [count] = await db.sql`SELECT count(*)::int AS count FROM rpg_v3.players WHERE family_id=${f.family} AND member_id=${f.member}`;
      expect(count.count).toBe(1);
    } finally { releaseWinner(); await second.close(); }
  });

  it('enforces UUIDv7, safe positive revisions, closed modes and capability scopes in SQL', async () => {
    await expect(db.sql`INSERT INTO rpg_v3.accounts (id,status) VALUES ('00000000-0000-4000-8000-000000000001','active')`).rejects.toMatchObject({ code: '23514' });
    for (const revision of ['0', '-1', '9007199254740992']) {
      await expect(db.sql`UPDATE rpg_v3.accounts SET revision=${revision} WHERE id=${adult.account}`).rejects.toMatchObject({ code: '23514' });
    }
    await expect(db.sql`UPDATE rpg_v3.member_profiles SET capability_revision=0 WHERE id=${adult.member}`).rejects.toMatchObject({ code: '23514' });
    await expect(db.sql`UPDATE rpg_v3.access_bindings SET mode='unregistered_mode' WHERE id=${adult.binding}`).rejects.toMatchObject({ code: '23514' });
    for (const [capability, scope] of [['unregistered.capability', 'self'], ['completion.review_child', 'self'], ['family.manage', 'children_of_family']]) {
      await expect(db.sql`INSERT INTO rpg_v3.capability_grants (id,family_id,member_id,capability,scope,status)
        VALUES (${uuid7()},${adult.family},${adult.member},${capability},${scope},'active')`).rejects.toMatchObject({ code: '23514' });
    }
    const grant = uuid7();
    await db.sql`INSERT INTO rpg_v3.capability_grants (id,family_id,member_id,capability,scope,status)
      VALUES (${grant},${adult.family},${adult.member},'completion.review_child','children_of_family','active')`;
    await expect(db.sql`INSERT INTO rpg_v3.capability_grants (id,family_id,member_id,capability,scope,status)
      VALUES (${uuid7()},${adult.family},${adult.member},'completion.review_child','children_of_family','active')`).rejects.toMatchObject({ code: '23505' });
  });

  it('replays the migration and rejects changed applied content while preserving history', async () => {
    const source = await loadV3Migrations();
    expect(await migrateV3Database(db)).toEqual({ applied: [], version: source.length });
    const changed = { ...source[0], sql: `${source[0].sql}\n-- changed` };
    changed.sha256 = createHash('sha256').update(changed.sql).digest('hex');
    await expect(migrateV3Database(db, [changed, ...source.slice(1)])).rejects.toThrow('v3.migration_history_mismatch');
    const [row] = await db.sql`SELECT version, sha256 FROM rpg_v3.schema_migrations WHERE version=1`;
    expect({ version: row.version, sha256: row.sha256 }).toEqual({ version: 1, sha256: source[0].sha256 });
  });

  it('rolls back all pending DDL and manifest records when a later migration fails', async () => {
    const source = await loadV3Migrations();
    const marker = `failure_${randomBytes(8).toString('hex')}`;
    await expect(migrateV3Database(db, [...source, migration(source.length + 1, `CREATE TABLE rpg_v3.${marker} (id integer);`),
      migration(source.length + 2, 'SELECT 1 / 0;')])).rejects.toMatchObject({ code: '22012' });
    const [row] = await db.sql`SELECT to_regclass(${`rpg_v3.${marker}`})::text AS marker,
      (SELECT max(version) FROM rpg_v3.schema_migrations) AS version,
      (SELECT count(*)::int FROM rpg_v3.schema_migrations) AS count`;
    expect(row).toMatchObject({ marker: null, version: source.length, count: source.length });
  });

  it('checks database/user/cluster identity at the live connection boundary', async () => {
    const identity = await assertV3Database(db.sql, db.config);
    expect(identity.serverVersion).toBe(180006);
    const otherRun = 'f'.repeat(32);
    await expect(assertV3Database(db.sql, parseV3DatabaseConfig({ ...db.config, runId: otherRun,
      database: `family_v3_31_${otherRun}`, clusterName: `family-v3-31-${otherRun}` }))).rejects.toThrow('v3.database_identity_mismatch');
  });

  it('removes only its fixture family and keeps the neighboring family unchanged', async () => {
    const target = await seed(); const sentinel = await seed();
    const before = await db.sql`SELECT * FROM rpg_v3.member_profiles WHERE family_id=${sentinel.family}`;
    await remove(target);
    const after = await db.sql`SELECT * FROM rpg_v3.member_profiles WHERE family_id=${sentinel.family}`;
    expect([...after]).toEqual([...before]);
    const [gone] = await db.sql`SELECT count(*)::int AS count FROM rpg_v3.families WHERE id=${target.family}`;
    expect(gone.count).toBe(0);
  });
});
