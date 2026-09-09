import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { setTimeout as delay } from 'node:timers/promises';
import { connectV3Database, type V3Database } from '../../src/v3-server/db/client.js';
import { readV3FoundationTestConfig } from '../../src/v3-server/db/config.js';
import { migrateV3Database } from '../../src/v3-server/db/migrate.js';
import { createAccessService, type VerifiedActor } from '../../src/v3-server/access/service.js';
import { createFoundationService } from '../../src/v3-server/foundation/service.js';
import { newEntityId } from '../../src/v3-server/foundation/ids.js';
import { parseRevision } from '../../src/v3-server/contracts/primitives.js';
import { FixtureIdentityAdapter, createFixture, grant, cleanFixture, writeProbe, type Fixture } from './support/fixture.js';

const pg = process.env.V3_FOUNDATION_TEST_CONFIG ? describe : describe.skip;
pg('V3 synthetic access/foundation transaction boundaries', () => {
  let db: V3Database;
  let fixture: Fixture;
  let sentinel: Fixture;
  let adapter: FixtureIdentityAdapter;
  let access: ReturnType<typeof createAccessService<ReturnType<FixtureIdentityAdapter['credential']>>>;
  const actor = (role: 'adult' | 'child') => access.authenticate(adapter.credential(fixture[role].session));
  const target = (role: 'adult' | 'child') => ({ familyId: fixture.family, playerId: fixture[role].player });
  const count = async () => Number((await db.sql`select count(*) as n from v3_fixture.probes where family_id=${fixture.family}`)[0].n);
  const probe = (who: VerifiedActor, role: 'adult' | 'child' = 'child') =>
    access.withOperation(who, 'SubmitSelf', target(role), tx => writeProbe(tx, fixture.family, fixture[role].player));
  beforeAll(async () => {
    db = await connectV3Database(readV3FoundationTestConfig(process.env));
    await migrateV3Database(db);
    await db.sql`create schema if not exists v3_fixture`;
    await db.sql`create table if not exists v3_fixture.probes(id uuid primary key, family_id uuid not null, player_id uuid not null)`;
    sentinel = await createFixture(db);
  });
  beforeEach(async () => {
    fixture = await createFixture(db);
    adapter = new FixtureIdentityAdapter();
    access = createAccessService(db, adapter);
    for (const role of ['adult', 'child'] as const) {
      await grant(db, fixture, role, 'family.read');
      await grant(db, fixture, role, 'completion.submit_self');
      await grant(db, fixture, role, 'real_reward.request_self');
    }
    await grant(db, fixture, 'adult', 'family.manage');
  });
  afterEach(async () => {
    if (fixture) await cleanFixture(db, fixture);
    expect((await db.sql`select id from rpg_v3.families where id=${sentinel.family}`)).toHaveLength(1);
  });
  afterAll(async () => { if (db) { if (sentinel) await cleanFixture(db, sentinel); await db.close(); } });

  it('F31-02 stores/reads adult and child Players through one contract; grants remain explicit', async () => {
    const service = createFoundationService(access);
    const admin = await actor('adult');
    for (const familyRole of ['adult', 'child'] as const) {
      const created = await service.createMember(admin, fixture.family, { displayName: 'Участник фикстуры', familyRole, withPlayer: true });
      expect(created.member.familyRole).toBe(familyRole);
      expect(created.player?.memberId).toBe(created.member.id);
      expect(created.player).not.toHaveProperty('familyRole');
      expect(await db.sql`select id from rpg_v3.capability_grants where member_id=${created.member.id}`).toHaveLength(0);
    }
    const roster = await service.readRoster(admin, fixture.family);
    expect(roster.members).toHaveLength(4);
    expect(roster.players).toHaveLength(4);
  });
  it('F31-03 adult role alone cannot review; child self grant creates a neutral probe', async () => {
    await expect(access.withOperation(await actor('adult'), 'ReviewChild', target('child'), tx => writeProbe(tx, fixture.family, fixture.child.player)))
      .rejects.toMatchObject({ code: 'FORBIDDEN' });
    await probe(await actor('child'));
    expect(await count()).toBe(1);
  });
  it('F31-03 own_child never inherits administration even with an accidentally assigned grant', async () => {
    await grant(db, fixture, 'child', 'completion.review_child');
    await grant(db, fixture, 'child', 'family.manage');
    const child = await actor('child');
    await expect(access.withOperation(child, 'ManageFamily', { familyId: fixture.family }, async () => true)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(access.withOperation(child, 'ReviewChild', target('adult'), async () => true)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
  it('F31-05 foreign family and foreign player deny without leaking their data', async () => {
    const child = await actor('child');
    for (const request of [
      { familyId: sentinel.family, playerId: sentinel.child.player },
      { familyId: fixture.family, playerId: sentinel.child.player },
      target('adult'),
    ]) {
      await expect(access.readSelfProjection(child, request)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    }
    await expect(createFoundationService(access).readRoster(await actor('adult'), sentinel.family)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(await count()).toBe(0);
  });
  it('F31-08 paused Player retains own projection; active adult member retains separate review grant', async () => {
    await grant(db, fixture, 'adult', 'completion.review_child');
    await db.sql`update rpg_v3.players set status='paused',revision=revision+1 where family_id=${fixture.family}`;
    const adult = await actor('adult');
    const child = await actor('child');
    await expect(probe(adult, 'adult')).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(probe(child)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect((await access.readSelfProjection(child, target('child'))).player.status).toBe('paused');
    expect(await access.withOperation(adult, 'ReviewChild', target('child'), async (_tx, a) => a.decision)).toBe('manual_child_review');
  });
  it.each(['left', 'archived'] as const)('F31-08 %s Player loses self access; active adult member may still administer', async status => {
    await db.sql`update rpg_v3.players set status=${status},revision=revision+1 where family_id=${fixture.family}`;
    const child = await actor('child');
    await expect(probe(child)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(access.readSelfProjection(child, target('child'))).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(await access.withOperation(await actor('adult'), 'ManageFamily', { familyId: fixture.family }, async () => true)).toBe(true);
  });
  it.each(['account_revoked', 'account_archived', 'family_archived', 'member_left', 'member_archived', 'binding_revoked', 'session_revoked', 'session_expired'] as const)(
    'F31-08 %s context cannot authenticate or use a prior actor for retry', async state => {
      const old = await actor('child');
      if (state === 'account_revoked' || state === 'account_archived') await db.sql`update rpg_v3.accounts set status=${state === 'account_revoked' ? 'revoked' : 'archived'} where id=${fixture.child.account}`;
      if (state === 'family_archived') await db.sql`update rpg_v3.families set status='archived' where id=${fixture.family}`;
      if (state === 'member_left' || state === 'member_archived') await db.sql`update rpg_v3.member_profiles set status=${state === 'member_left' ? 'left' : 'archived'} where id=${fixture.child.member}`;
      if (state === 'binding_revoked') await db.sql`update rpg_v3.access_bindings set status='revoked' where id=${fixture.child.binding}`;
      if (state === 'session_revoked') await db.sql`update rpg_v3.sessions set status='revoked' where id=${fixture.child.session}`;
      if (state === 'session_expired') await db.sql`update rpg_v3.sessions set expires_at=clock_timestamp()-interval '1 second' where id=${fixture.child.session}`;
      await expect(actor('child')).rejects.toMatchObject({ code: 'FORBIDDEN' });
      await expect(probe(old)).rejects.toMatchObject({ code: 'FORBIDDEN' });
      await expect(access.readSelfProjection(old, target('child'))).rejects.toMatchObject({ code: 'FORBIDDEN' });
      expect(await count()).toBe(0);
    });
  it('F31-08 absent Player blocks self only; mismatched mode has no fallback', async () => {
    await grant(db, fixture, 'adult', 'completion.review_child');
    await db.sql`update rpg_v3.access_bindings set player_id=null,revision=revision+1 where id=${fixture.adult.binding}`;
    const adult = await actor('adult');
    expect(await access.withOperation(adult, 'ReviewChild', target('child'), async () => true)).toBe(true);
    await expect(probe(adult, 'adult')).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await db.sql`update rpg_v3.access_bindings set mode='adult' where id=${fixture.child.binding}`;
    await expect(actor('child')).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(access.authenticate(Object.freeze({ syntheticOnly: true }))).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
  it('F31-09/11 one adult can review child; adult self policy is a distinct server decision', async () => {
    await grant(db, fixture, 'adult', 'completion.review_child');
    const adult = await actor('adult');
    await expect(access.withOperation(adult, 'ReviewChild', target('adult'), async () => true)).rejects.toMatchObject({ code: 'SELF_REVIEW_FORBIDDEN' });
    expect(await access.withOperation(adult, 'SubmitSelf', target('adult'), async (_tx, a) => a.decision)).toBe('adult_self_trusted');
    expect(await access.withOperation(await actor('child'), 'SubmitSelf', target('child'), async (_tx, a) => a.decision)).toBe('child_requires_adult');
    await db.sql`update rpg_v3.member_profiles set status='left' where id=${fixture.child.member}`;
    await db.sql`update rpg_v3.players set status='archived' where id=${fixture.child.player}`;
    expect(await access.withOperation(adult, 'ReviewChild', target('child'), async (_tx, a) => a.decision)).toBe('manual_child_review');
    expect(await count()).toBe(0);
  });
  it('F31-10 real reward eligibility is child-only even when adult has its self capability', async () => {
    await expect(access.withOperation(await actor('adult'), 'RequestRealRewardSelf', target('adult'), async () => true)).rejects.toMatchObject({ code: 'CHILD_ONLY' });
    expect(await access.withOperation(await actor('child'), 'RequestRealRewardSelf', target('child'), async () => true)).toBe(true);
    expect(await count()).toBe(0);
  });
  it.each(['paused', 'absent'] as const)('family purchase requires an active personal Player: %s cannot spend', async state => {
    await grant(db, fixture, 'adult', 'shop.purchase_family_item');
    if (state === 'paused') await db.sql`update rpg_v3.players set status='paused' where id=${fixture.adult.player}`;
    else await db.sql`update rpg_v3.access_bindings set player_id=null where id=${fixture.adult.binding}`;
    await expect(access.withOperation(await actor('adult'), 'PurchaseFamilyItem', { familyId: fixture.family }, async () => true))
      .rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
  it('F31-04/13 fabricated/copied actor and modified revisions cannot be used as identity', async () => {
    const child = await actor('child');
    expect(Object.isFrozen(child)).toBe(true);
    expect(Object.isFrozen(child.grants)).toBe(true);
    for (const forged of [
      { ...child }, { ...child, familyId: sentinel.family }, { ...child, actingMemberId: fixture.adult.member },
      { ...child, actingPlayerId: fixture.adult.player }, { ...child, capabilityRevision: 999 },
      { ...child, grants: [] },
    ]) await expect(probe(forged as VerifiedActor)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    const otherService = createAccessService(db, adapter);
    await expect(otherService.readSelfProjection(child, target('child'))).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await db.sql`update rpg_v3.member_profiles set capability_revision=capability_revision+1 where id=${fixture.child.member}`;
    await expect(probe(child)).rejects.toMatchObject({ code: 'STALE_ACTOR' });
    expect(await count()).toBe(0);
  });
  it.each(['binding', 'session', 'grant'] as const)('F31-12/13 committed %s revoke blocks new effects and projections', async kind => {
    const child = await actor('child');
    const admin = await actor('adult');
    const id = kind === 'binding' ? fixture.child.binding : kind === 'session' ? fixture.child.session :
      child.grants.find(g => g.capability === 'completion.submit_self')!.id;
    await probe(child);
    await access.revoke(admin, { familyId: fixture.family, kind, id, expectedRevision: parseRevision(1) });
    await expect(probe(child)).rejects.toBeInstanceOf(Error);
    await expect(access.readSelfProjection(child, target('child'))).rejects.toBeInstanceOf(Error);
    await expect(access.revoke(admin, { familyId: fixture.family, kind, id, expectedRevision: parseRevision(1) })).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(await count()).toBe(1);
  });
  it('F31-14 validation and permission failures cannot leave partial foundation records', async () => {
    const service = createFoundationService(access);
    const before = Number((await db.sql`select count(*) as n from rpg_v3.member_profiles where family_id=${fixture.family}`)[0].n);
    await expect(service.createMember(await actor('adult'), fixture.family, { displayName: 'Новый', familyRole: 'adult', withPlayer: true, capabilities: ['family.manage'] }))
      .rejects.toMatchObject({ code: 'VALIDATION' });
    await expect(service.createMember(await actor('child'), fixture.family, { displayName: 'Новый', familyRole: 'child', withPlayer: true }))
      .rejects.toMatchObject({ code: 'FORBIDDEN' });
    const ids = [newEntityId(), fixture.child.player];
    await expect(createFoundationService(access, () => ids.shift()!).createMember(await actor('adult'), fixture.family,
      { displayName: 'Откат фикстуры', familyRole: 'adult', withPlayer: true })).rejects.toMatchObject({ code: '23505' });
    expect(Number((await db.sql`select count(*) as n from rpg_v3.member_profiles where family_id=${fixture.family}`)[0].n)).toBe(before);
    expect(await count()).toBe(0);
  });
  it('F31-12 transaction rollback removes a neutral probe if its callback fails', async () => {
    await expect(access.withOperation(await actor('child'), 'SubmitSelf', target('child'), async tx => {
      await writeProbe(tx, fixture.family, fixture.child.player);
      throw new Error('fixture rollback');
    })).rejects.toThrow('fixture rollback');
    expect(await count()).toBe(0);
  });

  function barrier<T = void>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>(done => { resolve = done; });
    return { promise, resolve };
  }
  async function blockedBy(pid: number) {
    const deadline = Date.now() + 5_000;
    while (Date.now() < deadline) {
      const rows = await db.sql`select pid from pg_stat_activity
        where datname=current_database() and pid <> pg_backend_pid() and ${pid}=any(pg_blocking_pids(pid))`;
      if (rows.length > 0) return Number(rows[0].pid);
      await delay(10);
    }
    throw new Error('Expected independent PostgreSQL transaction to wait on the guard');
  }
  it('mutable revoke input cannot redirect an authorized family update into a sentinel family', async () => {
    const admin = await actor('adult');
    const entered = barrier<number>(), release = barrier();
    const blocker = db.sql.begin(async tx => {
      await tx`select id from rpg_v3.families where id=${fixture.family} for update`;
      entered.resolve(Number((await tx`select pg_backend_pid() as pid`)[0].pid));
      await release.promise;
    });
    const pid = await entered.promise;
    const input = { familyId: fixture.family, kind: 'binding' as const, id: fixture.child.binding, expectedRevision: parseRevision(1) };
    const revocation = access.revoke(admin, input);
    try {
      await blockedBy(pid);
      input.familyId = sentinel.family;
      input.id = sentinel.child.binding;
    } finally { release.resolve(); }
    await blocker; await revocation;
    expect((await db.sql`select status from rpg_v3.access_bindings where id=${sentinel.child.binding}`)[0].status).toBe('active');
    expect((await db.sql`select status from rpg_v3.access_bindings where id=${fixture.child.binding}`)[0].status).toBe('revoked');
  });
  it('F31-12 action locks first, commits once, then revoke wins against all subsequent requests', async () => {
    const child = await actor('child');
    const admin = await actor('adult');
    const entered = barrier<number>(), release = barrier();
    const action = access.withOperation(child, 'SubmitSelf', target('child'), async tx => {
      entered.resolve(Number((await tx`select pg_backend_pid() as pid`)[0].pid));
      await release.promise;
      return writeProbe(tx, fixture.family, fixture.child.player);
    });
    const pid = await entered.promise;
    const revocation = access.revoke(admin, { familyId: fixture.family, kind: 'binding', id: fixture.child.binding, expectedRevision: parseRevision(1) });
    try { expect(await blockedBy(pid)).not.toBe(pid); } finally { release.resolve(); }
    await action; await revocation;
    await expect(probe(child)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(await count()).toBe(1);
  });
  it('F31-12 revoke transaction locks first; waiting action rechecks committed revoked context', async () => {
    const child = await actor('child');
    const admin = await actor('adult');
    const entered = barrier<number>(), release = barrier();
    const revocation = access.withOperation(admin, 'ManageFamily', { familyId: fixture.family }, async tx => {
      await tx`update rpg_v3.access_bindings set status='revoked',revision=revision+1 where id=${fixture.child.binding}`;
      entered.resolve(Number((await tx`select pg_backend_pid() as pid`)[0].pid));
      await release.promise;
    });
    const pid = await entered.promise;
    const action = probe(child).then(() => 'unexpected', error => error);
    try { expect(await blockedBy(pid)).not.toBe(pid); } finally { release.resolve(); }
    await revocation;
    expect(await action).toMatchObject({ code: 'FORBIDDEN' });
    expect(await count()).toBe(0);
  });
});
