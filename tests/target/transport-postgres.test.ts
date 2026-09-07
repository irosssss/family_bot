import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { readTargetConfig } from '../../src/target/config';
import { assertTargetDatabase, createTargetClient } from '../../src/target/db/client';
import { openTargetDatabase } from '../../src/target/db/database';
import { runTargetMigrations } from '../../src/target/db/migrator';
import { families, memberProfiles, players, retentionPolicyRevisions } from '../../src/target/db/schema/foundation';
import { accessBindings } from '../../src/target/db/schema/familyAccess';
import { createIdentityExchangeService } from '../../src/target/access/identityExchange';
import { createAccessLifecycleService } from '../../src/target/access/accessLifecycle';
import { createPinKdf } from '../../src/target/access/adultCrypto';
import type { AdultDependencies } from '../../src/target/access/adultAccess';
import { newEntityId } from '../../src/target/contracts/ids';
import { assertOwnedContainer } from '../../scripts/target/test-environment';
import { startTargetAccessServer, closedBootstrapGate } from '../../src/target/transport/http';
import type { Credential } from '../../src/target/transport/routes';
import { familyFixture, profileFixture, playerFixture, retentionFixture } from './foundation-fixtures';
import { exchangeConfig, startMs, syntheticInput } from './identity-exchange-fixtures';
import { at, bindingFixture } from './family-access-fixtures';
import { adultConfig, syntheticPepper, syntheticPin } from './adult-fixtures';

type Server = Awaited<ReturnType<typeof startTargetAccessServer>>;
// HTTP JSON is intentionally decoded at the client boundary, independently of service types.
type Json = Record<string, any>;
describe.skipIf(process.env.RPG_TARGET_PG_TESTS !== '1')('G03-G synthetic HTTP e2e in owned PostgreSQL',()=>{
  let config:ReturnType<typeof readTargetConfig>,raw:ReturnType<typeof createTargetClient>;
  let database:Awaited<ReturnType<typeof openTargetDatabase>>,other:typeof database;
  let tick:number,sequence:number,server:Server,servers:Server[];
  let exchange:ReturnType<typeof createIdentityExchangeService>,lifecycle:ReturnType<typeof createAccessLifecycleService>;
  const audits: unknown[]=[];
  async function makeServer(db=database.db,deps:AdultDependencies={}) {
    const e=createIdentityExchangeService(db,exchangeConfig(()=>tick));
    const l=createAccessLifecycleService(db,e,adultConfig(()=>tick),syntheticPepper(),deps);
    const result=await startTargetAccessServer({exchange:e,lifecycle:l},{bootstrapGate:closedBootstrapGate,audit:event=>audits.push(event)});
    servers.push(result);return result;
  }
  beforeAll(async()=>{
    config=readTargetConfig(process.env);await assertOwnedContainer({id:process.env.RPG_TARGET_CONTAINER_ID??'',runId:config.runId});
    raw=createTargetClient(config);await assertTargetDatabase(raw,config);database=await openTargetDatabase(config);other=await openTargetDatabase(config);
  });
  beforeEach(async()=>{
    tick=startMs;sequence=0;servers=[];audits.length=0;await runTargetMigrations(raw,config,'migrations/target');
    await database.db.insert(retentionPolicyRevisions).values(retentionFixture());
    exchange=createIdentityExchangeService(database.db,exchangeConfig(()=>tick));expect((await exchange.activatePolicy(0)).ok).toBe(true);
    lifecycle=createAccessLifecycleService(database.db,exchange,adultConfig(()=>tick),syntheticPepper());
    expect((await lifecycle.adult.activatePolicy(0)).ok).toBe(true);server=await makeServer();
  });
  afterEach(async()=>{
    for(const s of servers)if(s.server.listening)await s.close();
    await assertTargetDatabase(raw,config);await raw`DROP SCHEMA IF EXISTS content CASCADE`;await raw`DROP SCHEMA IF EXISTS rpg CASCADE`;
  });
  afterAll(async()=>{await other?.close();await database?.close();await raw?.end({timeout:5});});
  async function call(path:string,body:Json={},credential:Credential='none',bearer?:string,target=server) {
    const r=await fetch(`${target.origin}/access/v1/${path}`,{method:'POST',headers:{Origin:target.origin,'Content-Type':'application/json',
      'X-RPG-Credential':credential,...(bearer?{Authorization:`Bearer ${bearer}`}:{})},body:JSON.stringify(body)});
    expect(r.headers.get('cache-control')).toBe('no-store');expect(r.headers.get('etag')).toBeNull();
    const json:Json=await r.json();return {status:r.status,json};
  }
  async function pass(path:string,body:Json={},credential:Credential='none',bearer?:string,target=server):Promise<Json> {
    const r=await call(path,body,credential,bearer,target);expect(r.status,r.json.error_key).toBe(200);expect(r.json.ok).toBe(true);return r.json;
  }
  async function deny(path:string,body:Json={},credential:Credential='none',bearer?:string,target=server) {
    const r=await call(path,body,credential,bearer,target);expect(r.status).toBeGreaterThanOrEqual(400);expect(r.json.ok).toBe(false);return r;
  }
  const launch=(user=100,target=server)=>pass('identity/exchange',{init_data:syntheticInput(tick,String(++sequence),user)},'none',undefined,target);
  async function family() {const f={...familyFixture(),created_at:at(),updated_at:at()};await database.db.insert(families).values(f);return f;}
  async function parent(f:Awaited<ReturnType<typeof family>>,user=100,active=true) {
    const l=await launch(user),p={...profileFixture(f.id,'parent'),created_at:at(),updated_at:at()};await database.db.insert(memberProfiles).values(p);
    const b=bindingFixture(f.id,l.launch.account_id,p.id,'adult_membership');await database.db.insert(accessBindings).values(b);
    const setup=await pass('setup/begin',{family_id:f.id,binding_id:b.id},'launch',l.bearer);
    const prepared=await pass('setup/prepare',{pin:syntheticPin,pin_confirmation:syntheticPin,expected_revision:1},'setup',setup.bearer);
    if(!active)return {f,p,b,user,setup,code:prepared.recovery_code,token:null as Json|null};
    await pass('setup/acknowledge',{expected_revision:2,recovery_code:prepared.recovery_code},'setup',setup.bearer);
    const fresh=await launch(user),token=await pass('session/login',{family_id:f.id,binding_id:b.id,pin:syntheticPin},'launch',fresh.bearer);
    return {f,p,b,user,setup,code:prepared.recovery_code,token};
  }
  async function child(a:Awaited<ReturnType<typeof parent>>,own=false) {
    const p={...profileFixture(a.f.id,'child'),created_at:at(),updated_at:at()};await database.db.insert(memberProfiles).values(p);
    const player={...playerFixture(a.f.id,p.id),created_at:at()};await database.db.insert(players).values(player);
    const managed=bindingFixture(a.f.id,a.b.account_id,p.id,'managed_child',a.b.id);await database.db.insert(accessBindings).values(managed);
    if(!own)return {p,player,managed,own:null as Json|null,ownBinding:null as ReturnType<typeof bindingFixture>|null};
    const l=await launch(300),b=bindingFixture(a.f.id,l.launch.account_id,p.id,'own_child');await database.db.insert(accessBindings).values(b);
    const token=await pass('session/own-child',{family_id:a.f.id,binding_id:b.id},'launch',l.bearer);
    return {p,player,managed,own:token,ownBinding:b};
  }
  async function invite(a:Awaited<ReturnType<typeof parent>>,kind='invite_adult',profileId:string|null=null) {
    return pass('invitation/issue',{kind,profile_id:profileId,pin:syntheticPin,operation_id:newEntityId()},'session',a.token!.bearer);
  }
  async function claim(i:Json,user=300) {const l=await launch(user);return pass('invitation/claim',{invite_secret:i.invite_secret},'launch',l.bearer);}
  async function approve(a:Awaited<ReturnType<typeof parent>>,r:Json) {
    await pass('invitation/approve',{request_id:r.request.id,expected_revision:r.request.revision,candidate_account_id:r.request.candidate_account_id,
      pin:syntheticPin,operation_id:newEntityId()},'session',a.token!.bearer);
    return pass('lifecycle/read',{},'candidate',r.bearer);
  }
  async function recovery(a:Awaited<ReturnType<typeof parent>>,user=200) {
    const l=await launch(user);return pass('recovery/begin',{family_id:a.f.id,binding_id:a.b.id},'launch',l.bearer);
  }
  const complete=(r:Json)=>pass('recovery/complete',{expected_revision:2,pin:'009876',pin_confirmation:'009876'},'candidate',r.bearer);

  it('exchanges a signed independent identity once, rejects invalid signatures, and keeps bootstrap closed',async()=>{
    const input=syntheticInput(tick,'independent-http',100);
    const first=await pass('identity/exchange',{init_data:input});
    expect(Object.keys(first).sort()).toEqual(['bearer','launch','ok']);
    expect((await deny('identity/exchange',{init_data:input})).status).toBe(409);
    await deny('identity/exchange',{init_data:input.replace('hash=','hash=bad')});
    const closed=await deny('family/bootstrap',{},'launch',first.bearer);expect(closed.status).toBe(503);
    await deny('family/bootstrap',{consent:true},'launch',first.bearer);
    expect((await raw`SELECT count(*)::int AS n FROM rpg.families`)[0].n).toBe(0);
    expect((await raw`SELECT count(*)::int AS n FROM rpg.accounts`)[0].n).toBe(1);
  });
  it('requires recovery acknowledgement before login and repairs a lost setup response after restart',async()=>{
    const a=await parent(await family(),100,false),l=await launch();
    await deny('session/login',{family_id:a.f.id,binding_id:a.b.id,pin:syntheticPin},'launch',l.bearer);
    await deny('session/read',{},'session',a.setup.bearer);
    server=await makeServer(other.db);
    const state=await pass('setup/read',{},'setup',a.setup.bearer);expect(state.setup.revision).toBe(2);
    const replacement=await pass('setup/rotate-recovery',{expected_revision:2},'setup',a.setup.bearer);
    await deny('setup/acknowledge',{expected_revision:3,recovery_code:a.code},'setup',a.setup.bearer);
    await pass('setup/acknowledge',{expected_revision:3,recovery_code:replacement.recovery_code},'setup',a.setup.bearer);
    await deny('setup/read',{},'setup',a.setup.bearer);
    await deny('session/login',{family_id:a.f.id,binding_id:a.b.id,pin:'999999'},'launch',l.bearer);
    const token=await pass('session/login',{family_id:a.f.id,binding_id:a.b.id,pin:syntheticPin},'launch',l.bearer);
    const state2=await pass('session/read',{},'session',token.bearer);
    expect(state2.actor.mode).toBe('adult');expect(JSON.stringify(state2)).not.toMatch(/verifier|protection|account_id|pin/);
  });
  it('both child HTTP logins reach one Player, switching retires the bearer, and family/profile guards reject other scopes',async()=>{
    const a=await parent(await family()),c=await child(a,true),otherChild=await child(a),foreign=await family();
    const managed=await pass('session/switch',{pin:syntheticPin,target_mode:'managed_child',target_binding_id:c.managed.id,expected_session_revision:1},'session',a.token!.bearer);
    await deny('session/read',{},'session',a.token!.bearer);
    for(const b of [managed.bearer,c.own!.bearer]) {
      const profile=await pass('profile/read',{family_id:a.f.id,profile_id:c.p.id},'session',b);
      expect(profile.value.player_id).toBe(c.player.id);
      await deny('profile/read',{family_id:foreign.id,profile_id:c.p.id},'session',b);
      await deny('profile/read',{family_id:a.f.id,profile_id:otherChild.p.id},'session',b);
      await deny('invitation/issue',{kind:'invite_adult',profile_id:null,pin:syntheticPin,operation_id:newEntityId()},'session',b);
    }
    await deny('session/switch',{pin:syntheticPin,target_mode:'adult',target_binding_id:a.b.id,expected_session_revision:1},'session',c.own!.bearer);
    const adult=await pass('session/switch',{pin:syntheticPin,target_mode:'adult',target_binding_id:a.b.id,expected_session_revision:1},'session',managed.bearer);
    await deny('session/read',{},'session',managed.bearer);await pass('session/read',{},'session',adult.bearer);
    expect((await raw`SELECT count(*)::int AS n FROM rpg.players WHERE profile_id=${c.p.id}`)[0].n).toBe(1);
  });
  it('managed access survives short adult expiry but ends on adult revoke; independent child remains valid',async()=>{
    const f=await family(),a=await parent(f),c=await child(a,true),b=await parent(f,101);
    const managed=await pass('session/switch',{pin:syntheticPin,target_mode:'managed_child',target_binding_id:c.managed.id,expected_session_revision:1},'session',a.token!.bearer);
    tick+=301000;await pass('session/read',{},'session',managed.bearer);await deny('session/read',{},'session',b.token!.bearer);
    const l=await launch(101),fresh=await pass('session/login',{family_id:f.id,binding_id:b.b.id,pin:syntheticPin},'launch',l.bearer);
    const op=newEntityId(),body={target_binding_id:a.b.id,expected_revision:1,pin:syntheticPin,operation_id:op};
    await pass('lifecycle/revoke-adult-sessions',body,'session',fresh.bearer);
    await pass('lifecycle/revoke-adult-sessions',body,'session',fresh.bearer);
    await deny('profile/read',{family_id:f.id,profile_id:c.p.id},'session',managed.bearer);
    await pass('session/read',{},'session',c.own!.bearer);
  });
  it('recovers by code, preserves the profile, invalidates the old family branch, and repairs a lost commit response',async()=>{
    const a=await parent(await family()),c=await child(a,true),outside=await parent(await family(),100);
    const r=await recovery(a);await deny('recovery/complete',{expected_revision:1,pin:'009876',pin_confirmation:'009876'},'candidate',r.bearer);
    await deny('recovery/code',{expected_revision:1,recovery_code:'INVALID'},'candidate',r.bearer);
    await pass('recovery/code',{expected_revision:1,recovery_code:a.code},'candidate',r.bearer);
    const result=await complete(r);
    await server.close();server=await makeServer(other.db);
    await deny('recovery/complete',{expected_revision:2,pin:'009876',pin_confirmation:'009876'},'candidate',r.bearer);
    const setup=await pass('setup/read',{},'setup',r.bearer);expect(setup.setup.binding_id).toBe(result.binding_id);
    const code=await pass('setup/rotate-recovery',{expected_revision:1},'setup',r.bearer);
    await pass('setup/acknowledge',{expected_revision:2,recovery_code:code.recovery_code},'setup',r.bearer);
    const l=await launch(200),token=await pass('session/login',{family_id:a.f.id,binding_id:result.binding_id,pin:'009876'},'launch',l.bearer);
    expect(token.session.profile_id).toBe(a.p.id);
    await deny('session/read',{},'session',a.token!.bearer);await pass('session/read',{},'session',c.own!.bearer);
    await pass('session/read',{},'session',outside.token!.bearer);
    expect((await raw`SELECT count(*)::int AS n FROM rpg.players`)[0].n).toBe(1);
  });
  it('approves exact recovery candidates with another adult PIN and makes cancellation/expiry effective over HTTP',async()=>{
    const f=await family(),a=await parent(f),b=await parent(f,101),outside=await parent(await family(),102),r=await recovery(a);
    const approval={request_id:r.request.id,expected_revision:1,candidate_account_id:r.request.candidate_account_id,pin:syntheticPin,operation_id:newEntityId()};
    await deny('recovery/approve',approval,'session',a.token!.bearer);
    await deny('recovery/approve',approval,'session',outside.token!.bearer);
    await deny('recovery/approve',{...approval,candidate_account_id:newEntityId()},'session',b.token!.bearer);
    await pass('recovery/approve',approval,'session',b.token!.bearer);
    await pass('lifecycle/cancel',{request_id:r.request.id,expected_revision:2,pin:syntheticPin,operation_id:newEntityId()},'session',b.token!.bearer);
    await deny('recovery/complete',{expected_revision:2,pin:'009876',pin_confirmation:'009876'},'candidate',r.bearer);
    const second=await recovery(a,201);tick+=600000;await deny('lifecycle/read',{},'candidate',second.bearer);
  });
  it('loses and reclaims invitation responses, rejects stale approvals, and consumes once across two HTTP servers',async()=>{
    const a=await parent(await family()),c=await child(a),i=await invite(a,'invite_child',c.p.id),r=await claim(i);
    await deny('invitation/consume',{expected_revision:2,display_name:'Synthetic child'},'candidate',r.bearer);
    const wrong=await launch(301);await deny('invitation/claim',{invite_secret:i.invite_secret},'launch',wrong.bearer);
    const repeated=await claim(i);await deny('lifecycle/read',{},'candidate',r.bearer);
    await deny('invitation/approve',{request_id:r.request.id,expected_revision:r.request.revision,candidate_account_id:r.request.candidate_account_id,
      pin:syntheticPin,operation_id:newEntityId()},'session',a.token!.bearer);
    const inspected=await pass('lifecycle/inspect',{request_id:repeated.request.id},'session',a.token!.bearer);
    expect(inspected.candidate.subject).toBe('300');
    const approved=await approve(a,repeated),second=await makeServer(other.db);
    const body={expected_revision:approved.request.revision,display_name:'Synthetic child'};
    const results=await Promise.all([pass('invitation/consume',body,'candidate',repeated.bearer),pass('invitation/consume',body,'candidate',repeated.bearer,second)]);
    expect(results[0].binding_id).toBe(results[1].binding_id);
    await server.close();server=await makeServer(other.db);
    expect((await pass('invitation/consume',body,'candidate',repeated.bearer)).binding_id).toBe(results[0].binding_id);
    const l=await launch(300),own=await pass('session/own-child',{family_id:a.f.id,binding_id:results[0].binding_id},'launch',l.bearer);
    const profile=await pass('profile/read',{family_id:a.f.id,profile_id:c.p.id},'session',own.bearer);expect(profile.value.player_id).toBe(c.player.id);
    expect((await raw`SELECT count(*)::int AS n FROM rpg.member_profiles`)[0].n).toBe(2);
    expect((await raw`SELECT count(*)::int AS n FROM rpg.players`)[0].n).toBe(1);
  });
  it('adult invitation creates one parent, requires their own setup, and exclusion requires target consent',async()=>{
    const a=await parent(await family()),i=await invite(a),r=await claim(i,200),approved=await approve(a,r);
    const result=await pass('invitation/consume',{expected_revision:approved.request.revision,display_name:'Synthetic adult'},'candidate',r.bearer);
    const l=await launch(200),scope={family_id:a.f.id,binding_id:result.binding_id};
    await deny('session/login',{...scope,pin:syntheticPin},'launch',l.bearer);
    const setup=await pass('setup/begin',scope,'launch',l.bearer),code=await pass('setup/prepare',{pin:syntheticPin,pin_confirmation:syntheticPin,expected_revision:1},'setup',setup.bearer);
    await pass('setup/acknowledge',{expected_revision:2,recovery_code:code.recovery_code},'setup',setup.bearer);
    const fresh=await launch(200),token=await pass('session/login',{...scope,pin:syntheticPin},'launch',fresh.bearer);
    const exclusion=await pass('lifecycle/exclusion',{target_binding_id:result.binding_id,expected_revision:1,pin:syntheticPin,operation_id:newEntityId()},'session',a.token!.bearer);
    const consent={request_id:exclusion.request.id,expected_revision:1,pin:syntheticPin,operation_id:newEntityId()};
    await deny('lifecycle/consent-exclusion',consent,'session',a.token!.bearer);
    await pass('session/read',{},'session',token.bearer);
    await pass('lifecycle/consent-exclusion',consent,'session',token.bearer);await deny('session/read',{},'session',token.bearer);
    expect((await raw`SELECT count(*)::int AS n FROM rpg.member_profiles`)[0].n).toBe(2);
    expect((await raw`SELECT count(*)::int AS n FROM rpg.players`)[0].n).toBe(0);
  });
  it('fresh proof binds a revoke command and replay cannot revoke twice or cross a family',async()=>{
    const a=await parent(await family()),c=await child(a,true),op=newEntityId();
    const body={pin:syntheticPin,action:'revoke_session',target_id:c.own!.session.id,expected_revision:1,operation_id:op};
    const proof=await pass('session/confirm',body,'session',a.token!.bearer);
    const revoke={session_id:c.own!.session.id,expected_revision:1,confirmation:{proof_bearer:proof.proof_bearer,operation_id:op}};
    await deny('session/revoke',{...revoke,session_id:newEntityId()},'session',a.token!.bearer);
    await pass('session/revoke',revoke,'session',a.token!.bearer);
    expect((await pass('session/revoke',revoke,'session',a.token!.bearer)).replayed).toBe(true);
    await deny('session/read',{},'session',c.own!.bearer);
    const l=await launch(300),own=await pass('session/own-child',{family_id:a.f.id,binding_id:c.ownBinding!.id},'launch',l.bearer);
    const bindingOp=newEntityId(),bindingProof=await pass('session/confirm',{pin:syntheticPin,action:'revoke_binding',target_id:c.ownBinding!.id,expected_revision:1,operation_id:bindingOp},'session',a.token!.bearer);
    expect((await deny('binding/revoke',{binding_id:c.ownBinding!.id,expected_revision:1,confirmation:{proof_bearer:bindingProof.proof_bearer,operation_id:bindingOp}},'session',a.token!.bearer)).status).toBe(429);
    await pass('session/read',{},'session',own.bearer);
    tick+=301000;
    const adultLaunch=await launch(),freshAdult=await pass('session/login',{family_id:a.f.id,binding_id:a.b.id,pin:syntheticPin},'launch',adultLaunch.bearer);
    const freshOp=newEntityId(),freshProof=await pass('session/confirm',{pin:syntheticPin,action:'revoke_binding',target_id:c.ownBinding!.id,expected_revision:1,operation_id:freshOp},'session',freshAdult.bearer);
    await pass('binding/revoke',{binding_id:c.ownBinding!.id,expected_revision:1,confirmation:{proof_bearer:freshProof.proof_bearer,operation_id:freshOp}},'session',freshAdult.bearer);
    await deny('session/read',{},'session',own.bearer);
  });
  it('retires own bearer with CAS and enforces session expiry after a new HTTP factory',async()=>{
    const a=await parent(await family()),c=await child(a,true);
    await deny('session/retire',{expected_revision:2},'session',c.own!.bearer);
    await pass('session/retire',{expected_revision:1},'session',c.own!.bearer);
    await deny('session/read',{},'session',c.own!.bearer);
    const l=await launch(300),own=await pass('session/own-child',{family_id:a.f.id,binding_id:c.ownBinding!.id},'launch',l.bearer);
    tick+=28800000;server=await makeServer(other.db);await deny('session/read',{},'session',own.bearer);
  });
  it('last adult cannot leave; after another eligible adult joins, receipt survives restart and bearer stays revoked',async()=>{
    const f=await family(),a=await parent(f),body={pin:syntheticPin,expected_binding_revision:1,operation_id:newEntityId()};
    await deny('lifecycle/leave',body,'session',a.token!.bearer);
    await parent(f,101);await pass('lifecycle/leave',body,'session',a.token!.bearer);
    await deny('lifecycle/leave',body,'session',a.token!.bearer);
    await server.close();server=await makeServer(other.db);
    const l=await launch(),receipt=await pass('lifecycle/operation',{operation_id:body.operation_id},'launch',l.bearer);expect(receipt.action).toBe('leave');
    const wrong=await launch(500);await deny('lifecycle/operation',{operation_id:body.operation_id},'launch',wrong.bearer);
    await deny('profile/read',{family_id:f.id,profile_id:a.p.id},'session',a.token!.bearer);
    expect((await raw`SELECT count(*)::int AS n FROM rpg.lifecycle_events WHERE action='leave'`)[0].n).toBe(1);
  });
  it('HTTP access raced with leave finishes only before revocation; later reads are denied',async()=>{
    const f=await family(),a=await parent(f);await parent(f,101);
    let release!:()=>void,entered!:()=>void;
    const paused=new Promise<void>(resolve=>entered=resolve),resume=new Promise<void>(resolve=>release=resolve);
    const derive=createPinKdf(syntheticPepper()).derive;
    const second=await makeServer(other.db,{derivePin:async(pin,salt)=>{entered();await resume;return derive(pin,salt);}});
    const leaving=call('lifecycle/leave',{pin:syntheticPin,expected_binding_revision:1,operation_id:newEntityId()},'session',a.token!.bearer,second);
    await paused;
    try {await pass('profile/read',{family_id:f.id,profile_id:a.p.id},'session',a.token!.bearer);} finally {release();}
    const result=await leaving;
    // An intervening activity revision may invalidate the pending PIN proof; never report that as success.
    if(result.status!==200)await pass('lifecycle/leave',{pin:syntheticPin,expected_binding_revision:1,operation_id:newEntityId()},'session',a.token!.bearer);
    await deny('profile/read',{family_id:f.id,profile_id:a.p.id},'session',a.token!.bearer);
  });
  it('transaction failure at invitation consume is an HTTP failure with no partial profile/binding, retry succeeds once',async()=>{
    const a=await parent(await family()),i=await invite(a),r=await claim(i,200),approved=await approve(a,r);
    await raw.unsafe("CREATE FUNCTION rpg.g03g_fail_consume() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action = 'consume' THEN RAISE EXCEPTION 'synthetic failure'; END IF; RETURN NEW; END $$");
    await raw.unsafe('CREATE TRIGGER g03g_fail BEFORE INSERT ON rpg.lifecycle_events FOR EACH ROW EXECUTE FUNCTION rpg.g03g_fail_consume()');
    const body={expected_revision:approved.request.revision,display_name:'Synthetic adult'};
    await deny('invitation/consume',body,'candidate',r.bearer);
    expect((await raw`SELECT count(*)::int AS n FROM rpg.member_profiles`)[0].n).toBe(1);
    expect((await raw`SELECT count(*)::int AS n FROM rpg.access_bindings`)[0].n).toBe(1);
    await raw.unsafe('DROP TRIGGER g03g_fail ON rpg.lifecycle_events');
    await pass('invitation/consume',body,'candidate',r.bearer);await pass('invitation/consume',body,'candidate',r.bearer);
    expect((await raw`SELECT count(*)::int AS n FROM rpg.member_profiles`)[0].n).toBe(2);
  });
  it('session revoke racing a protected HTTP read cannot serve later reads and never caches the old actor',async()=>{
    const a=await parent(await family()),c=await child(a,true),second=await makeServer(other.db);
    const [read,revoke]=await Promise.all([
      call('profile/read',{family_id:a.f.id,profile_id:c.p.id},'session',c.own!.bearer),
      pass('session/revoke',{session_id:c.own!.session.id,expected_revision:1,confirmation:null},'session',c.own!.bearer,second),
    ]);
    expect([200,401]).toContain(read.status);expect(revoke.ok).toBe(true);
    await deny('profile/read',{family_id:a.f.id,profile_id:c.p.id},'session',c.own!.bearer);
    await deny('session/read',{},'session',c.own!.bearer,second);
  });
  it('production consent flags and synthetic identity never bypass fixture-only membership bootstrap',async()=>{
    const l=await launch(900),f=await family(),a=await parent(f);
    await deny('setup/begin',{family_id:f.id,binding_id:a.b.id},'launch',l.bearer);
    await deny('session/own-child',{family_id:f.id,binding_id:a.b.id},'launch',l.bearer);
    await deny('family/bootstrap',{synthetic:true,accepted_terms:true},'launch',l.bearer);
    expect((await raw`SELECT count(*)::int AS n FROM rpg.families`)[0].n).toBe(1);
    expect((await database.db.select().from(accessBindings).where(eq(accessBindings.account_id,l.launch.account_id))).length).toBe(0);
    expect(JSON.stringify(audits)).not.toMatch(/001234|recovery_code|init_data|Bearer|syntheticInput/);
  });
  it('new identity launches do not bypass the shared PIN failure pause over HTTP',async()=>{
    const a=await parent(await family()),l=await launch();
    const body={family_id:a.f.id,binding_id:a.b.id,pin:'999999'};
    for(let attempt=0;attempt<5;attempt++)expect((await deny('session/login',body,'launch',l.bearer)).status).toBe(403);
    const fresh=await launch();
    expect((await deny('session/login',{...body,pin:syntheticPin},'launch',fresh.bearer)).status).toBe(429);
    tick+=901000;const afterPause=await launch();
    await pass('session/login',{...body,pin:syntheticPin},'launch',afterPause.bearer);
  });
  it('completes HTTP recovery approved by another adult and exposes only the restricted setup until acknowledgement',async()=>{
    const f=await family(),a=await parent(f),b=await parent(f,101),r=await recovery(a);
    await pass('recovery/approve',{request_id:r.request.id,expected_revision:1,candidate_account_id:r.request.candidate_account_id,pin:syntheticPin,operation_id:newEntityId()},'session',b.token!.bearer);
    const result=await complete(r);
    const l=await launch(200);
    await deny('setup/begin',{family_id:f.id,binding_id:result.binding_id},'launch',l.bearer);
    await deny('session/login',{family_id:f.id,binding_id:result.binding_id,pin:'009876'},'launch',l.bearer);
    await pass('setup/acknowledge',{expected_revision:1,recovery_code:result.recovery_code},'setup',r.bearer);
    await pass('session/login',{family_id:f.id,binding_id:result.binding_id,pin:'009876'},'launch',l.bearer);
    await pass('session/read',{},'session',b.token!.bearer);await deny('session/read',{},'session',a.token!.bearer);
  });
  it('withdrawn or expired invitation approvals cannot be consumed through HTTP',async()=>{
    const a=await parent(await family()),i=await invite(a),r=await claim(i,200),approved=await approve(a,r);
    await pass('lifecycle/cancel',{request_id:r.request.id,expected_revision:approved.request.revision,pin:syntheticPin,operation_id:newEntityId()},'session',a.token!.bearer);
    await deny('invitation/consume',{expected_revision:approved.request.revision,display_name:'Synthetic adult'},'candidate',r.bearer);
    const i2=await invite(a),r2=await claim(i2,201),approved2=await approve(a,r2);
    tick+=600000;
    await deny('invitation/consume',{expected_revision:approved2.request.revision,display_name:'Synthetic adult'},'candidate',r2.bearer);
    expect((await raw`SELECT count(*)::int AS n FROM rpg.member_profiles`)[0].n).toBe(1);
  });
});
