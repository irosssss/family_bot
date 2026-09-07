import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq,sql } from 'drizzle-orm';
import { generateDrizzleJson, generateMigration } from 'drizzle-kit/api';
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { readTargetConfig } from '../../src/target/config';
import { assertTargetDatabase, createTargetClient } from '../../src/target/db/client';
import { openTargetDatabase } from '../../src/target/db/database';
import { runTargetMigrations, loadMigrations } from '../../src/target/db/migrator';
import { families, memberProfiles, players, retentionPolicyRevisions } from '../../src/target/db/schema/foundation';
import { accessBindings } from '../../src/target/db/schema/familyAccess';
import { targetSchema as adultSchema } from '../../src/target/db/schema/adultProtection';
import { lifecycleRequests, lifecycleEvents, targetSchema, lifecycleScopeIndexes, lifecycleTables } from '../../src/target/db/schema/accessLifecycle';
import { createIdentityExchangeService } from '../../src/target/access/identityExchange';
import { createAccessLifecycleService } from '../../src/target/access/accessLifecycle';
import { type AdultDependencies } from '../../src/target/access/adultAccess';
import { createPinKdf } from '../../src/target/access/adultCrypto';
import { lifecycleRecordToDto } from '../../src/target/contracts/accessLifecycle';
import { newEntityId } from '../../src/target/contracts/ids';
import { assertOwnedContainer } from '../../scripts/target/test-environment';
import { familyFixture, profileFixture, playerFixture, retentionFixture } from './foundation-fixtures';
import { exchangeConfig, startMs, syntheticInput } from './identity-exchange-fixtures';
import { at, bindingFixture } from './family-access-fixtures';
import { adultConfig, syntheticPepper, syntheticPin } from './adult-fixtures';

function success<T extends {ok:boolean}>(r:T):asserts r is Extract<T,{ok:true}> {
  expect(r.ok,'error_key' in r?String(r.error_key):undefined).toBe(true); if(!r.ok) throw new Error('Synthetic operation failed');
}
describe.skipIf(process.env.RPG_TARGET_PG_TESTS!=='1')('recovery invitation lifecycle in owned PostgreSQL (G03-F)',()=>{
  let config:ReturnType<typeof readTargetConfig>,raw:ReturnType<typeof createTargetClient>;
  let database:Awaited<ReturnType<typeof openTargetDatabase>>,other:typeof database;
  let tick:number,sequence:number,exchange:ReturnType<typeof createIdentityExchangeService>,service:ReturnType<typeof createAccessLifecycleService>;
  const make=(db=database.db,deps:AdultDependencies={})=>createAccessLifecycleService(db,createIdentityExchangeService(db,exchangeConfig(()=>tick)),adultConfig(()=>tick),syntheticPepper(),deps);
  beforeAll(async()=>{config=readTargetConfig(process.env);await assertOwnedContainer({id:process.env.RPG_TARGET_CONTAINER_ID??'',runId:config.runId});
    raw=createTargetClient(config);await assertTargetDatabase(raw,config);database=await openTargetDatabase(config);other=await openTargetDatabase(config);});
  beforeEach(async()=>{tick=startMs;sequence=0;await runTargetMigrations(raw,config,'migrations/target');
    await database.db.insert(retentionPolicyRevisions).values(retentionFixture());exchange=createIdentityExchangeService(database.db,exchangeConfig(()=>tick));
    success(await exchange.activatePolicy(0));service=make();success(await service.adult.activatePolicy(0));});
  afterEach(async()=>{await assertTargetDatabase(raw,config);await raw`DROP SCHEMA IF EXISTS content CASCADE`;await raw`DROP SCHEMA IF EXISTS rpg CASCADE`;});
  afterAll(async()=>{await other?.close();await database?.close();await raw?.end({timeout:5});});
  async function launch(user=100) {const r=await exchange.exchangeTelegramIdentity(syntheticInput(tick,String(++sequence),user));success(r);return r;}
  async function family() {const f={...familyFixture(),created_at:at(),updated_at:at()};await database.db.insert(families).values(f);return f;}
  async function parent(f:Awaited<ReturnType<typeof family>>,user=100) {
    const l=await launch(user),p={...profileFixture(f.id,'parent'),created_at:at(),updated_at:at()};await database.db.insert(memberProfiles).values(p);
    const b=bindingFixture(f.id,l.launch.account_id,p.id,'adult_membership');await database.db.insert(accessBindings).values(b);
    const s=await service.adult.beginSetup(l.bearer,{family_id:f.id,binding_id:b.id});success(s);
    const prepared=await service.adult.prepareSetup(s.bearer,{pin:syntheticPin,pin_confirmation:syntheticPin,expected_revision:1});success(prepared);
    success(await service.adult.acknowledgeRecovery(s.bearer,{expected_revision:2,recovery_code:prepared.recovery_code}));
    const fresh=await launch(user),token=await service.adult.login(fresh.bearer,{family_id:f.id,binding_id:b.id,pin:syntheticPin});success(token);
    return {f,b,p,user,token,code:prepared.recovery_code};
  }
  async function child(a:Awaited<ReturnType<typeof parent>>,own=false) {
    const p={...profileFixture(a.f.id,'child'),created_at:at(),updated_at:at()};await database.db.insert(memberProfiles).values(p);
    await database.db.insert(players).values({...playerFixture(a.f.id,p.id),created_at:at()});
    const managed=bindingFixture(a.f.id,a.b.account_id,p.id,'managed_child',a.b.id);await database.db.insert(accessBindings).values(managed);
    if(!own)return {p,managed,own:null};
    const l=await launch(300),b=bindingFixture(a.f.id,l.launch.account_id,p.id,'own_child');await database.db.insert(accessBindings).values(b);
    const token=await service.adult.sessions.issueOwnChild(l.bearer,{family_id:a.f.id,binding_id:b.id});success(token);
    return {p,managed,own:token};
  }
  async function recovery(a:Awaited<ReturnType<typeof parent>>,user=200) {
    const l=await launch(user),r=await service.beginRecovery(l.bearer,{family_id:a.f.id,binding_id:a.b.id});success(r);return r;
  }
  async function authorized(a:Awaited<ReturnType<typeof parent>>,user=200) {
    const r=await recovery(a,user),approved=await service.authorizeRecoveryCode(r.bearer,{expected_revision:1,recovery_code:a.code});success(approved);return {r,approved};
  }
  const finish=(bearer:string,svc=service)=>svc.completeRecovery(bearer,{expected_revision:2,pin:'009876',pin_confirmation:'009876'});
  async function invitation(a:Awaited<ReturnType<typeof parent>>,kind='invite_child',profileId:string|null=null) {
    const r=await service.issueInvitation(a.token.bearer,{kind,profile_id:profileId,pin:syntheticPin,operation_id:newEntityId()});success(r);
    if(!('invite_secret' in r))throw new Error('Missing synthetic invite');return r;
  }
  async function claim(i:Awaited<ReturnType<typeof invitation>>,user=300,svc=service) {
    const l=await launch(user),r=await svc.claimInvitation(l.bearer,{invite_secret:i.invite_secret});success(r);return r;
  }
  async function approve(a:Awaited<ReturnType<typeof parent>>,r:Awaited<ReturnType<typeof claim>>) {
    success(await service.approveInvitation(a.token.bearer,{request_id:r.request.id,expected_revision:r.request.revision,
      candidate_account_id:r.request.candidate_account_id,pin:syntheticPin,operation_id:newEntityId()}));
  }
  it('recovers to a new Account in one family, keeps historical bindings and independent child access',async()=>{
    const f=await family(),a=await parent(f),c=await child(a,true),otherFamily=await family(),outside=await parent(otherFamily);
    const managed=await service.adult.switchMode(a.token.bearer,{pin:syntheticPin,target_mode:'managed_child',target_binding_id:c.managed.id,expected_session_revision:1});success(managed);
    const {r}=await authorized(a),result=await finish(r.bearer);success(result);
    expect((await service.adult.sessions.resolveSession(managed.bearer)).ok).toBe(false);
    success(await service.adult.sessions.resolveSession(c.own!.bearer));success(await service.adult.sessions.resolveSession(outside.token.bearer));
    const old=await database.db.select().from(accessBindings).where(eq(accessBindings.id,a.b.id));expect(old[0].account_id).toBe(a.b.account_id);expect(old[0].status).toBe('revoked');
    const next=await database.db.select().from(accessBindings).where(eq(accessBindings.id,result.binding_id));expect(next[0].profile_id).toBe(a.p.id);expect(next[0].account_id).not.toBe(a.b.account_id);
    expect((await raw`SELECT count(*)::int AS n FROM rpg.players`)[0].n).toBe(1);
    let l=await launch(200);expect((await service.adult.login(l.bearer,{family_id:f.id,binding_id:result.binding_id,pin:'009876'})).ok).toBe(false);
    success(await service.adult.acknowledgeRecovery(r.bearer,{expected_revision:1,recovery_code:result.recovery_code}));
    l=await launch(200);success(await service.adult.login(l.bearer,{family_id:f.id,binding_id:result.binding_id,pin:'009876'}));
  });
  it('does not revive the old code after a lost completion response; setup bearer resumes and rotates',async()=>{
    const a=await parent(await family()),{r}=await authorized(a);const result=await finish(r.bearer);success(result);
    const state=await service.adult.getSetup(r.bearer);success(state);expect(state.setup.state).toBe('awaiting_recovery');
    expect(state.setup.binding_id).toBe(result.binding_id);
    const l=await launch(200);expect((await service.adult.beginSetup(l.bearer,{family_id:a.f.id,binding_id:result.binding_id})).ok).toBe(false);
    const rotated=await service.adult.rotatePendingRecovery(r.bearer,{expected_revision:1});success(rotated);
    success(await service.adult.acknowledgeRecovery(r.bearer,{expected_revision:2,recovery_code:rotated.recovery_code}));
    expect((await finish(r.bearer)).ok).toBe(false);
    expect((await recoveryInvalid(a)).ok).toBe(false);
  });
  async function recoveryInvalid(a:Awaited<ReturnType<typeof parent>>) {const l=await launch(201);return service.beginRecovery(l.bearer,{family_id:a.f.id,binding_id:a.b.id});}
  it('serializes competing recovery requests across pools and consumes only once',async()=>{
    const a=await parent(await family()),one=await authorized(a,200),two=await authorized(a,201);
    const results=await Promise.all([finish(one.r.bearer),finish(two.r.bearer,make(other.db))]);expect(results.filter(r=>r.ok)).toHaveLength(1);
    expect((await raw`SELECT count(*)::int AS n FROM rpg.access_bindings WHERE kind='adult_membership' AND status='active'`)[0].n).toBe(1);
    expect((await raw`SELECT count(*)::int AS n FROM rpg.lifecycle_requests WHERE state='consumed'`)[0].n).toBe(1);
  });
  it('counts malformed code attempts durably without using the PIN limiter',async()=>{
    const a=await parent(await family()),r=await recovery(a);
    for(let n=0;n<10;n++)expect((await (n%2?make(other.db):service).authorizeRecoveryCode(r.bearer,{expected_revision:1,recovery_code:'invalid'})).ok).toBe(false);
    expect((await service.authorizeRecoveryCode(r.bearer,{expected_revision:1,recovery_code:a.code})).ok).toBe(false);
    expect((await raw`SELECT count(*)::int AS n FROM rpg.lifecycle_events WHERE action='code' AND outcome='denied'`)[0].n).toBe(10);
    tick+=600001;expect((await service.authorizeRecoveryCode(r.bearer,{expected_revision:1,recovery_code:a.code})).ok).toBe(false);
    const next=await recovery(a);success(await service.authorizeRecoveryCode(next.bearer,{expected_revision:1,recovery_code:a.code}));
  });
  it('requires an explicit immutable candidate for another adult approval and rejects stale approver',async()=>{
    const f=await family(),a=await parent(f),b=await parent(f,101),r=await recovery(a);
    const req={request_id:r.request.id,expected_revision:1,candidate_account_id:r.request.candidate_account_id,pin:syntheticPin,operation_id:newEntityId()};
    expect((await service.approveRecovery(a.token.bearer,req)).ok).toBe(false);
    expect((await service.approveRecovery(b.token.bearer,{...req,candidate_account_id:newEntityId()})).ok).toBe(false);
    success(await service.approveRecovery(b.token.bearer,req));
    await raw`UPDATE rpg.adult_protections SET credential_revision=2,state_revision=state_revision+1 WHERE binding_id=${b.b.id}`;
    expect((await finish(r.bearer)).ok).toBe(false);
    expect((await database.db.select().from(accessBindings).where(eq(accessBindings.id,a.b.id)))[0].status).toBe('active');
  });
  it('recovers a forgotten PIN under the same verified Account with a second adult approval',async()=>{
    const f=await family(),a=await parent(f),b=await parent(f,101),r=await recovery(a,100);
    success(await service.approveRecovery(b.token.bearer,{request_id:r.request.id,expected_revision:1,candidate_account_id:r.request.candidate_account_id,pin:syntheticPin,operation_id:newEntityId()}));
    success(await finish(r.bearer));
    expect((await raw`SELECT count(*)::int AS n FROM rpg.accounts`)[0].n).toBe(2);
  });
  it('links an existing child once and preserves its Player and managed binding',async()=>{
    const a=await parent(await family()),c=await child(a),i=await invitation(a,'invite_child',c.p.id),r=await claim(i);
    expect((await service.consumeInvitation(r.bearer,{expected_revision:2,display_name:'Child'})).ok).toBe(false);
    await approve(a,r);const result=await service.consumeInvitation(r.bearer,{expected_revision:3,display_name:'Child'});success(result);
    success(await service.consumeInvitation(r.bearer,{expected_revision:3,display_name:'Child'}));
    const l=await launch(300);success(await service.adult.sessions.issueOwnChild(l.bearer,{family_id:a.f.id,binding_id:result.binding_id}));
    expect((await raw`SELECT count(*)::int AS n FROM rpg.players`)[0].n).toBe(1);
    expect((await database.db.select().from(accessBindings).where(eq(accessBindings.id,c.managed.id)))[0].status).toBe('active');
  });
  it('adds an adult exactly once, with no adult rights before independent PIN setup',async()=>{
    const a=await parent(await family()),i=await invitation(a,'invite_adult'),r=await claim(i,301);await approve(a,r);
    const results=await Promise.all([service.consumeInvitation(r.bearer,{expected_revision:3,display_name:'New adult'}),make(other.db).consumeInvitation(r.bearer,{expected_revision:3,display_name:'New adult'})]);
    results.forEach(success);expect(results[0]).toEqual(results[1]);
    expect((await raw`SELECT count(*)::int AS n FROM rpg.member_profiles WHERE family_role='parent'`)[0].n).toBe(2);
    const l=await launch(301),b=results[0];success(b);
    expect((await service.adult.login(l.bearer,{family_id:a.f.id,binding_id:b.binding_id,pin:syntheticPin})).ok).toBe(false);
    success(await service.adult.beginSetup(l.bearer,{family_id:a.f.id,binding_id:b.binding_id}));
  });
  it('prevents candidate substitution and lets the same candidate replace a lost claim response',async()=>{
    const a=await parent(await family()),i=await invitation(a,'invite_adult'),r=await claim(i,301);
    const l=await launch(302);expect((await service.claimInvitation(l.bearer,{invite_secret:i.invite_secret})).ok).toBe(false);
    const again=await claim(i,301);expect(again.request.candidate_account_id).toBe(r.request.candidate_account_id);
    expect((await service.getRequest(r.bearer)).ok).toBe(false);success(await service.getRequest(again.bearer));
  });
  it('requires target consent for exclusion and keeps independent child access after departure',async()=>{
    const f=await family(),a=await parent(f),b=await parent(f,101),c=await child(b,true);
    const r=await service.requestExclusion(a.token.bearer,{pin:syntheticPin,target_binding_id:b.b.id,expected_revision:1,operation_id:newEntityId()});success(r);
    if(!r.request)throw new Error('Missing synthetic request');
    const req={pin:syntheticPin,request_id:r.request.id,expected_revision:1,operation_id:newEntityId()};
    expect((await service.consentExclusion(a.token.bearer,req)).ok).toBe(false);
    success(await service.consentExclusion(b.token.bearer,req));
    expect((await service.adult.sessions.resolveSession(b.token.bearer)).ok).toBe(false);success(await service.adult.sessions.resolveSession(c.own!.bearer));
    expect((await database.db.select().from(memberProfiles).where(eq(memberProfiles.id,b.p.id)))[0].status).toBe('left');
    expect((await recoveryInvalid(b)).ok).toBe(false);
  });
  it('protects the last eligible adult, serializes simultaneous departures and invalidates issuer requests',async()=>{
    const f=await family(),a=await parent(f);
    expect((await service.leaveFamily(a.token.bearer,{pin:syntheticPin,expected_binding_revision:1,operation_id:newEntityId()})).ok).toBe(false);
    const b=await parent(f,101),i=await invitation(a,'invite_adult');
    const results=await Promise.all([service.leaveFamily(a.token.bearer,{pin:syntheticPin,expected_binding_revision:1,operation_id:newEntityId()}),
      make(other.db).leaveFamily(b.token.bearer,{pin:syntheticPin,expected_binding_revision:1,operation_id:newEntityId()})]);
    expect(results.filter(r=>r.ok)).toHaveLength(1);
    expect((await raw`SELECT count(*)::int AS n FROM rpg.access_bindings WHERE kind='adult_membership' AND status='active'`)[0].n).toBe(1);
    if(results[0].ok) {const l=await launch(400);expect((await service.claimInvitation(l.bearer,{invite_secret:i.invite_secret})).ok).toBe(false);}
  });
  it('matches the additive generated schema and contains no raw PIN, code, or bearer in requests/events',async()=>{
    const before=generateDrizzleJson(adultSchema),generated=await generateMigration(before,generateDrizzleJson(targetSchema,before.id));
    expect(await readFile('migrations/target/0006_access_lifecycle.sql','utf8')).toBe('-- G03-F: generated target recovery/invitation/lifecycle schema.\n'+[...lifecycleScopeIndexes,...generated].join('\n\n')+'\n');
    const a=await parent(await family()),{r}=await authorized(a);
    const data=JSON.stringify([await database.db.select().from(lifecycleRequests),await database.db.select().from(lifecycleEvents)]);
    for(const secret of [a.code,r.bearer,syntheticPin])expect(data).not.toContain(secret);
    expect(JSON.stringify(r)).not.toContain(r.bearer);
  });
  it('requires a new trustworthy basis without a code or another adult, even during a PIN attack',async()=>{
    const a=await parent(await family()),r=await recovery(a);
    for(let i=0;i<5;i++){const l=await launch();expect((await service.adult.login(l.bearer,{family_id:a.f.id,binding_id:a.b.id,pin:'999999'})).ok).toBe(false);}
    expect((await service.completeRecovery(r.bearer,{expected_revision:1,pin:'009876',pin_confirmation:'009876'})).ok).toBe(false);
    expect((await service.authorizeRecoveryCode(r.bearer,{expected_revision:1,recovery_code:'family name'})).ok).toBe(false);
    success(await service.authorizeRecoveryCode(r.bearer,{expected_revision:1,recovery_code:a.code}));success(await finish(r.bearer));
  });
  it('binds code approval to the exact credential, not a replacement with the same revision',async()=>{
    const a=await parent(await family()),{r}=await authorized(a);
    await raw`UPDATE rpg.adult_recovery_credentials SET revoked_at=created_at,state_revision=state_revision+1 WHERE binding_id=${a.b.id}`;
    expect((await finish(r.bearer)).ok).toBe(false);
    success(await service.adult.sessions.resolveSession(a.token.bearer));
  });
  it('rolls back recovery revocations, replacement binding and code on setup insertion failure',async()=>{
    const a=await parent(await family()),{r}=await authorized(a);
    await raw`CREATE FUNCTION rpg.reject_new_setup() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic setup failure'; END $$`;
    await raw`CREATE TRIGGER reject_new_setup BEFORE INSERT ON rpg.adult_setups FOR EACH ROW EXECUTE FUNCTION rpg.reject_new_setup()`;
    expect((await finish(r.bearer)).ok).toBe(false);success(await service.adult.sessions.resolveSession(a.token.bearer));
    expect((await raw`SELECT count(*)::int AS n FROM rpg.access_bindings WHERE status='revoked'`)[0].n).toBe(0);
    expect((await raw`SELECT count(*)::int AS n FROM rpg.adult_recovery_credentials WHERE revoked_at IS NULL`)[0].n).toBe(1);
    const status=await service.getRequest(r.bearer);success(status);expect(status.request.state).toBe('approved');
    await raw`DROP TRIGGER reject_new_setup ON rpg.adult_setups`;await raw`DROP FUNCTION rpg.reject_new_setup()`;
    success(await finish(r.bearer));
  });
  it('rejects changed candidate identity and target profile before completing recovery',async()=>{
    const a=await parent(await family()),{r}=await authorized(a);
    await raw`UPDATE rpg.member_profiles SET state_revision=2 WHERE id=${a.p.id}`;
    expect((await finish(r.bearer)).ok).toBe(false);
    const fresh=await authorized(a,201);
    await raw`UPDATE rpg.external_identities SET revoked_at=created_at,state_revision=state_revision+1 WHERE account_id=${fresh.r.request.candidate_account_id}`;
    expect((await finish(fresh.r.bearer)).ok).toBe(false);
  });
  it('revalidates recovery after KDF without holding the family lock and blocks policy cutover',async()=>{
    const a=await parent(await family()),{r}=await authorized(a);
    let entered!:()=>void,release!:()=>void;const started=new Promise<void>(resolve=>entered=resolve),gate=new Promise<void>(resolve=>release=resolve);
    const kdf=createPinKdf(syntheticPepper()),slow=make(other.db,{derivePin:async(pin,salt)=>{entered();await gate;return kdf.derive(pin,salt);}});
    const pending=finish(r.bearer,slow);await started;
    try {
      success(await service.inspectRequest(a.token.bearer,{request_id:r.request.id}));
      tick++;const cfg=adultConfig(()=>tick),changed=createAccessLifecycleService(database.db,exchange,{...cfg,family:{...cfg.family,policyRevision:2}},syntheticPepper());
      success(await changed.adult.activatePolicy(1));
    }finally{release();}
    expect((await pending).ok).toBe(false);
    expect((await database.db.select().from(accessBindings).where(eq(accessBindings.id,a.b.id)))[0].status).toBe('active');
  });
  it('lets an approver withdraw a request and rejects foreign-family review and approval',async()=>{
    const f=await family(),a=await parent(f),b=await parent(f,101),foreign=await parent(await family(),102),r=await recovery(a);
    const review=await service.inspectRequest(b.token.bearer,{request_id:r.request.id});success(review);expect(review.candidate?.subject).toBe('200');
    expect((await service.inspectRequest(foreign.token.bearer,{request_id:r.request.id})).ok).toBe(false);
    const req={request_id:r.request.id,expected_revision:1,candidate_account_id:r.request.candidate_account_id,pin:syntheticPin,operation_id:newEntityId()};
    expect((await service.approveRecovery(foreign.token.bearer,req)).ok).toBe(false);success(await service.approveRecovery(b.token.bearer,req));
    success(await service.cancelRequest(b.token.bearer,{request_id:r.request.id,expected_revision:2,pin:syntheticPin,operation_id:newEntityId()}));
    expect((await finish(r.bearer)).ok).toBe(false);
  });
  it('expires invitations at the boundary and invalidates archived or revised child targets',async()=>{
    const a=await parent(await family()),c=await child(a),i=await invitation(a,'invite_child',c.p.id),r=await claim(i);await approve(a,r);
    await raw`UPDATE rpg.member_profiles SET state_revision=2 WHERE id=${c.p.id}`;
    expect((await service.consumeInvitation(r.bearer,{expected_revision:3,display_name:'Child'})).ok).toBe(false);
    const i2=await invitation(a,'invite_child',c.p.id),r2=await claim(i2,301);await approve(a,r2);
    await raw`UPDATE rpg.member_profiles SET status='archived',archived_at=created_at,state_revision=state_revision+1 WHERE id=${c.p.id}`;
    expect((await service.consumeInvitation(r2.bearer,{expected_revision:3,display_name:'Child'})).ok).toBe(false);
    const i3=await invitation(a,'invite_adult');tick+=600000;
    const l=await launch(302);expect((await service.claimInvitation(l.bearer,{invite_secret:i3.invite_secret})).ok).toBe(false);
  });
  it('permits only one candidate in a race and rejects a stale approval revision',async()=>{
    const a=await parent(await family()),i=await invitation(a,'invite_adult'),l1=await launch(301),l2=await launch(302);
    const results=await Promise.all([service.claimInvitation(l1.bearer,{invite_secret:i.invite_secret}),make(other.db).claimInvitation(l2.bearer,{invite_secret:i.invite_secret})]);
    expect(results.filter(r=>r.ok)).toHaveLength(1);const r=results.find(r=>r.ok)!;success(r);
    expect((await service.approveInvitation(a.token.bearer,{request_id:r.request.id,expected_revision:1,candidate_account_id:r.request.candidate_account_id,pin:syntheticPin,operation_id:newEntityId()})).ok).toBe(false);
    const approval={request_id:r.request.id,expected_revision:2,candidate_account_id:r.request.candidate_account_id,pin:syntheticPin,operation_id:newEntityId()};
    const approvals=await Promise.all([service.approveInvitation(a.token.bearer,approval),make(other.db).approveInvitation(a.token.bearer,approval)]);
    approvals.forEach(success);
    expect((await raw`SELECT count(*)::int AS n FROM rpg.lifecycle_events WHERE action='approve'`)[0].n).toBe(1);
  });
  it('allows either equal adult to review the candidate but commits only one competing approval',async()=>{
    const f=await family(),a=await parent(f),b=await parent(f,101),i=await invitation(a,'invite_adult'),r=await claim(i,301);
    const review=await service.inspectRequest(b.token.bearer,{request_id:r.request.id});success(review);expect(review.candidate?.subject).toBe('301');
    const req={request_id:r.request.id,expected_revision:2,candidate_account_id:r.request.candidate_account_id,pin:syntheticPin};
    const results=await Promise.all([service.approveInvitation(a.token.bearer,{...req,operation_id:newEntityId()}),make(other.db).approveInvitation(b.token.bearer,{...req,operation_id:newEntityId()})]);
    expect(results.filter(x=>x.ok)).toHaveLength(1);
    success(await service.consumeInvitation(r.bearer,{expected_revision:3,display_name:'Adult'}));
    expect((await raw`SELECT count(*)::int AS n FROM rpg.lifecycle_events WHERE action='approve'`)[0].n).toBe(1);
  });
  it('rolls back a new invited profile on audit failure and resumes the same consumption',async()=>{
    const a=await parent(await family()),i=await invitation(a,'invite_adult'),r=await claim(i,301);await approve(a,r);
    await raw`CREATE FUNCTION rpg.reject_consume_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='consume' THEN RAISE EXCEPTION 'synthetic audit failure'; END IF; RETURN NEW; END $$`;
    await raw`CREATE TRIGGER reject_consume_audit BEFORE INSERT ON rpg.lifecycle_events FOR EACH ROW EXECUTE FUNCTION rpg.reject_consume_audit()`;
    expect((await service.consumeInvitation(r.bearer,{expected_revision:3,display_name:'Adult'})).ok).toBe(false);
    expect((await raw`SELECT count(*)::int AS n FROM rpg.member_profiles WHERE family_role='parent'`)[0].n).toBe(1);
    await raw`DROP TRIGGER reject_consume_audit ON rpg.lifecycle_events`;await raw`DROP FUNCTION rpg.reject_consume_audit()`;
    success(await make(other.db).consumeInvitation(r.bearer,{expected_revision:3,display_name:'Adult'}));
  });
  it('invalidates unfinished invitations and recovery approvals when their adult leaves',async()=>{
    const f=await family(),a=await parent(f),b=await parent(f,101),r=await recovery(a),i=await invitation(b,'invite_adult'),claimed=await claim(i,302);
    success(await service.approveRecovery(b.token.bearer,{request_id:r.request.id,expected_revision:1,candidate_account_id:r.request.candidate_account_id,pin:syntheticPin,operation_id:newEntityId()}));
    await approve(b,claimed);
    const op=newEntityId();success(await service.leaveFamily(b.token.bearer,{pin:syntheticPin,expected_binding_revision:1,operation_id:op}));
    expect((await finish(r.bearer)).ok).toBe(false);expect((await service.consumeInvitation(claimed.bearer,{expected_revision:3,display_name:'Adult'})).ok).toBe(false);
    const fresh=await launch(101);success(await service.getOperation(fresh.bearer,{operation_id:op}));
    const stranger=await launch(999);expect((await service.getOperation(stranger.bearer,{operation_id:op})).ok).toBe(false);
  });
  it('does not count pending or disabled successors as eligible management',async()=>{
    const f=await family(),a=await parent(f),b=await parent(f,101);
    await raw`UPDATE rpg.accounts SET status='disabled',disabled_at=created_at,state_revision=state_revision+1 WHERE id=${b.b.account_id}`;
    expect((await service.leaveFamily(a.token.bearer,{pin:syntheticPin,expected_binding_revision:1,operation_id:newEntityId()})).ok).toBe(false);
    await raw`UPDATE rpg.accounts SET status='active',disabled_at=NULL,state_revision=state_revision+1 WHERE id=${b.b.account_id}`;
    await raw`UPDATE rpg.adult_protections SET status='pending',recovery_ack_at=NULL,state_revision=state_revision+1 WHERE binding_id=${b.b.id}`;
    expect((await service.leaveFamily(a.token.bearer,{pin:syntheticPin,expected_binding_revision:1,operation_id:newEntityId()})).ok).toBe(false);
  });
  it('revokes every adult lineage with shared pair quota while preserving membership and own-child access',async()=>{
    const f=await family(),a=await parent(f),b=await parent(f,101),c=await child(b,true);
    const l=await launch(101),second=await service.adult.login(l.bearer,{family_id:f.id,binding_id:b.b.id,pin:syntheticPin});success(second);
    const managed=await service.adult.switchMode(second.bearer,{pin:syntheticPin,target_mode:'managed_child',target_binding_id:c.managed.id,expected_session_revision:1});success(managed);
    const req={pin:syntheticPin,target_binding_id:b.b.id,expected_revision:1,operation_id:newEntityId()};
    success(await service.revokeAdultSessions(a.token.bearer,req));success(await make(other.db).revokeAdultSessions(a.token.bearer,req));
    expect((await service.adult.sessions.resolveSession(b.token.bearer)).ok).toBe(false);expect((await service.adult.sessions.resolveSession(managed.bearer)).ok).toBe(false);
    success(await service.adult.sessions.resolveSession(c.own!.bearer));
    const fresh=await launch(101),again=await service.adult.login(fresh.bearer,{family_id:f.id,binding_id:b.b.id,pin:syntheticPin});success(again);
    expect((await service.revokeAdultSessions(a.token.bearer,{...req,operation_id:newEntityId()})).ok).toBe(false);
    const op=newEntityId(),proof=await service.adult.confirmAction(a.token.bearer,{pin:syntheticPin,action:'revoke_session',target_id:again.session.id,expected_revision:1,operation_id:op});success(proof);
    expect((await service.adult.sessions.revokeSession(a.token.bearer,{session_id:again.session.id,expected_revision:1},{operation_id:op,proof_bearer:proof.proof_bearer})).ok).toBe(false);
    expect((await database.db.select().from(accessBindings).where(eq(accessBindings.id,b.b.id)))[0].status).toBe('active');
  });
  it('serializes a family command before departure and rejects every command after its commit',async()=>{
    const f=await family(),a=await parent(f);await parent(f,101);
    let entered!:()=>void,release!:()=>void;const started=new Promise<void>(resolve=>entered=resolve),gate=new Promise<void>(resolve=>release=resolve);
    const command=service.adult.sessions.withFamilyAccess(a.token.bearer,{action:'family.manage',family_id:f.id,profile_id:null},async(tx)=>{
      entered();await gate;await tx.execute(sql`UPDATE rpg.families SET display_name='Committed before departure' WHERE id=${f.id}`);return true;
    });
    await started;const departure=make(other.db).leaveFamily(a.token.bearer,{pin:syntheticPin,expected_binding_revision:1,operation_id:newEntityId()});
    release();success(await command);success(await departure);
    let called=false;expect((await service.adult.sessions.withFamilyAccess(a.token.bearer,{action:'family.manage',family_id:f.id,profile_id:null},async()=>{called=true;return true;})).ok).toBe(false);
    expect(called).toBe(false);expect((await database.db.select().from(families).where(eq(families.id,f.id)))[0].display_name).toBe('Committed before departure');
  });
  it('recovers a credential after pepper rotation without needing the unavailable old PIN key',async()=>{
    const a=await parent(await family());tick++;
    const cfg=adultConfig(()=>tick),changed=createAccessLifecycleService(other.db,exchange,{...cfg,pepperKeyId:'rotated_fixture',family:{...cfg.family,policyRevision:2}},new Uint8Array(32).fill(9));
    success(await changed.adult.activatePolicy(1));const l=await launch(200);
    const r=await changed.beginRecovery(l.bearer,{family_id:a.f.id,binding_id:a.b.id});success(r);
    success(await changed.authorizeRecoveryCode(r.bearer,{expected_revision:1,recovery_code:a.code}));
    const result=await finish(r.bearer,changed);success(result);
    success(await changed.adult.acknowledgeRecovery(r.bearer,{expected_revision:1,recovery_code:result.recovery_code}));
    const fresh=await launch(200);success(await changed.adult.login(fresh.bearer,{family_id:a.f.id,binding_id:result.binding_id,pin:'009876'}));
    expect((await service.adult.getSetup(r.bearer)).ok).toBe(false);
  });
  it('fails closed on an older protocol digest until an explicitly newer family policy is activated',async()=>{
    const a=await parent(await family()),l=await launch(200);
    await raw`UPDATE rpg.family_security_policy SET security_digest=${'ab'.repeat(32)}`;
    expect((await service.beginRecovery(l.bearer,{family_id:a.f.id,binding_id:a.b.id})).ok).toBe(false);
    expect((await service.adult.activatePolicy(1)).ok).toBe(false);
    tick++;const cfg=adultConfig(()=>tick),changed=createAccessLifecycleService(other.db,exchange,{...cfg,family:{...cfg.family,policyRevision:2}},syntheticPepper());
    success(await changed.adult.activatePolicy(1));success(await changed.beginRecovery(l.bearer,{family_id:a.f.id,binding_id:a.b.id}));
  });
  it('round-trips closed records, matches live catalog and rejects cross-family and NULL SQL substitutions',async()=>{
    for(const table of lifecycleTables){const cfg=getTableConfig(table);
      const columns=await raw`SELECT a.attname AS name,format_type(a.atttypid,a.atttypmod) AS type,a.attnotnull AS required FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='rpg' AND c.relname=${cfg.name} AND a.attnum>0 AND NOT a.attisdropped ORDER BY a.attnum`;
      expect(columns.map(c=>[c.name,c.type,c.required])).toEqual(cfg.columns.map(c=>[c.name,c.getSQLType().replace(' COLLATE "C"',''),c.notNull]));
      const constraints=await raw`SELECT conname AS name FROM pg_constraint WHERE conrelid=${'rpg.'+cfg.name}::regclass AND contype<>'n'`;
      expect(constraints.map(c=>c.name).sort()).toEqual([...cfg.checks.map(c=>c.name),...cfg.uniqueConstraints.map(c=>c.getName()),...cfg.foreignKeys.map(c=>c.getName()),cfg.name+'_pkey'].sort());
    }
    const a=await parent(await family()),b=await parent(await family(),101),{r}=await authorized(a);
    for(const row of await database.db.select().from(lifecycleRequests))expect(lifecycleRecordToDto('request',row).id).toBe(row.id);
    for(const row of await database.db.select().from(lifecycleEvents))expect(lifecycleRecordToDto('event',row).id).toBe(row.id);
    await expect(raw`UPDATE rpg.lifecycle_requests SET family_id=${b.f.id} WHERE id=${r.request.id}`).rejects.toMatchObject({code:'23503'});
    await expect(raw`UPDATE rpg.lifecycle_requests SET candidate_account_id=NULL WHERE id=${r.request.id}`).rejects.toMatchObject({code:'23514'});
    await expect(raw`UPDATE rpg.lifecycle_requests SET target_profile_id=${b.p.id} WHERE id=${r.request.id}`).rejects.toMatchObject({code:'23503'});
    await expect(raw`UPDATE rpg.lifecycle_requests SET basis_credential_id=NULL WHERE id=${r.request.id}`).rejects.toMatchObject({code:'23514'});
    await expect(raw`UPDATE rpg.lifecycle_requests SET state='consumed',closed_at=created_at WHERE id=${r.request.id}`).rejects.toMatchObject({code:'23514'});
  });
  it('rolls back sixth migration and its journal without modifying earlier migrations',async()=>{
    await raw`DROP SCHEMA IF EXISTS content CASCADE`;await raw`DROP SCHEMA IF EXISTS rpg CASCADE`;
    const directory=await mkdtemp(path.join(tmpdir(),'family-rpg-g03-f-'));
    try {
      const entries=[];for(const [i,m]of(await loadMigrations('migrations/target')).entries()){
        const source=m.sql+(i===5?'\nSELECT 1/0;':'');await writeFile(path.join(directory,m.name),source);entries.push({name:m.name,sha256:createHash('sha256').update(source).digest('hex')});
      }
      await writeFile(path.join(directory,'manifest.json'),JSON.stringify({schema_version:1,migrations:entries}));
      await expect(runTargetMigrations(raw,config,directory)).rejects.toMatchObject({code:'22012'});
      expect((await raw`SELECT count(*)::int AS n FROM rpg.__target_migrations`)[0].n).toBe(5);
      expect((await raw`SELECT to_regclass('rpg.lifecycle_requests') AS t`)[0].t).toBeNull();
      expect(await runTargetMigrations(raw,config,'migrations/target')).toBe(1);
    }finally{await rm(directory,{recursive:true,force:true});}
  });
});
