import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { generateDrizzleJson, generateMigration } from 'drizzle-kit/api';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { readTargetConfig } from '../../src/target/config';
import { assertTargetDatabase, createTargetClient } from '../../src/target/db/client';
import { openTargetDatabase } from '../../src/target/db/database';
import { loadMigrations, runTargetMigrations } from '../../src/target/db/migrator';
import { families, memberProfiles, players, retentionPolicyRevisions } from '../../src/target/db/schema/foundation';
import { accessBindings, targetSchema as familySchema } from '../../src/target/db/schema/familyAccess';
import { adultProtections, adultRecoveryCredentials, adultProtectionTables, adultScopeIndexes, targetSchema } from '../../src/target/db/schema/adultProtection';
import { createIdentityExchangeService } from '../../src/target/access/identityExchange';
import { createAdultAccessService, type AdultDependencies } from '../../src/target/access/adultAccess';
import { createPinKdf, newRecoveryCode } from '../../src/target/access/adultCrypto';
import { newEntityId } from '../../src/target/contracts/ids';
import { assertOwnedContainer } from '../../scripts/target/test-environment';
import { familyFixture, profileFixture, playerFixture, retentionFixture } from './foundation-fixtures';
import { exchangeConfig, startMs, syntheticInput } from './identity-exchange-fixtures';
import { at, bindingFixture } from './family-access-fixtures';
import { adultConfig, syntheticPepper, syntheticPin } from './adult-fixtures';

function success<T extends { ok: boolean }>(r: T): asserts r is Extract<T,{ok:true}> {
  expect(r.ok,'error_key' in r ? String(r.error_key) : undefined).toBe(true);
  if (!r.ok) throw new Error('Synthetic operation failed');
}
const deferred = () => { let release!: () => void; const promise = new Promise<void>(r => { release=r; }); return {promise,release}; };
describe.skipIf(process.env.RPG_TARGET_PG_TESTS !== '1')('adult protection in owned PostgreSQL (G03-E)', () => {
  let config: ReturnType<typeof readTargetConfig>, raw: ReturnType<typeof createTargetClient>;
  let database: Awaited<ReturnType<typeof openTargetDatabase>>, other: typeof database;
  let tick: number, sequence: number;
  let exchange: ReturnType<typeof createIdentityExchangeService>, service: ReturnType<typeof createAdultAccessService>;
  beforeAll(async () => {
    config=readTargetConfig(process.env);
    await assertOwnedContainer({id:process.env.RPG_TARGET_CONTAINER_ID ?? '',runId:config.runId});
    raw=createTargetClient(config); await assertTargetDatabase(raw,config);
    database=await openTargetDatabase(config); other=await openTargetDatabase(config);
  });
  const make = (db=database.db,deps: AdultDependencies={}) => createAdultAccessService(db,
    createIdentityExchangeService(db,exchangeConfig(() => tick)),adultConfig(() => tick),syntheticPepper(),deps);
  beforeEach(async () => {
    tick=startMs; sequence=0; await runTargetMigrations(raw,config,'migrations/target');
    await database.db.insert(retentionPolicyRevisions).values(retentionFixture());
    exchange=createIdentityExchangeService(database.db,exchangeConfig(() => tick)); success(await exchange.activatePolicy(0));
    service=make(); success(await service.activatePolicy(0));
  });
  afterEach(async () => { await assertTargetDatabase(raw,config); await raw`DROP SCHEMA IF EXISTS content CASCADE`; await raw`DROP SCHEMA IF EXISTS rpg CASCADE`; });
  afterAll(async () => { await other?.close(); await database?.close(); await raw?.end({timeout:5}); });
  async function launch(user=100) {
    const r=await exchange.exchangeTelegramIdentity(syntheticInput(tick,String(++sequence),user)); success(r); return r;
  }
  async function fixture() {
    const f={...familyFixture(),created_at:at(),updated_at:at()}; await database.db.insert(families).values(f);
    const source=await launch(), p={...profileFixture(f.id,'parent'),created_at:at(),updated_at:at()}; await database.db.insert(memberProfiles).values(p);
    const binding=bindingFixture(f.id,source.launch.account_id,p.id,'adult_membership'); await database.db.insert(accessBindings).values(binding);
    const c={...profileFixture(f.id,'child'),created_at:at(),updated_at:at()}; await database.db.insert(memberProfiles).values(c);
    await database.db.insert(players).values({...playerFixture(f.id,c.id),created_at:at()});
    const managed=bindingFixture(f.id,binding.account_id,c.id,'managed_child',binding.id); await database.db.insert(accessBindings).values(managed);
    return {f,binding,managed,source};
  }
  async function setup(a: Awaited<ReturnType<typeof fixture>>) {
    const s=await service.beginSetup(a.source.bearer,{family_id:a.f.id,binding_id:a.binding.id}); success(s);
    const p=await service.prepareSetup(s.bearer,{pin:syntheticPin,pin_confirmation:syntheticPin,expected_revision:s.setup.revision}); success(p);
    return {s,p};
  }
  async function active() {
    const a=await fixture(), {s,p}=await setup(a);
    success(await service.acknowledgeRecovery(s.bearer,{recovery_code:p.recovery_code,expected_revision:p.setup_revision})); return a;
  }
  async function login(a: Awaited<ReturnType<typeof fixture>>, pin=syntheticPin, svc=service) {
    const l=await launch(); return svc.login(l.bearer,{family_id:a.f.id,binding_id:a.binding.id,pin});
  }
  async function logged() { const a=await active(), token=await login(a); success(token); return {...a,token}; }
  const switching = (bearer:string,binding:string,mode='managed_child',expected=1,pin=syntheticPin) => service.switchMode(bearer,
    {pin,target_mode:mode,target_binding_id:binding,expected_session_revision:expected});

  it('requires recovery acknowledgement before rights, keeps secrets out of persisted records and consumes setup launch',async () => {
    const a=await fixture(), {s,p}=await setup(a);
    expect((await login(a)).ok).toBe(false);
    expect((await exchange.resolveLaunch(a.source.bearer)).ok).toBe(false);
    const state=await service.getSetup(s.bearer); success(state); expect(state.setup.state).toBe('awaiting_recovery');
    expect(JSON.stringify(state)).not.toContain(p.recovery_code);
    expect(JSON.stringify(p)).not.toContain(p.recovery_code); expect(JSON.stringify(s)).not.toContain(s.bearer);
    const records=await raw`SELECT row_to_json(p) AS p FROM rpg.adult_protections p`;
    expect(JSON.stringify(records)).not.toContain(p.recovery_code); expect(JSON.stringify(records)).not.toContain(syntheticPin);
    expect((await service.acknowledgeRecovery(s.bearer,{recovery_code:newRecoveryCode(),expected_revision:2})).ok).toBe(false);
    expect((await raw`SELECT count(*)::int AS n FROM rpg.adult_attempts WHERE outcome='denied'`)[0].n).toBe(1);
    success(await service.acknowledgeRecovery(s.bearer,{recovery_code:p.recovery_code,expected_revision:2}));
    expect((await service.getSetup(s.bearer)).ok).toBe(false);
    const token=await login(a); success(token); const actor=await service.sessions.resolveSession(token.bearer); success(actor);
    expect(actor.actor.mode).toBe('adult');
    expect((await raw`SELECT count(*)::int AS n FROM rpg.players`)[0].n).toBe(1);
  });
  it('rotates a lost response without redisplaying or accepting the previous recovery code',async () => {
    const a=await fixture(), {s,p}=await setup(a);
    const rotated=await service.rotatePendingRecovery(s.bearer,{expected_revision:2}); success(rotated);
    expect(rotated.recovery_code).not.toBe(p.recovery_code);
    expect((await service.rotatePendingRecovery(s.bearer,{expected_revision:2})).ok).toBe(false);
    expect((await service.acknowledgeRecovery(s.bearer,{recovery_code:p.recovery_code,expected_revision:3})).ok).toBe(false);
    success(await service.acknowledgeRecovery(s.bearer,{recovery_code:rotated.recovery_code,expected_revision:3}));
    const rows=await database.db.select().from(adultRecoveryCredentials); expect(rows.filter(r=>r.revoked_at===null)).toHaveLength(1);
  });
  it('rejects unknown fields, nonadult bindings, mismatched PINs, and setup at exact expiry',async () => {
    const a=await fixture();
    expect((await service.beginSetup(a.source.bearer,{family_id:a.f.id,binding_id:a.managed.id})).ok).toBe(false);
    const s=await service.beginSetup(a.source.bearer,{family_id:a.f.id,binding_id:a.binding.id}); success(s);
    for (const req of [{pin:syntheticPin,pin_confirmation:'999999',expected_revision:1},
      {pin:syntheticPin,pin_confirmation:syntheticPin,expected_revision:1,PIN:true}]) expect((await service.prepareSetup(s.bearer,req)).ok).toBe(false);
    tick+=600000; expect((await service.prepareSetup(s.bearer,{pin:syntheticPin,pin_confirmation:syntheticPin,expected_revision:1})).ok).toBe(false);
    expect(await database.db.select().from(adultProtections)).toHaveLength(0);
  });
  it('serializes setup and login across pools, including durable launch consumption',async () => {
    const a=await fixture(), second=make(other.db);
    const req={family_id:a.f.id,binding_id:a.binding.id};
    const results=await Promise.all([service.beginSetup(a.source.bearer,req),second.beginSetup(a.source.bearer,req)]);
    expect(results.filter(r=>r.ok)).toHaveLength(1); const s=results.find(r=>r.ok)!; success(s);
    const p=await service.prepareSetup(s.bearer,{pin:syntheticPin,pin_confirmation:syntheticPin,expected_revision:1}); success(p);
    success(await service.acknowledgeRecovery(s.bearer,{recovery_code:p.recovery_code,expected_revision:2}));
    const l=await launch(); const logins=await Promise.all([service.login(l.bearer,{...req,pin:syntheticPin}),second.login(l.bearer,{...req,pin:syntheticPin})]);
    expect(logins.filter(r=>r.ok)).toHaveLength(1);
    expect((await raw`SELECT count(*)::int AS n FROM rpg.session_contexts`)[0].n).toBe(1);
  });
  it('atomically retires adult bearer, preserves child lineage after idle, and requires PIN for return',async () => {
    const a=await logged(); const child=await switching(a.token.bearer,a.managed.id); success(child);
    expect((await service.sessions.resolveSession(a.token.bearer)).ok).toBe(false);
    tick+=1800001; const resolved=await service.sessions.resolveSession(child.bearer); success(resolved); expect(resolved.actor.mode).toBe('managed_child');
    expect((await switching(child.bearer,a.binding.id,'adult',1,'999999')).ok).toBe(false);
    expect((await service.confirmAction(child.bearer,{pin:syntheticPin,action:'revoke_binding',target_id:a.managed.id,expected_revision:1,operation_id:newEntityId()})).ok).toBe(false);
    const returned=await switching(child.bearer,a.binding.id,'adult'); success(returned);
    expect((await service.sessions.resolveSession(child.bearer)).ok).toBe(false); success(await service.sessions.resolveSession(returned.bearer));
    expect((await raw`SELECT count(*)::int AS n FROM rpg.players`)[0].n).toBe(1);
  });
  it('enforces idle activity and absolute adult grant, with reauthentication after expiry',async () => {
    const a=await logged(); tick+=299000;
    success(await service.sessions.withFamilyAccess(a.token.bearer,{action:'family.manage',family_id:a.f.id,profile_id:null},async()=>true));
    tick+=299000; success(await service.sessions.resolveSession(a.token.bearer));
    tick+=1000; expect((await service.sessions.resolveSession(a.token.bearer)).ok).toBe(false);
    const returned=await switching(a.token.bearer,a.binding.id,'adult',2); success(returned);
    tick+=1800000; expect((await service.sessions.resolveSession(returned.bearer)).ok).toBe(false);
  });
  it('persists five failures across pools and new launches; pause expires without erasing daily history',async () => {
    const a=await active();
    for(let i=0;i<5;i++) expect((await login(a,'999999',i%2 ? make(other.db) : service)).ok).toBe(false);
    expect(await login(a)).toEqual({ok:false,error_key:'adult.retry_later'});
    tick+=900000; success(await login(a));
    expect((await raw`SELECT count(*)::int AS n FROM rpg.adult_attempts WHERE outcome='denied'`)[0].n).toBe(5);
    for(let block=0;block<3;block++) {
      tick+=900001;
      for(let i=0;i<5;i++) expect((await login(a,'999999')).ok).toBe(false);
    }
    tick+=900001; expect(await login(a)).toEqual({ok:false,error_key:'adult.retry_later'});
    tick+=86400000; success(await login(a));
  });
  it('limits KDF across pools without holding the family lock and rejects a changed binding at commit',async () => {
    const a=await active(), entered=deferred(), release=deferred();
    const kdf=createPinKdf(syntheticPepper());
    const slow=make(other.db,{derivePin:async(pin,salt)=>{entered.release(); await release.promise; return kdf.derive(pin,salt);}});
    const pending=login(a,syntheticPin,slow); await entered.promise;
    try {
      const l=await launch();
      // This would hang if the KDF held the family transaction lock.
      expect((await service.beginSetup(l.bearer,{family_id:a.f.id,binding_id:a.binding.id})).ok).toBe(false);
      await raw`UPDATE rpg.access_bindings SET state_revision=2 WHERE id=${a.binding.id}`;
    } finally {release.release();}
    expect((await pending).ok).toBe(false);
    expect((await raw`SELECT count(*)::int AS n FROM rpg.session_contexts`)[0].n).toBe(0);
    expect((await raw`SELECT outcome FROM rpg.adult_attempts WHERE purpose='login'`)[0].outcome).toBe('stale');
  });
  it('rejects a third KDF immediately and releases reservations after work finishes',async () => {
    const a=await active(), release=deferred(), both=deferred(); let count=0;
    const kdf=createPinKdf(syntheticPepper());
    const slow=make(other.db,{derivePin:async(pin,salt)=>{if(++count===2)both.release();await release.promise;return kdf.derive(pin,salt);}});
    const first=login(a,syntheticPin,slow), second=login(a,syntheticPin,slow); await both.promise;
    try { expect(await login(a)).toEqual({ok:false,error_key:'adult.busy'}); } finally {release.release();}
    success(await first); success(await second); success(await login(a));
  });
  it('rolls back token failure and keeps the original bearer usable after a failed switch',async () => {
    const a=await logged();
    await raw`CREATE FUNCTION rpg.reject_fixture() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic private detail'; END $$`;
    await raw`CREATE TRIGGER reject_fixture BEFORE INSERT ON rpg.session_token_verifiers FOR EACH ROW EXECUTE FUNCTION rpg.reject_fixture()`;
    expect(await switching(a.token.bearer,a.managed.id)).toEqual({ok:false,error_key:'adult.access_unavailable'});
    success(await service.sessions.resolveSession(a.token.bearer));
    expect((await raw`SELECT count(*)::int AS n FROM rpg.session_contexts`)[0].n).toBe(1);
    await raw`DROP TRIGGER reject_fixture ON rpg.session_token_verifiers`;
    success(await switching(a.token.bearer,a.managed.id));
  });
  it('binds fresh proof to target/revision/operation, deduplicates revoke and applies pair quota',async () => {
    const a=await logged(), target=await login(a); success(target);
    const operation=newEntityId(), req={pin:syntheticPin,action:'revoke_session',target_id:target.session.id,expected_revision:1,operation_id:operation};
    expect((await service.sessions.revokeSession(a.token.bearer,{session_id:target.session.id,expected_revision:1})).ok).toBe(false);
    const proof=await service.confirmAction(a.token.bearer,req); success(proof);
    const confirmation={proof_bearer:proof.proof_bearer,operation_id:operation};
    expect((await service.sessions.revokeSession(a.token.bearer,{session_id:target.session.id,expected_revision:2},confirmation)).ok).toBe(false);
    success(await service.sessions.revokeSession(a.token.bearer,{session_id:target.session.id,expected_revision:1},confirmation));
    expect(await service.sessions.revokeSession(a.token.bearer,{session_id:target.session.id,expected_revision:1},confirmation)).toEqual({ok:true,replayed:true});
    expect((await service.sessions.resolveSession(target.bearer)).ok).toBe(false);
    const next=await login(a); success(next); const op2=newEntityId();
    const secondProof=await service.confirmAction(a.token.bearer,{...req,target_id:next.session.id,operation_id:op2}); success(secondProof);
    expect((await service.sessions.revokeSession(a.token.bearer,{session_id:next.session.id,expected_revision:1},{proof_bearer:secondProof.proof_bearer,operation_id:op2})).ok).toBe(false);
    expect((await raw`SELECT count(*)::int AS n FROM rpg.access_operations`)[0].n).toBe(1);
    expect((await raw`SELECT count(*)::int AS n FROM rpg.access_audit_events WHERE operation_id IS NOT NULL`)[0].n).toBe(1);
  });
  it('expires fresh proof exactly and invalidates old services on policy/key activation',async () => {
    const a=await logged(), target=await login(a); success(target);
    const op=newEntityId(), proof=await service.confirmAction(a.token.bearer,{pin:syntheticPin,action:'revoke_session',target_id:target.session.id,expected_revision:1,operation_id:op}); success(proof);
    tick+=120000;
    expect((await service.sessions.revokeSession(a.token.bearer,{session_id:target.session.id,expected_revision:1},{proof_bearer:proof.proof_bearer,operation_id:op})).ok).toBe(false);
    const cfg=adultConfig(()=>tick); const changed=createAdultAccessService(other.db,exchange,{...cfg,pepperKeyId:'rotated_fixture',family:{...cfg.family,policyRevision:2}},new Uint8Array(32).fill(8));
    success(await changed.activatePolicy(1));
    expect((await service.sessions.resolveSession(a.token.bearer)).ok).toBe(false);
    expect((await login(a,syntheticPin,changed)).ok).toBe(false);
    expect((await service.activatePolicy(2)).ok).toBe(false);
  });
  it('matches generated migration and live catalog for all adult protection tables', async () => {
    const before = generateDrizzleJson(familySchema);
    const generated = await generateMigration(before, generateDrizzleJson(targetSchema, before.id));
    expect(await readFile('migrations/target/0005_adult_protection.sql', 'utf8')).toBe(
      '-- G03-E: generated target adult access schema; reviewed before disposable execution.\n' + [...adultScopeIndexes,...generated].join('\n\n') + '\n');
    for (const table of adultProtectionTables) {
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
  it('rolls back fifth migration and journal atomically, then applies reviewed migration', async () => {
    await raw`DROP SCHEMA IF EXISTS content CASCADE`; await raw`DROP SCHEMA IF EXISTS rpg CASCADE`;
    const directory = await mkdtemp(path.join(tmpdir(), 'family-rpg-g03-e-'));
    try {
      const manifest = [];
      for (const [i, migration] of (await loadMigrations('migrations/target')).entries()) {
        const source = migration.sql + (i === 4 ? '\nSELECT 1/0;' : '');
        await writeFile(path.join(directory, migration.name), source);
        manifest.push({ name: migration.name, sha256: createHash('sha256').update(source).digest('hex') });
      }
      await writeFile(path.join(directory, 'manifest.json'), JSON.stringify({ schema_version: 1, migrations: manifest }));
      await expect(runTargetMigrations(raw, config, directory)).rejects.toMatchObject({ code: '22012' });
      expect((await raw`SELECT count(*)::int AS n FROM rpg.__target_migrations`)[0].n).toBe(4);
      expect((await raw`SELECT to_regclass('rpg.adult_protections') AS t`)[0].t).toBeNull();
      expect(await runTargetMigrations(raw, config, 'migrations/target')).toBe(2);
    } finally { await rm(directory, { recursive: true }); }
  });
  it('SQL rejects cross-family protection, mismatched launch, null proof and verifier substitutions',async () => {
    const a=await logged(), target=await login(a); success(target);
    const foreign=familyFixture(); await database.db.insert(families).values(foreign);
    await expect(raw`UPDATE rpg.adult_protections SET family_id=${foreign.id}`).rejects.toMatchObject({code:'23503'});
    await expect(raw`UPDATE rpg.adult_protections SET recovery_ack_at=NULL`).rejects.toMatchObject({code:'23514'});
    await expect(raw`UPDATE rpg.adult_protections SET kdf_id='unknown'`).rejects.toMatchObject({code:'23514'});
    await expect(raw`UPDATE rpg.adult_attempts SET credential_revision=NULL WHERE protection_id IS NOT NULL`).rejects.toMatchObject({code:'23514'});
    const otherLaunch=await launch(101);
    await expect(raw`UPDATE rpg.adult_setups SET launch_id=${otherLaunch.launch.id}`).rejects.toMatchObject({code:'23503'});
    const operation=newEntityId(), proof=await service.confirmAction(a.token.bearer,{pin:syntheticPin,action:'revoke_session',target_id:target.session.id,expected_revision:1,operation_id:operation}); success(proof);
    const [token]=await raw`SELECT id FROM rpg.session_token_verifiers WHERE session_id=${target.session.id}`;
    await expect(raw`UPDATE rpg.adult_action_proofs SET source_verifier_id=${token.id}`).rejects.toMatchObject({code:'23503'});
    await expect(raw`UPDATE rpg.adult_action_proofs SET target_session_id=NULL`).rejects.toMatchObject({code:'23514'});
    success(await service.sessions.revokeSession(a.token.bearer,{session_id:target.session.id,expected_revision:1},{proof_bearer:proof.proof_bearer,operation_id:operation}));
    await expect(raw`UPDATE rpg.access_operations SET family_id=${foreign.id}`).rejects.toMatchObject({code:'23503'});
  });
  it('a policy activation during KDF prevents issuance even on an already running service',async () => {
    const a=await active(), entered=deferred(), release=deferred(), kdf=createPinKdf(syntheticPepper());
    const slow=make(other.db,{derivePin:async(pin,salt)=>{entered.release();await release.promise;return kdf.derive(pin,salt);}});
    const pending=login(a,syntheticPin,slow); await entered.promise;
    try {
      tick+=1; const cfg=adultConfig(()=>tick);
      const next=createAdultAccessService(database.db,exchange,{...cfg,family:{...cfg.family,policyRevision:2}},syntheticPepper());
      success(await next.activatePolicy(1));
    } finally {release.release();}
    expect((await pending).ok).toBe(false);
    expect((await raw`SELECT count(*)::int AS n FROM rpg.session_contexts`)[0].n).toBe(0);
  });
  it('counts pending attempts before parallel guesses and persists failures after restart',async () => {
    const a=await active(); for(let i=0;i<3;i++) await login(a,'999999');
    const release=deferred(), both=deferred(), kdf=createPinKdf(syntheticPepper()); let calls=0;
    const slow=make(other.db,{derivePin:async(pin,salt)=>{if(++calls===2)both.release();await release.promise;return kdf.derive(pin,salt);}});
    const one=login(a,'999999',slow),two=login(a,'999999',slow); await both.promise;
    try {expect(await login(a,syntheticPin,make())).toEqual({ok:false,error_key:'adult.retry_later'});}finally{release.release();}
    expect((await one).ok).toBe(false); expect((await two).ok).toBe(false);
    expect(await login(a,syntheticPin,make(other.db))).toEqual({ok:false,error_key:'adult.retry_later'});
  });
  it('preserves an independent own-child session while revoking the managed binding',async () => {
    const a=await logged(), l=await launch(101), own=bindingFixture(a.f.id,l.launch.account_id,a.managed.profile_id);
    await database.db.insert(accessBindings).values(own);
    const child=await service.sessions.issueOwnChild(l.bearer,{family_id:a.f.id,binding_id:own.id}); success(child);
    const anotherAdult=await login(a); success(anotherAdult);
    const managed=await switching(anotherAdult.bearer,a.managed.id); success(managed);
    expect((await switching(child.bearer,a.binding.id,'adult')).ok).toBe(false);
    const operation=newEntityId(), proof=await service.confirmAction(a.token.bearer,{pin:syntheticPin,action:'revoke_binding',target_id:a.managed.id,expected_revision:1,operation_id:operation}); success(proof);
    success(await service.sessions.revokeBinding(a.token.bearer,{binding_id:a.managed.id,expected_revision:1},{proof_bearer:proof.proof_bearer,operation_id:operation}));
    expect((await service.sessions.resolveSession(managed.bearer)).ok).toBe(false); success(await service.sessions.resolveSession(child.bearer));
  });
  it('revalidates target revision after KDF and keeps source bearer on failed handoff',async () => {
    const a=await logged(), entered=deferred(), release=deferred(), kdf=createPinKdf(syntheticPepper());
    const slow=make(other.db,{derivePin:async(pin,salt)=>{entered.release();await release.promise;return kdf.derive(pin,salt);}});
    const pending=slow.switchMode(a.token.bearer,{pin:syntheticPin,target_mode:'managed_child',target_binding_id:a.managed.id,expected_session_revision:1}); await entered.promise;
    try {await raw`UPDATE rpg.access_bindings SET state_revision=2 WHERE id=${a.managed.id}`;}finally{release.release();}
    expect((await pending).ok).toBe(false); success(await service.sessions.resolveSession(a.token.bearer));
    expect((await raw`SELECT count(*)::int AS n FROM rpg.session_contexts`)[0].n).toBe(1);
  });
  it('cannot restart setup on a revoked protection or use a closed identity for return',async () => {
    const a=await logged(), child=await switching(a.token.bearer,a.managed.id); success(child);
    await raw`UPDATE rpg.external_identities SET revoked_at=created_at`;
    expect((await switching(child.bearer,a.binding.id,'adult')).ok).toBe(false);
    await raw`UPDATE rpg.external_identities SET revoked_at=NULL`;
    await raw`UPDATE rpg.adult_protections SET status='revoked',revoked_at=created_at`;
    const l=await launch(); expect((await service.beginSetup(l.bearer,{family_id:a.f.id,binding_id:a.binding.id})).ok).toBe(false);
    expect((await service.sessions.resolveSession(child.bearer)).ok).toBe(false);
  });

  it('rolls back proof consumption and operation audit when target CAS fails',async () => {
    const a=await logged(), target=await login(a); success(target);
    const operation=newEntityId(), proof=await service.confirmAction(a.token.bearer,{pin:syntheticPin,action:'revoke_session',target_id:target.session.id,expected_revision:2,operation_id:operation}); success(proof);
    expect((await service.sessions.revokeSession(a.token.bearer,{session_id:target.session.id,expected_revision:2},{proof_bearer:proof.proof_bearer,operation_id:operation})).ok).toBe(false);
    const [row]=await raw`SELECT consumed_at,state_revision FROM rpg.adult_action_proofs WHERE operation_id=${operation}`;
    expect(row).toMatchObject({consumed_at:null,state_revision:1});
    expect((await raw`SELECT count(*)::int AS n FROM rpg.access_operations`)[0].n).toBe(0);
    expect((await raw`SELECT count(*)::int AS n FROM rpg.access_audit_events WHERE operation_id IS NOT NULL`)[0].n).toBe(0);
    success(await service.sessions.resolveSession(target.bearer));
  });

});
