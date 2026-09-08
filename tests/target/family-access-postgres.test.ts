import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { generateDrizzleJson, generateMigration } from 'drizzle-kit/api';
import { createHash } from 'node:crypto';
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { readTargetConfig } from '../../src/target/config';
import { assertTargetDatabase, createTargetClient } from '../../src/target/db/client';
import { openTargetDatabase } from '../../src/target/db/database';
import { loadMigrations, runTargetMigrations } from '../../src/target/db/migrator';
import { families, memberProfiles, players, retentionPolicyRevisions } from '../../src/target/db/schema/foundation';
import { accessLaunches, targetSchema as identitySchema } from '../../src/target/db/schema/access';
import { accessBindings, sessionContexts, sessionTokenVerifiers, familyAccessTables, targetSchema } from '../../src/target/db/schema/familyAccess';
import { createIdentityExchangeService } from '../../src/target/access/identityExchange';
import { createFamilySessionService, type FamilyProtectionHooks } from '../../src/target/access/familySession';
import { newEntityId } from '../../src/target/contracts/ids';
import { ContractError } from '../../src/target/contracts/errors';
import { assertOwnedContainer } from '../../scripts/target/test-environment';
import { familyFixture, profileFixture, playerFixture, retentionFixture } from './foundation-fixtures';
import { exchangeConfig, startMs, syntheticInput } from './identity-exchange-fixtures';
import { at, familyConfig, bindingFixture, contextFixture, verifierFixture } from './family-access-fixtures';

function success<T extends { ok: boolean }>(result: T): asserts result is Extract<T, { ok: true }> {
  expect(result.ok, 'error_key' in result ? String(result.error_key) : undefined).toBe(true);
  if (!result.ok) throw new Error('Expected synthetic operation success');
}
describe.skipIf(process.env.RPG_TARGET_PG_TESTS !== '1')('family access in owned PostgreSQL (G03-D)', () => {
  let config: ReturnType<typeof readTargetConfig>;
  let raw: ReturnType<typeof createTargetClient>;
  let database: Awaited<ReturnType<typeof openTargetDatabase>>;
  let other: Awaited<ReturnType<typeof openTargetDatabase>>;
  let exchange: ReturnType<typeof createIdentityExchangeService>;
  let service: ReturnType<typeof createFamilySessionService>;
  let tick: number, subject: number, protectionRevision: number, sensitiveAllowed: boolean;
  const hooks: FamilyProtectionHooks = {
    verifyRevision: async (_tx, proof) => proof.revision === protectionRevision,
    confirmSensitiveAction: async () => sensitiveAllowed,
  };
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
    tick = startMs; subject = 100; protectionRevision = 1; sensitiveAllowed = true;
    await runTargetMigrations(raw, config, 'migrations/target');
    await database.db.insert(retentionPolicyRevisions).values(retentionFixture());
    exchange = createIdentityExchangeService(database.db, exchangeConfig(() => tick));
    expect(await exchange.activatePolicy(0)).toEqual({ ok: true, revision: 1 });
    service = createFamilySessionService(database.db, exchange, familyConfig(() => tick));
  });
  afterEach(async () => { if (raw !== undefined) await reset(); });
  afterAll(async () => { await other?.close(); await database?.close(); await raw?.end({ timeout: 5 }); });
  const trusted = () => createFamilySessionService(database.db, exchange, familyConfig(() => tick), hooks);
  async function identity() {
    const result = await exchange.exchangeTelegramIdentity(syntheticInput(tick, String(++subject), subject)); success(result);
    const [launch] = await database.db.select().from(accessLaunches).where(eq(accessLaunches.id, result.launch.id));
    return { ...result, bearer: result.bearer, identityId: launch.external_identity_id };
  }
  async function family() {
    const row = { ...familyFixture(), created_at: at(), updated_at: at() };
    await database.db.insert(families).values(row); return row;
  }
  async function profile(familyId: string, role: 'parent' | 'child' = 'child', hasPlayer = true) {
    const row = { ...profileFixture(familyId, role), created_at: at(), updated_at: at() };
    await database.db.insert(memberProfiles).values(row);
    if (role === 'child' && hasPlayer) await database.db.insert(players).values({ ...playerFixture(familyId, row.id), created_at: at() });
    return row;
  }
  async function child(familyId?: string, hasPlayer = true) {
    const familyIdValue = familyId ?? (await family()).id, launch = await identity();
    const p = await profile(familyIdValue, 'child', hasPlayer);
    const binding = bindingFixture(familyIdValue, launch.launch.account_id, p.id);
    await database.db.insert(accessBindings).values(binding);
    return { familyId: familyIdValue, profile: p, launch, binding };
  }
  const issue = (c: Awaited<ReturnType<typeof child>>, issuer = service) => issuer.issueOwnChild(c.launch.bearer, { family_id: c.familyId, binding_id: c.binding.id });
  async function adult(familyId: string) {
    const source = await identity(), p = await profile(familyId, 'parent');
    const binding = bindingFixture(familyId, source.launch.account_id, p.id, 'adult_membership');
    await database.db.insert(accessBindings).values(binding);
    const context = contextFixture(binding, source.identityId), token = verifierFixture(context);
    await database.db.insert(sessionContexts).values(context); await database.db.insert(sessionTokenVerifiers).values(token.record);
    return { source, binding, context, token, profile: p };
  }
  async function managed(parent: Awaited<ReturnType<typeof adult>>, profileId?: string) {
    const p = profileId ?? (await profile(parent.binding.family_id)).id;
    const binding = bindingFixture(parent.binding.family_id, parent.binding.account_id, p, 'managed_child', parent.binding.id);
    await database.db.insert(accessBindings).values(binding);
    const context = contextFixture(binding, parent.source.identityId, parent.context), token = verifierFixture(context);
    await database.db.insert(sessionContexts).values(context); await database.db.insert(sessionTokenVerifiers).values(token.record);
    return { binding, context, token };
  }
  async function counts() {
    return (await raw`SELECT (SELECT count(*)::int FROM rpg.session_contexts) AS sessions,
      (SELECT count(*)::int FROM rpg.session_token_verifiers) AS verifiers,
      (SELECT count(*)::int FROM rpg.players) AS players, (SELECT count(*)::int FROM rpg.member_profiles) AS profiles`)[0];
  }

  it('issues only an existing own-child binding, consumes launch and preserves player/profile data', async () => {
    const c = await child(), before = await counts(), result = await issue(c); success(result);
    expect(result.bearer).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(JSON.stringify(result)).not.toContain(result.bearer);
    const rows = await database.db.select().from(sessionTokenVerifiers);
    expect(JSON.stringify(rows)).not.toContain(result.bearer);
    expect(await counts()).toEqual({ ...before, sessions: 1, verifiers: 1 });
    expect(await exchange.resolveLaunch(c.launch.bearer)).toEqual({ ok: false, error_key: 'access.launch_invalid' });
    expect((await issue(c)).ok).toBe(false);
    const resolved = await service.resolveSession(result.bearer); success(resolved);
    expect(resolved.actor).toMatchObject({ family_id: c.familyId, profile_id: c.profile.id, mode: 'own_child', player_id: expect.any(String) });
    expect((await service.resolveSession(c.launch.bearer)).ok).toBe(false);
    expect((await service.resolveSession(result.session.id)).ok).toBe(false);
    tick += 601000; success(await service.resolveSession(result.bearer));
    tick = startMs + 28800000; expect((await service.resolveSession(result.bearer)).ok).toBe(false);
  });
  it('denies unbound launch, account/family substitution, absent player and client actor/mode without consuming launch', async () => {
    const c = await child(), stranger = await identity(), f = await family();
    for (const req of [
      { family_id: c.familyId, binding_id: newEntityId() }, { family_id: f.id, binding_id: c.binding.id },
      { family_id: c.familyId, binding_id: c.binding.id, actorId: c.binding.account_id },
      { family_id: c.familyId, binding_id: c.binding.id, mode: 'adult' },
    ]) expect((await service.issueOwnChild(c.launch.bearer, req)).ok).toBe(false);
    expect((await service.issueOwnChild(stranger.bearer, { family_id: c.familyId, binding_id: c.binding.id })).ok).toBe(false);
    const missing = await child(c.familyId, false); expect((await issue(missing)).ok).toBe(false);
    const parent = await adult(c.familyId);
    expect((await service.issueOwnChild(parent.source.bearer, { family_id: c.familyId, binding_id: parent.binding.id })).ok).toBe(false);
    success(await exchange.resolveLaunch(c.launch.bearer)); success(await issue(c));
  });
  it('serializes the same launch on independent pools: one session and verifier', async () => {
    const c = await child();
    const otherExchange = createIdentityExchangeService(other.db, exchangeConfig(() => tick));
    const second = createFamilySessionService(other.db, otherExchange, familyConfig(() => tick));
    const results = await Promise.all([issue(c), issue(c, second)]);
    expect(results.filter(r => r.ok)).toHaveLength(1);
    expect(await counts()).toEqual({ sessions: 1, verifiers: 1, players: 1, profiles: 1 });
  });
  it('rolls back failed token insertion and entropy without losing launch; redacts dependency errors', async () => {
    const c = await child();
    const broken = createFamilySessionService(database.db, exchange, familyConfig(() => tick), hooks, () => new Uint8Array(31));
    expect(await issue(c, broken)).toEqual({ ok: false, error_key: 'family.entropy_unavailable' });
    const secret = 'synthetic-private-detail';
    const throws = createFamilySessionService(database.db, exchange, familyConfig(() => tick), hooks, () => { throw new ContractError(secret); });
    expect(await issue(c, throws)).toEqual({ ok: false, error_key: 'family.access_unavailable' });
    await raw`CREATE FUNCTION rpg.reject_token_fixture() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic failure'; END $$`;
    await raw`CREATE TRIGGER token_failure_fixture BEFORE INSERT ON rpg.session_token_verifiers FOR EACH ROW EXECUTE FUNCTION rpg.reject_token_fixture()`;
    expect((await issue(c)).ok).toBe(false); expect((await counts()).sessions).toBe(0);
    success(await exchange.resolveLaunch(c.launch.bearer));
    await raw`DROP TRIGGER token_failure_fixture ON rpg.session_token_verifiers`;
    success(await issue(c));
  });
  it('consumes one launch globally when two authorized family bindings race', async () => {
    const c = await child(), f = await family(), p = await profile(f.id);
    const binding = bindingFixture(f.id, c.binding.account_id, p.id);
    await database.db.insert(accessBindings).values(binding);
    const second = createFamilySessionService(other.db, createIdentityExchangeService(other.db, exchangeConfig(() => tick)), familyConfig(() => tick));
    const results = await Promise.all([issue(c), second.issueOwnChild(c.launch.bearer, { family_id: f.id, binding_id: binding.id })]);
    expect(results.filter(r => r.ok)).toHaveLength(1);
    expect((await counts()).sessions).toBe(1);
  });
  it('rechecks launch expiry at issuance and refuses a changed family policy', async () => {
    const c = await child();
    const later = createFamilySessionService(database.db, exchange, familyConfig(() => tick + 600000));
    expect(await issue(c, later)).toEqual({ ok: false, error_key: 'access.launch_invalid' });
    const result = await issue(c); success(result);
    const changed = createFamilySessionService(database.db, exchange, { ...familyConfig(() => tick), ownChildTtlSeconds: 30000 });
    expect((await changed.resolveSession(result.bearer)).ok).toBe(false);
  });
  it('guards family, profile, role and closed request before invoking trusted work', async () => {
    const c = await child(), otherChild = await child(c.familyId), foreign = await child(), result = await issue(c); success(result);
    let calls = 0;
    const work = async () => ++calls;
    success(await service.withFamilyAccess(result.bearer, { action: 'home.read', family_id: c.familyId, profile_id: null }, work));
    success(await service.withFamilyAccess(result.bearer, { action: 'child.play', family_id: c.familyId, profile_id: c.profile.id }, work));
    for (const request of [
      { action: 'child.play', family_id: c.familyId, profile_id: otherChild.profile.id },
      { action: 'profile.read', family_id: c.familyId, profile_id: otherChild.profile.id },
      { action: 'home.read', family_id: foreign.familyId, profile_id: null },
      { action: 'family.manage', family_id: c.familyId, profile_id: null },
      { action: 'home.read', family_id: c.familyId, profile_id: null, actorId: newEntityId() },
    ]) expect((await service.withFamilyAccess(result.bearer, request, work)).ok).toBe(false);
    expect(calls).toBe(2);
  });
  it.each(['account', 'identity', 'profile', 'family', 'binding', 'revision'])('refuses invalid live %s state', async kind => {
    const c = await child(), result = await issue(c); success(result);
    if (kind === 'account') await raw`UPDATE rpg.accounts SET status='disabled', disabled_at=created_at WHERE id=${c.binding.account_id}`;
    if (kind === 'identity') await raw`UPDATE rpg.external_identities SET revoked_at=created_at WHERE id=${c.launch.identityId}`;
    if (kind === 'profile') await raw`UPDATE rpg.member_profiles SET status='archived', archived_at=created_at WHERE id=${c.profile.id}`;
    if (kind === 'family') await raw`UPDATE rpg.families SET status='archived', archived_at=created_at WHERE id=${c.familyId}`;
    if (kind === 'binding') await raw`UPDATE rpg.access_bindings SET status='revoked', revoked_at=created_at WHERE id=${c.binding.id}`;
    if (kind === 'revision') await raw`UPDATE rpg.access_bindings SET state_revision=2 WHERE id=${c.binding.id}`;
    expect((await service.resolveSession(result.bearer)).ok).toBe(false);
  });
  it('denies adult and managed fixtures by default; test protection grants only adult management', async () => {
    const f = await family(), a = await adult(f.id), m = await managed(a);
    expect((await service.resolveSession(a.token.bearer)).ok).toBe(false);
    expect((await service.resolveSession(m.token.bearer)).ok).toBe(false);
    const enabled = trusted(); success(await enabled.resolveSession(m.token.bearer));
    success(await enabled.withFamilyAccess(a.token.bearer, { action: 'family.manage', family_id: f.id, profile_id: null }, async () => 'fixture'));
    expect((await enabled.withFamilyAccess(a.token.bearer, { action: 'child.play', family_id: f.id, profile_id: m.binding.profile_id }, async () => 'forbidden')).ok).toBe(false);
    sensitiveAllowed = false;
    expect((await enabled.revokeSession(a.token.bearer, { session_id: m.context.id, expected_revision: 1 })).ok).toBe(false);
  });
  it('retiring parent bearer preserves lineage and managed access after the short adult grant expires', async () => {
    const f = await family(), a = await adult(f.id), m = await managed(a), enabled = trusted();
    expect((await enabled.retireOwnBearer(a.token.bearer, 2)).ok).toBe(false);
    success(await enabled.retireOwnBearer(a.token.bearer, 1));
    expect((await enabled.resolveSession(a.token.bearer)).ok).toBe(false);
    tick += 1800001; success(await enabled.resolveSession(m.token.bearer));
    expect((await raw`SELECT revoked_at FROM rpg.session_contexts WHERE id=${a.context.id}`)[0].revoked_at).toBeNull();
    protectionRevision = 2; expect((await enabled.resolveSession(m.token.bearer)).ok).toBe(false);
  });
  it('expires adult idle grant without expiring a managed child; parent source revocation then denies child', async () => {
    const f = await family(), a = await adult(f.id), m = await managed(a), enabled = trusted();
    tick += 300000;
    expect((await enabled.resolveSession(a.token.bearer)).ok).toBe(false);
    success(await enabled.resolveSession(m.token.bearer));
    await raw`UPDATE rpg.access_bindings SET status='revoked', revoked_at=created_at WHERE id=${a.binding.id}`;
    expect((await enabled.resolveSession(m.token.bearer)).ok).toBe(false);
  });
  it('caps managed lineage to parent lifetime and denies malformed temporal lineage', async () => {
    const f = await family(), a = await adult(f.id), m = await managed(a), enabled = trusted();
    await raw`UPDATE rpg.session_contexts SET expires_at=expires_at + interval '1 second' WHERE id=${m.context.id}`;
    expect((await enabled.resolveSession(m.token.bearer)).ok).toBe(false);
    await raw`UPDATE rpg.session_contexts SET expires_at=${m.context.expires_at} WHERE id=${m.context.id}`;
    success(await enabled.resolveSession(m.token.bearer));
    tick = startMs + 28800000; expect((await enabled.resolveSession(m.token.bearer)).ok).toBe(false);
  });
  it('revokes parent and descendant sessions/tokens with CAS, preserving independent own-child access', async () => {
    const c = await child(), own = await issue(c); success(own);
    const a = await adult(c.familyId), m = await managed(a, c.profile.id), operator = await adult(c.familyId), enabled = trusted();
    expect(await enabled.revokeSession(operator.token.bearer, { session_id: a.context.id, expected_revision: 2 })).toEqual({ ok: false, error_key: 'family.context_changed' });
    success(await enabled.revokeSession(operator.token.bearer, { session_id: a.context.id, expected_revision: 1 }));
    expect((await enabled.resolveSession(a.token.bearer)).ok).toBe(false);
    expect((await enabled.resolveSession(m.token.bearer)).ok).toBe(false);
    success(await service.resolveSession(own.bearer));
    const retired = await raw`SELECT count(*)::int AS n FROM rpg.session_token_verifiers WHERE retired_at IS NOT NULL`;
    expect(retired[0].n).toBe(2);
  });
  it('revokes child binding and sessions, rejects foreign targets and reserves adult membership lifecycle', async () => {
    const c = await child(), own = await issue(c); success(own);
    const a = await adult(c.familyId), m = await managed(a, c.profile.id), foreign = await child(), foreignSession = await issue(foreign); success(foreignSession);
    const enabled = trusted();
    expect((await enabled.revokeSession(a.token.bearer, { session_id: foreignSession.session.id, expected_revision: 1 })).ok).toBe(false);
    expect((await enabled.revokeBinding(a.token.bearer, { binding_id: foreign.binding.id, expected_revision: 1 })).ok).toBe(false);
    expect(await enabled.revokeBinding(a.token.bearer, { binding_id: a.binding.id, expected_revision: 1 })).toEqual({ ok: false, error_key: 'family.adult_lifecycle_required' });
    expect((await service.revokeBinding(own.bearer, { binding_id: c.binding.id, expected_revision: 1 })).ok).toBe(false);
    expect((await enabled.revokeBinding(a.token.bearer, { binding_id: c.binding.id, expected_revision: 2 })).ok).toBe(false);
    success(await enabled.revokeBinding(a.token.bearer, { binding_id: c.binding.id, expected_revision: 1 }));
    expect((await service.resolveSession(own.bearer)).ok).toBe(false);
    success(await enabled.resolveSession(m.token.bearer)); success(await service.resolveSession(foreignSession.bearer));
  });
  it('serializes command commit with revocation, then refuses all later commands', async () => {
    const c = await child(), result = await issue(c); success(result);
    const second = createFamilySessionService(other.db, createIdentityExchangeService(other.db, exchangeConfig(() => tick)), familyConfig(() => tick));
    let enter!: () => void, release!: () => void;
    const entered = new Promise<void>(r => { enter = r; }), gate = new Promise<void>(r => { release = r; });
    const request = { action: 'child.play', family_id: c.familyId, profile_id: c.profile.id };
    const command = service.withFamilyAccess(result.bearer, request, async tx => {
      enter(); await gate;
      await tx.update(memberProfiles).set({ display_name: 'Committed fixture' }).where(eq(memberProfiles.id, c.profile.id));
      return 'committed';
    });
    await entered;
    const revoke = second.revokeSession(result.bearer, { session_id: result.session.id, expected_revision: 1 });
    let blocked = false;
    try {
      for (let i = 0; i < 60; i++) {
        const rows = await raw`SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock'`;
        if (rows[0].n > 0) { blocked = true; break; }
        await new Promise(r => setTimeout(r, 10));
      }
    } finally { release(); }
    success(await command); success(await revoke); expect(blocked).toBe(true);
    let calls = 0;
    expect((await service.withFamilyAccess(result.bearer, request, async () => ++calls)).ok).toBe(false);
    expect(calls).toBe(0);
    expect((await raw`SELECT display_name FROM rpg.member_profiles WHERE id=${c.profile.id}`)[0].display_name).toBe('Committed fixture');
  });
  it('rolls back a failing trusted command within the authorization transaction', async () => {
    const c = await child(), result = await issue(c); success(result);
    const response = await service.withFamilyAccess(result.bearer, { action: 'child.play', family_id: c.familyId, profile_id: c.profile.id }, async tx => {
      await tx.update(memberProfiles).set({ display_name: 'Must roll back' }).where(eq(memberProfiles.id, c.profile.id));
      throw new Error('synthetic sensitive internal detail');
    });
    expect(response).toEqual({ ok: false, error_key: 'family.access_unavailable' });
    expect((await raw`SELECT display_name FROM rpg.member_profiles WHERE id=${c.profile.id}`)[0].display_name).toBe(c.profile.display_name);
  });
  it('matches generated migration and live catalog for all family access tables', async () => {
    const before = generateDrizzleJson(identitySchema);
    const generated = await generateMigration(before, generateDrizzleJson(targetSchema, before.id));
    expect(await readFile('migrations/target/0004_family_access.sql', 'utf8')).toBe(
      '-- G03-D: generated target family access schema; reviewed before disposable execution.\n' + generated.join('\n\n') + '\n');
    for (const table of familyAccessTables) {
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
      const indexes = await raw`SELECT indexname FROM pg_indexes WHERE schemaname='rpg' AND tablename=${cfg.name}`;
      for (const index of cfg.indexes) expect(indexes.map(i => i.indexname)).toContain(index.config.name);
    }
  });
  it('SQL rejects cross-family/profile/account/role lineage and duplicate active bindings', async () => {
    const c = await child(), another = await child(c.familyId), foreign = await child(), a = await adult(c.familyId), m = await managed(a);
    await expect(raw`UPDATE rpg.access_bindings SET family_id=${foreign.familyId} WHERE id=${c.binding.id}`).rejects.toMatchObject({ code: '23503' });
    await expect(raw`UPDATE rpg.access_bindings SET profile_role='parent' WHERE id=${c.binding.id}`).rejects.toMatchObject({ code: '23514' });
    await expect(database.db.insert(accessBindings).values({ ...c.binding, id: newEntityId(), account_id: another.binding.account_id })).rejects.toThrow();
    await expect(raw`UPDATE rpg.access_bindings SET manager_kind=NULL WHERE id=${m.binding.id}`).rejects.toMatchObject({ code: '23514' });
    await expect(raw`UPDATE rpg.access_bindings SET manager_binding_id=${c.binding.id} WHERE id=${m.binding.id}`).rejects.toMatchObject({ code: '23503' });
    await expect(raw`UPDATE rpg.access_bindings SET origin_invitation_id=${newEntityId()} WHERE id=${c.binding.id}`).rejects.toMatchObject({ code: '23514' });
  });
  it('SQL rejects forged contexts, null-proof bypass, parent cycles and token mismatch', async () => {
    const c = await child(), result = await issue(c); success(result);
    const a = await adult(c.familyId), m = await managed(a), a2 = await adult(c.familyId), foreign = await child();
    await expect(raw`UPDATE rpg.session_contexts SET account_id=${a.binding.account_id} WHERE id=${result.session.id}`).rejects.toMatchObject({ code: '23503' });
    await expect(raw`UPDATE rpg.session_contexts SET protection_revision=NULL WHERE id=${a.context.id}`).rejects.toMatchObject({ code: '23514' });
    await expect(raw`UPDATE rpg.session_contexts SET parent_mode=NULL WHERE id=${m.context.id}`).rejects.toMatchObject({ code: '23514' });
    await expect(raw`UPDATE rpg.session_contexts SET parent_session_id=${m.context.id} WHERE id=${m.context.id}`).rejects.toMatchObject({ code: '23514' });
    await expect(raw`UPDATE rpg.session_contexts SET parent_session_id=${a2.context.id}, parent_binding_id=${a2.binding.id} WHERE id=${m.context.id}`).rejects.toMatchObject({ code: '23503' });
    await expect(raw`UPDATE rpg.session_token_verifiers SET family_id=${foreign.familyId} WHERE session_id=${result.session.id}`).rejects.toMatchObject({ code: '23503' });
    await expect(raw`UPDATE rpg.session_token_verifiers SET token_verifier='plaintext' WHERE session_id=${result.session.id}`).rejects.toMatchObject({ code: '23514' });
    await expect(database.db.insert(sessionTokenVerifiers).values({ ...a.token.record, id: newEntityId(), token_verifier: 'd'.repeat(64) })).rejects.toThrow();
  });
  it('rolls back fourth migration and journal atomically, then applies reviewed migration', async () => {
    await reset();
    const directory = await mkdtemp(path.join(tmpdir(), 'family-rpg-g03-d-'));
    try {
      const manifest = [];
      for (const [i, migration] of (await loadMigrations('migrations/target')).entries()) {
        const source = migration.sql + (i === 3 ? '\nSELECT 1/0;' : '');
        await writeFile(path.join(directory, migration.name), source);
        manifest.push({ name: migration.name, sha256: createHash('sha256').update(source).digest('hex') });
      }
      await writeFile(path.join(directory, 'manifest.json'), JSON.stringify({ schema_version: 1, migrations: manifest }));
      await expect(runTargetMigrations(raw, config, directory)).rejects.toMatchObject({ code: '22012' });
      expect((await raw`SELECT count(*)::int AS n FROM rpg.__target_migrations`)[0].n).toBe(3);
      expect((await raw`SELECT to_regclass('rpg.session_contexts') AS t`)[0].t).toBeNull();
      expect(await runTargetMigrations(raw, config, 'migrations/target')).toBe((await loadMigrations('migrations/target')).length-3);
    } finally { await rm(directory, { recursive: true }); }
  });
});
