import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { generateDrizzleJson, generateMigration } from 'drizzle-kit/api';
import { createHash, randomBytes } from 'node:crypto';
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { readTargetConfig } from '../../src/target/config';
import { assertTargetDatabase, createTargetClient } from '../../src/target/db/client';
import { openTargetDatabase } from '../../src/target/db/database';
import { loadMigrations, runTargetMigrations } from '../../src/target/db/migrator';
import { accounts, foundationSchema, retentionPolicyRevisions } from '../../src/target/db/schema/foundation';
import { accessTables, targetSchema, externalIdentities, accessLaunches, identityExchangeReceipts } from '../../src/target/db/schema/access';
import { createIdentityExchangeService, type ExchangeResult } from '../../src/target/access/identityExchange';
import { accessRecordToDto } from '../../src/target/contracts/access';
import { ContractError } from '../../src/target/contracts/errors';
import { assertOwnedContainer } from '../../scripts/target/test-environment';
import { retentionFixture } from './foundation-fixtures';
import { exchangeConfig, startMs, syntheticInput } from './identity-exchange-fixtures';

const enabled = process.env.RPG_TARGET_PG_TESTS === '1';
function success(result: ExchangeResult): asserts result is Extract<ExchangeResult, { ok: true }> {
  expect(result.ok, result.ok ? undefined : result.error_key).toBe(true);
  if (!result.ok) throw new Error('Expected exchange success');
}
describe.skipIf(!enabled)('atomic identity exchange in owned PostgreSQL (G3C01–G3C05)', () => {
  let config: ReturnType<typeof readTargetConfig>;
  let raw: ReturnType<typeof createTargetClient>;
  let database: Awaited<ReturnType<typeof openTargetDatabase>>;
  let other: Awaited<ReturnType<typeof openTargetDatabase>>;
  let tick: number;
  let service: ReturnType<typeof createIdentityExchangeService>;
  beforeAll(async () => {
    config = readTargetConfig(process.env);
    await assertOwnedContainer({ id: process.env.RPG_TARGET_CONTAINER_ID ?? '', runId: config.runId });
    raw = createTargetClient(config); await assertTargetDatabase(raw, config);
    database = await openTargetDatabase(config); other = await openTargetDatabase(config);
  });
  async function reset() {
    await assertTargetDatabase(raw, config);
    await raw`DROP SCHEMA IF EXISTS content CASCADE`; await raw`DROP SCHEMA IF EXISTS rpg CASCADE`;
  }
  beforeEach(async () => {
    tick = startMs;
    await runTargetMigrations(raw, config, 'migrations/target');
    await database.db.insert(retentionPolicyRevisions).values(retentionFixture());
    service = createIdentityExchangeService(database.db, exchangeConfig(() => tick));
    expect(await service.activatePolicy(0)).toEqual({ ok: true, revision: 1 });
  });
  afterEach(async () => { if (raw !== undefined) await reset(); });
  afterAll(async () => { await other?.close(); await database?.close(); await raw?.end({ timeout: 5 }); });
  async function counts() {
    const [row] = await raw`SELECT (SELECT count(*)::int FROM rpg.accounts) AS accounts,
      (SELECT count(*)::int FROM rpg.external_identities) AS identities,
      (SELECT count(*)::int FROM rpg.access_launches) AS launches,
      (SELECT count(*)::int FROM rpg.identity_exchange_receipts) AS receipts`;
    return row;
  }

  it('returns a restricted launch, stores no bearer/initData and ignores fabricated identity objects', async () => {
    expect(await service.exchangeTelegramIdentity({ provider: 'telegram', subject: '1', ok: true })).toEqual({ ok: false, error_key: 'access.identity_invalid' });
    const input = syntheticInput(), result = await service.exchangeTelegramIdentity(input); success(result);
    expect(result.bearer).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(JSON.stringify(result)).not.toContain(result.bearer);
    const context = await service.resolveLaunch(result.bearer);
    expect(context).toEqual({ ok: true, context: { launch_id: result.launch.id, account_id: result.launch.account_id,
      external_identity_id: expect.any(String), provider: 'telegram', subject: '69513172', expires_at: result.launch.expires_at } });
    expect(await service.resolveLaunch(result.launch.id)).toEqual({ ok: false, error_key: 'access.launch_invalid' });
    const [identity] = await database.db.select().from(externalIdentities);
    const [launch] = await database.db.select().from(accessLaunches);
    const [receipt] = await database.db.select().from(identityExchangeReceipts);
    const serialized = JSON.stringify({ identity, launch, receipt });
    expect(serialized).not.toContain(result.bearer); expect(serialized).not.toContain(input);
    expect(serialized).not.toContain('Синтетический'); expect(launch.token_verifier).not.toBe(result.bearer);
    expect(accessRecordToDto('external_identity', identity).subject).toBe('69513172');
    expect(accessRecordToDto('access_launch', launch).expires_at).toBe(result.launch.expires_at);
    expect(accessRecordToDto('exchange_receipt', receipt).launch_id).toBe(result.launch.id);
    expect(await counts()).toEqual({ accounts: 1, identities: 1, launches: 1, receipts: 1 });
  });

  it('races equivalent initData on independent pools: exactly one launch and bearer', async () => {
    const second = createIdentityExchangeService(other.db, exchangeConfig(() => tick));
    const input = syntheticInput();
    const equivalent = input.split('&').reverse().join('&').replace(/\+/g, '%20');
    const results = await Promise.all([service.exchangeTelegramIdentity(input), second.exchangeTelegramIdentity(equivalent)]);
    expect(results.filter(r => r.ok)).toHaveLength(1);
    expect(results.find(r => !r.ok)).toEqual({ ok: false, error_key: 'access.identity_replayed' });
    expect(await counts()).toEqual({ accounts: 1, identities: 1, launches: 1, receipts: 1 });
    // A lost response or another service instance never recreates the secret.
    expect(await second.exchangeTelegramIdentity(input)).toEqual({ ok: false, error_key: 'access.identity_replayed' });
  });

  it('races distinct signed launches for one new subject without duplicate accounts', async () => {
    const second = createIdentityExchangeService(other.db, exchangeConfig(() => tick));
    const results = await Promise.all([service.exchangeTelegramIdentity(syntheticInput(tick, 'a')),
      second.exchangeTelegramIdentity(syntheticInput(tick, 'b'))]);
    results.forEach(success);
    expect(results[0].ok && results[1].ok && results[0].launch.account_id).toBe(results[1].ok && results[1].launch.account_id);
    expect(await counts()).toEqual({ accounts: 1, identities: 1, launches: 2, receipts: 2 });
  });

  it('rolls back provisional account/identity when entropy or receipt insertion fails', async () => {
    const broken = createIdentityExchangeService(database.db, exchangeConfig(() => tick), () => new Uint8Array(31));
    expect(await broken.exchangeTelegramIdentity(syntheticInput())).toEqual({ ok: false, error_key: 'access.entropy_unavailable' });
    const failingDependency = createIdentityExchangeService(database.db, exchangeConfig(() => tick),
      () => { throw new ContractError('access.' + exchangeConfig(() => tick).telegram.botToken); });
    expect(await failingDependency.exchangeTelegramIdentity(syntheticInput())).toEqual({ ok: false, error_key: 'access.exchange_unavailable' });
    expect(await counts()).toEqual({ accounts: 0, identities: 0, launches: 0, receipts: 0 });
    await raw`CREATE FUNCTION rpg.reject_receipt_fixture() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic receipt failure'; END $$`;
    await raw`CREATE TRIGGER receipt_failure_fixture BEFORE INSERT ON rpg.identity_exchange_receipts FOR EACH ROW EXECUTE FUNCTION rpg.reject_receipt_fixture()`;
    expect(await service.exchangeTelegramIdentity(syntheticInput())).toEqual({ ok: false, error_key: 'access.exchange_unavailable' });
    expect(await counts()).toEqual({ accounts: 0, identities: 0, launches: 0, receipts: 0 });
    await raw`DROP TRIGGER receipt_failure_fixture ON rpg.identity_exchange_receipts`;
    success(await service.exchangeTelegramIdentity(syntheticInput()));
  });

  it('rolls back a colliding verifier without consuming the second input', async () => {
    const bytes = randomBytes(32);
    const collision = createIdentityExchangeService(database.db, exchangeConfig(() => tick), () => bytes);
    success(await collision.exchangeTelegramIdentity(syntheticInput(tick, 'first')));
    expect(await collision.exchangeTelegramIdentity(syntheticInput(tick, 'second', 2))).toEqual({ ok: false, error_key: 'access.exchange_unavailable' });
    expect(await counts()).toEqual({ accounts: 1, identities: 1, launches: 1, receipts: 1 });
    success(await service.exchangeTelegramIdentity(syntheticInput(tick, 'second', 2)));
  });

  it.each(['disabled','erasure_pending'] as const)('blocks %s accounts for both new exchanges and existing launches', async status => {
    const result = await service.exchangeTelegramIdentity(syntheticInput()); success(result);
    await database.db.update(accounts).set({ status, disabled_at: status === 'disabled' ? new Date(tick).toISOString() : null })
      .where(eq(accounts.id, result.launch.account_id));
    expect(await service.resolveLaunch(result.bearer)).toEqual({ ok: false, error_key: 'access.launch_invalid' });
    expect(await service.exchangeTelegramIdentity(syntheticInput(tick, 'new'))).toEqual({ ok: false, error_key: 'access.identity_unavailable' });
    expect(await counts()).toEqual({ accounts: 1, identities: 1, launches: 1, receipts: 1 });
  });

  it('revoked external identity cannot be recreated and invalidates existing launch', async () => {
    const result = await service.exchangeTelegramIdentity(syntheticInput()); success(result);
    await database.db.update(externalIdentities).set({ revoked_at: new Date(tick).toISOString() });
    expect(await service.resolveLaunch(result.bearer)).toEqual({ ok: false, error_key: 'access.launch_invalid' });
    expect(await service.exchangeTelegramIdentity(syntheticInput(tick, 'new'))).toEqual({ ok: false, error_key: 'access.identity_unavailable' });
    expect(await counts()).toEqual({ accounts: 1, identities: 1, launches: 1, receipts: 1 });
  });

  it('checks exact launch expiry and persisted revocation on another pool', async () => {
    const result = await service.exchangeTelegramIdentity(syntheticInput()); success(result);
    const second = createIdentityExchangeService(other.db, exchangeConfig(() => tick));
    tick += 599999;
    expect((await second.resolveLaunch(result.bearer)).ok).toBe(true);
    tick++;
    expect(await second.resolveLaunch(result.bearer)).toEqual({ ok: false, error_key: 'access.launch_invalid' });
    const fresh = await second.exchangeTelegramIdentity(syntheticInput(tick)); success(fresh);
    await database.db.update(accessLaunches).set({ revoked_at: new Date(tick).toISOString(), updated_at: new Date(tick).toISOString(), state_revision: 2 })
      .where(eq(accessLaunches.id, fresh.launch.id));
    expect(await service.resolveLaunch(fresh.bearer)).toEqual({ ok: false, error_key: 'access.launch_invalid' });
  });

  it('does not resurrect a consumed input after receipt cleanup, clock rollback or widened policy', async () => {
    const old = syntheticInput(); success(await service.exchangeTelegramIdentity(old));
    tick += 330000;
    expect(await service.cleanupReceipts()).toEqual({ ok: true, removed: 0 });
    tick++;
    expect(await service.cleanupReceipts()).toEqual({ ok: true, removed: 1 });
    tick = startMs + 1000;
    expect(await service.exchangeTelegramIdentity(old)).toEqual({ ok: false, error_key: 'access.identity_invalid' });
    tick = startMs + 331000;
    const widened = exchangeConfig(() => tick);
    const upgraded = { ...widened, telegram: { ...widened.telegram, policy: { ...widened.telegram.policy, revision: 2, maxAgeSeconds: 3600 } } };
    const next = createIdentityExchangeService(other.db, upgraded);
    expect(await next.exchangeTelegramIdentity(old)).toEqual({ ok: false, error_key: 'access.policy_mismatch' });
    expect(await next.activatePolicy(1)).toEqual({ ok: false, error_key: 'access.policy_conflict' });
    expect(await next.activatePolicy(3)).toEqual({ ok: true, revision: 4 });
    expect(await next.exchangeTelegramIdentity(old)).toEqual({ ok: false, error_key: 'access.identity_invalid' });
    expect(await service.exchangeTelegramIdentity(syntheticInput(tick, 'fresh'))).toEqual({ ok: false, error_key: 'access.policy_mismatch' });
    success(await next.exchangeTelegramIdentity(syntheticInput(tick, 'fresh')));
    expect(await counts()).toEqual({ accounts: 1, identities: 1, launches: 2, receipts: 1 });
  });

  it('binds the database to a deployment and rejects policy changes without a new revision', async () => {
    const cfg = exchangeConfig(() => tick);
    const foreign = createIdentityExchangeService(other.db, { ...cfg, telegram: { ...cfg.telegram, environment: 'production' } });
    expect(await foreign.activatePolicy(1)).toEqual({ ok: false, error_key: 'access.deployment_mismatch' });
    expect(await foreign.exchangeTelegramIdentity(syntheticInput())).toEqual({ ok: false, error_key: 'access.policy_mismatch' });
    const changed = createIdentityExchangeService(other.db, { ...cfg, launchTtlSeconds: 900 });
    expect(await changed.activatePolicy(1)).toEqual({ ok: false, error_key: 'access.policy_conflict' });
    expect(await service.activatePolicy(1)).toEqual({ ok: true, revision: 1 });
  });

  it('rechecks freshness after waiting for a concurrent identity transaction', async () => {
    const reserved = await raw.reserve();
    try {
      await reserved`BEGIN`;
      await reserved`SELECT pg_advisory_xact_lock(hashtextextended('telegram:69513172',70303))`;
      const waiting = service.exchangeTelegramIdentity(syntheticInput());
      // Wait for evidence of an advisory-lock waiter, not an assumed scheduling delay.
      let blocked = false;
      for (let i = 0; i < 100; i++) {
        const [state] = await reserved`SELECT count(*)::int AS n FROM pg_locks WHERE locktype='advisory' AND NOT granted`;
        if (state.n > 0) { blocked = true; break; }
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      tick += 301000;
      await reserved`COMMIT`;
      expect(blocked).toBe(true);
      expect(await waiting).toEqual({ ok: false, error_key: 'access.identity_invalid' });
      expect(await counts()).toEqual({ accounts: 0, identities: 0, launches: 0, receipts: 0 });
    } finally { await reserved`ROLLBACK`; reserved.release(); }
  });

  it('serializes competing policy activations and retires the previous key', async () => {
    const cfg = exchangeConfig(() => tick);
    tick += 1000;
    const nextToken = '7000000000:' + randomBytes(24).toString('hex');
    const nextCfg = { ...cfg, telegram: { ...cfg.telegram, botToken: nextToken, policy: { ...cfg.telegram.policy, revision: 2 } } };
    const next = createIdentityExchangeService(database.db, nextCfg);
    const alternative = createIdentityExchangeService(other.db, { ...nextCfg, launchTtlSeconds: 901 });
    const outcomes = await Promise.all([next.activatePolicy(1), alternative.activatePolicy(1)]);
    expect(outcomes.filter(r => r.ok)).toHaveLength(1);
    expect(outcomes.find(r => !r.ok)).toEqual({ ok: false, error_key: 'access.policy_conflict' });
    expect(await service.exchangeTelegramIdentity(syntheticInput(tick))).toEqual({ ok: false, error_key: 'access.policy_mismatch' });
    const current = outcomes[0].ok ? next : alternative;
    expect(await current.exchangeTelegramIdentity(syntheticInput(tick))).toEqual({ ok: false, error_key: 'access.identity_invalid' });
    success(await current.exchangeTelegramIdentity(syntheticInput(tick, 'rotated', 69513172, nextToken)));
  });

  it('uses semantic policy ordering and database uniqueness even for direct writes', async () => {
    const cfg = exchangeConfig(() => tick), p = cfg.telegram.policy;
    const reordered = createIdentityExchangeService(other.db, { ...cfg, telegram: { ...cfg.telegram,
      policy: { maxFields: p.maxFields, maxBytes: p.maxBytes, futureSkewSeconds: p.futureSkewSeconds,
        maxAgeSeconds: p.maxAgeSeconds, revision: p.revision, id: p.id } } });
    success(await reordered.exchangeTelegramIdentity(syntheticInput()));
    await expect(raw`INSERT INTO rpg.external_identities
      SELECT '017f22e2-79b0-7cc3-98c4-dc0c0c07398f'::uuid,schema_version,created_at,retention_policy_id,retention_policy_revision,
        state_revision,updated_at,account_id,provider,subject,verified_at,revoked_at FROM rpg.external_identities`)
      .rejects.toMatchObject({ code: '23505', constraint_name: 'external_identities_subject_uq' });
    await expect(raw`UPDATE rpg.identity_exchange_policy SET retention_policy_revision=999`).rejects.toMatchObject({ code: '23503' });
  });

  it('matches generated DDL/catalog and rejects invalid direct SQL writes', async () => {
    const before = generateDrizzleJson(foundationSchema);
    const generated = await generateMigration(before, generateDrizzleJson(targetSchema, before.id));
    expect(await readFile('migrations/target/0003_identity_exchange.sql', 'utf8')).toBe(
      '-- G03-C: generated target access schema; reviewed before disposable execution.\n' + generated.join('\n\n') + '\n');
    const result = await service.exchangeTelegramIdentity(syntheticInput()); success(result);
    for (const table of accessTables) {
      const cfg = getTableConfig(table);
      const columns = await raw`SELECT a.attname AS name, format_type(a.atttypid,a.atttypmod) AS type, a.attnotnull AS required
        FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname='rpg' AND c.relname=${cfg.name} AND a.attnum>0 AND NOT a.attisdropped ORDER BY a.attnum`;
      expect(columns.map(c => [c.name,c.type,c.required])).toEqual(cfg.columns.map(c => [c.name,c.getSQLType().replace(' COLLATE "C"',''),c.notNull]));
      const constraints = await raw`SELECT con.conname AS name, con.contype AS type, con.confdeltype AS d, con.confupdtype AS u
        FROM pg_constraint con JOIN pg_class c ON c.oid=con.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname='rpg' AND c.relname=${cfg.name} AND con.contype <> 'n'`;
      expect(constraints.map(c => c.name).sort()).toEqual([...cfg.checks.map(c => c.name), ...cfg.uniqueConstraints.map(c => c.getName()),
        ...cfg.foreignKeys.map(c => c.getName()), `${cfg.name}_pkey`].sort());
      expect(constraints.filter(c => c.type === 'f').every(c => c.d === 'a' && c.u === 'a')).toBe(true);
    }
    await expect(raw`UPDATE rpg.external_identities SET subject='01'`).rejects.toThrow();
    await expect(raw`UPDATE rpg.external_identities SET provider='other'`).rejects.toThrow();
    await expect(raw`UPDATE rpg.access_launches SET expires_at=created_at`).rejects.toThrow();
    await expect(raw`UPDATE rpg.access_launches SET account_id='017f22e2-79b0-7cc3-98c4-dc0c0c07398f'`).rejects.toMatchObject({ code: '23503' });
    await expect(raw`UPDATE rpg.identity_exchange_receipts SET cleanup_after=authenticated_at`).rejects.toThrow();
    await expect(raw`DELETE FROM rpg.accounts`).rejects.toMatchObject({ code: '23503' });
    await expect(raw`DELETE FROM rpg.access_launches`).rejects.toMatchObject({ code: '23503' });
    await expect(raw`DELETE FROM rpg.retention_policy_revisions`).rejects.toMatchObject({ code: '23503' });
  });

  it('rolls back a failing third migration and can apply the reviewed migration afterward', async () => {
    await reset();
    const directory = await mkdtemp(path.join(tmpdir(), 'family-rpg-g03-c-'));
    try {
      const manifest = [];
      for (const [i, migration] of (await loadMigrations('migrations/target')).entries()) {
        const source = migration.sql + (i === 2 ? '\nSELECT 1/0;' : '');
        await writeFile(path.join(directory, migration.name), source);
        manifest.push({ name: migration.name, sha256: createHash('sha256').update(source).digest('hex') });
      }
      await writeFile(path.join(directory, 'manifest.json'), JSON.stringify({ schema_version: 1, migrations: manifest }));
      await expect(runTargetMigrations(raw, config, directory)).rejects.toMatchObject({ code: '22012' });
      expect((await raw`SELECT count(*)::int AS n FROM rpg.__target_migrations`)[0].n).toBe(2);
      expect((await raw`SELECT to_regclass('rpg.external_identities') AS t`)[0].t).toBeNull();
      expect(await runTargetMigrations(raw, config, 'migrations/target')).toBe(2);
    } finally { await rm(directory, { recursive: true }); }
  });
});
