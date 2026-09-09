import { createHmac } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { telegramIdentityVerifier } from '../../src/v3-server/auth/telegram.js';
import { digest, hashPin, token, verifyPin } from '../../src/v3-server/auth/crypto.js';
import { createIdentityService, createFamilyAdminService } from '../../src/v3-server/auth/service.js';
import { connectV3Database, type V3Database } from '../../src/v3-server/db/client.js';
import { readV3FoundationTestConfig } from '../../src/v3-server/db/config.js';
import { migrateV3Database } from '../../src/v3-server/db/migrate.js';
import { newEntityId } from '../../src/v3-server/foundation/ids.js';
import { createGameService } from '../../src/v3-server/game/service.js';
import { createV3HttpApp } from '../../src/v3-server/transport/http.js';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

describe('V3 Telegram proof and PIN hashing',()=>{
  const secret='123456:'+ 'a'.repeat(32), now=1788955200000;
  const verify=telegramIdentityVerifier(secret,()=>now);
  function signed(overrides: Record<string,string>={}) {
    const values={auth_date:String(now/1000),user:'{"id":12345,"first_name":"Private name"}',signature:'test_signature',...overrides};
    const check=Object.entries(values).sort(([a],[b])=>a<b?-1:1).map(([k,v])=>k+'='+v).join('\n');
    const hash=createHmac('sha256',createHmac('sha256','WebAppData').update(secret).digest()).update(check).digest('hex');
    return new URLSearchParams({...values,hash}).toString();
  }
  it('verifies HMAC including signature but stores only the bot-scoped subject hash',async()=>{
    expect(await verify(signed())).toBe(digest('telegram:123456:12345'));
    expect(await verify(signed({user:'{"id":12345,"first_name":"Changed"}'}))).toBe(await verify(signed()));
  });
  it('rejects tampering, duplicate parameters/JSON keys, old/future proofs and noncanonical IDs',async()=>{
    for(const raw of [signed().replace('test_signature','wrong'),signed()+'&hash='+'0'.repeat(64),
      signed({auth_date:String(now/1000-301)}),signed({auth_date:String(now/1000+31)}),
      signed({user:'{"id":12345,"id":12345}'}),signed({user:'{"id":1e3}'}),signed({user:'{"id":1.0}'}),
      signed({user:'{"id":0}'}),signed({user:'{"id":9007199254740992}'}),signed()+'&broken=%GG']) {
      await expect(verify(raw)).rejects.toMatchObject({code:'FORBIDDEN'});
    }
    await expect(telegramIdentityVerifier('999999:'+ 'b'.repeat(32),()=>now)(signed())).rejects.toMatchObject({code:'FORBIDDEN'});
  });
  it('uses independent salts and checks numeric PINs without retaining plaintext',async()=>{
    const first=await hashPin('123456'),second=await hashPin('123456');
    expect(first).not.toBe(second); expect(first).not.toContain('123456');
    expect(await verifyPin('123456',first)).toBe(true);expect(await verifyPin('123457',first)).toBe(false);
    await expect(hashPin('1234')).rejects.toMatchObject({code:'VALIDATION'});
  });
});
const pg=process.env.V3_FOUNDATION_TEST_CONFIG?describe:describe.skip;
pg('V3 identity, shared device, invites and HTTP boundary',()=>{
  let db:V3Database, identities:ReturnType<typeof createIdentityService>, admin:ReturnType<typeof createFamilyAdminService>;
  let login: Awaited<ReturnType<ReturnType<typeof createIdentityService>['login']>>, prefix:string;
  let server:Server|undefined;
  const families=new Set<string>();
  const verify=async(raw:unknown)=>digest(prefix+':'+String(raw));
  const person=(credential='owner',pin='123456',invite:string|null=null)=>({credential,pin,invite,displayName:'Тестовый участник',intent:'enroll'});
  const actor=()=>identities.access.authenticate(login.token);
  const add=async(role:'child'|'adult'='child')=>admin.addMember(await actor(),{idempotencyKey:newEntityId(),displayName:role==='child'?'Ребёнок':'Другой взрослый',role});
  beforeAll(async()=>{db=await connectV3Database(readV3FoundationTestConfig(process.env));await migrateV3Database(db);});
  beforeEach(async()=>{
    prefix=token(); identities=createIdentityService(db,verify);admin=createFamilyAdminService(identities.access);
    login=await identities.login(person()); families.add(login.familyId);
  });
  afterEach(async()=>{
    if(server){await new Promise<void>((resolve,reject)=>server!.close(e=>e?reject(e):resolve()));server=undefined;}
    for(const family of families)await db.sql.begin(async tx=>{
      const accounts=await tx`select distinct account_id as id from rpg_v3.access_bindings where family_id=${family}`;
      await tx`delete from rpg_v3.device_tokens where session_id in (select id from rpg_v3.sessions where family_id=${family})`;
      await tx`delete from rpg_v3.identities where home_binding_id in (select id from rpg_v3.access_bindings where family_id=${family})`;
      await tx`delete from rpg_v3.member_invites where family_id=${family}`;
      await tx`delete from rpg_v3.game_receipts where family_id=${family}`;
      await tx`delete from rpg_v3.game_ledger where family_id=${family}`;
      await tx`delete from rpg_v3.game_claims where family_id=${family}`;
      await tx`delete from rpg_v3.game_documents where family_id=${family}`;
      await tx`delete from rpg_v3.sessions where family_id=${family}`;
      await tx`delete from rpg_v3.access_bindings where family_id=${family}`;
      await tx`delete from rpg_v3.capability_grants where family_id=${family}`;
      await tx`delete from rpg_v3.players where family_id=${family}`;
      await tx`delete from rpg_v3.member_profiles where family_id=${family}`;
      await tx`delete from rpg_v3.families where id=${family}`;
      for(const a of accounts)await tx`delete from rpg_v3.accounts where id=${a.id}`;
    });
    families.clear();
  });
  afterAll(async()=>{await db?.close();});
  it('reuses enrolled identity, rejects forged tokens and never accepts caller-supplied actor claims',async()=>{
    const second=await identities.login(person());expect(second.memberId).toBe(login.memberId);expect(second.recoveryCode).toBeNull();
    await expect(identities.access.authenticate(token())).rejects.toMatchObject({code:'FORBIDDEN'});
    await expect(identities.login({...person(),accountId:newEntityId()})).rejects.toMatchObject({code:'VALIDATION'});
    expect((await actor()).grants.some(g=>g.capability==='family.manage')).toBe(true);
  });
  it('serializes first enrollment for one subject across two independent login calls',async()=>{
    const [a,b]=await Promise.all([identities.login(person('new')),identities.login(person('new'))]);
    families.add(a.familyId);families.add(b.familyId);
    expect(a.familyId).toBe(b.familyId);expect(a.memberId).toBe(b.memberId);
    expect([a,b].filter(v=>v.recoveryCode)).toHaveLength(1);
  });
  it('commits failed PIN attempts, locks after five, and consumes recovery once while revoking every old session',async()=>{
    for(let i=0;i<5;i++)await expect(identities.login(person('owner','654321'))).rejects.toMatchObject({code:'FORBIDDEN'});
    const [record]=await db.sql`select failures from rpg_v3.identities where subject_hash=${await verify('owner')}`;
    expect(record.failures).toBe(5);await expect(identities.login(person())).rejects.toMatchObject({code:'FORBIDDEN'});
    const result=await identities.recover({credential:'owner',recoveryCode:login.recoveryCode,newPin:'987654'});
    expect(result.recoveryCode).not.toBe(login.recoveryCode);
    await expect(actor()).rejects.toMatchObject({code:'FORBIDDEN'});
    await expect(identities.recover({credential:'owner',recoveryCode:login.recoveryCode,newPin:'111111'})).rejects.toMatchObject({code:'FORBIDDEN'});
    await expect(identities.recover({credential:'other',recoveryCode:result.recoveryCode,newPin:'111111'})).rejects.toMatchObject({code:'FORBIDDEN'});
    expect((await identities.login(person('owner','987654'))).memberId).toBe(login.memberId);
  });
  it('rotates and revokes adult device context on child switch, requiring the home PIN to return',async()=>{
    const child=await add(),otherAdult=await add('adult'),oldActor=await actor();
    await expect(identities.switchProfile(oldActor,login.token,{memberId:otherAdult.memberId,pin:null})).rejects.toMatchObject({code:'FORBIDDEN'});
    const switched=await identities.switchProfile(oldActor,login.token,{memberId:child.memberId,pin:null});
    await expect(actor()).rejects.toMatchObject({code:'FORBIDDEN'});
    const childActor=await identities.access.authenticate(switched.token);
    expect(childActor.mode).toBe('managed_child');expect(childActor.grants.some(g=>g.capability==='family.manage')).toBe(false);
    await expect(admin.addMember(childActor,{idempotencyKey:newEntityId(),displayName:'X',role:'adult'})).rejects.toMatchObject({code:'FORBIDDEN'});
    await expect(identities.switchProfile(childActor,switched.token,{memberId:login.memberId,pin:'000000'})).rejects.toMatchObject({code:'FORBIDDEN'});
    const restored=await identities.switchProfile(childActor,switched.token,{memberId:login.memberId,pin:'123456'});
    expect((await identities.access.authenticate(restored.token)).mode).toBe('adult');
    await expect(identities.access.authenticate(switched.token)).rejects.toMatchObject({code:'FORBIDDEN'});
  });
  it('rejects an adult binding forged into child mode even if grants remain in SQL',async()=>{
    const a=await actor();
    await db.sql`update rpg_v3.access_bindings set mode='managed_child',revision=revision+1 where id=${a.bindingId}`;
    await expect(actor()).rejects.toMatchObject({code:'FORBIDDEN'});
  });
  it('invites bind exactly one own identity to the stored role, with no adult-home escape for a child',async()=>{
    const child=await add();
    const invitation=await admin.invite(await actor(),{idempotencyKey:newEntityId(),memberId:child.memberId});
    const joined=await identities.login(person('child-own','444444',invitation.code));
    expect(joined.familyId).toBe(login.familyId);
    const ca=await identities.access.authenticate(joined.token);
    expect(ca.mode).toBe('own_child');expect(ca.actingMemberId).toBe(child.memberId);
    await expect(identities.login(person('attacker','555555',invitation.code))).rejects.toMatchObject({code:'FORBIDDEN'});
    await expect(identities.switchProfile(ca,joined.token,{memberId:login.memberId,pin:'123456'})).rejects.toMatchObject({code:'FORBIDDEN'});
  });
  it('reissues invitations by revoking the old one and rejects expired invites',async()=>{
    const child=await add();
    const old=await admin.invite(await actor(),{idempotencyKey:newEntityId(),memberId:child.memberId});
    const fresh=await admin.invite(await actor(),{idempotencyKey:newEntityId(),memberId:child.memberId});
    await expect(identities.login(person('join','222222',old.code))).rejects.toMatchObject({code:'FORBIDDEN'});
    await db.sql`update rpg_v3.member_invites set expires_at=clock_timestamp()-interval '1 second' where token_hash=${digest(fresh.code)}`;
    await expect(identities.login(person('join','222222',fresh.code))).rejects.toMatchObject({code:'FORBIDDEN'});
  });
  it('replays admin writes without another member or invite and rejects changed payloads',async()=>{
    const p={idempotencyKey:newEntityId(),displayName:'Один ребёнок',role:'child'};
    const first=await admin.addMember(await actor(),p),second=await admin.addMember(await actor(),p);
    expect(first).toEqual(second);
    await expect(admin.addMember(await actor(),{...p,displayName:'Другой'})).rejects.toMatchObject({code:'CONFLICT'});
    const key=newEntityId(),invite=await admin.invite(await actor(),{idempotencyKey:key,memberId:first.memberId});
    expect(await admin.invite(await actor(),{idempotencyKey:key,memberId:first.memberId})).toEqual(invite);
  });
  it('pauses play without disabling history; leaving revokes sessions and keeps historical identity',async()=>{
    const child=await add(),switched=await identities.switchProfile(await actor(),login.token,{memberId:child.memberId,pin:null});
    login=await identities.login(person());
    const p={idempotencyKey:newEntityId(),memberId:child.memberId,displayName:'Ребёнок',status:'active',playerStatus:'paused',expectedRevision:1};
    await admin.updateMember(await actor(),p);
    const ca=await identities.access.authenticate(switched.token),game=createGameService(identities.access);
    expect((await game.read(ca)).playerId).toBe(child.playerId);
    await admin.updateMember(await actor(),{...p,idempotencyKey:newEntityId(),status:'left',playerStatus:'left',expectedRevision:2});
    await expect(identities.access.authenticate(switched.token)).rejects.toMatchObject({code:'FORBIDDEN'});
    expect((await db.sql`select id from rpg_v3.players where id=${child.playerId}`)).toHaveLength(1);
  });
  it('enforces same-origin JSON HTTP requests and cookie sessions, including lost-response command replay',async()=>{
    // Allocate a port first; the actual origin is passed to the app before serving any request.
    server=createServer();await new Promise<void>(resolve=>server!.listen(0,'127.0.0.1',resolve));
    const port=(server.address() as AddressInfo).port,origin='http://127.0.0.1:'+port;
    server.on('request',createV3HttpApp({database:db,origin,mode:'local',verifyIdentity:verify}));
    const headers={'Content-Type':'application/json','Origin':origin,'X-V3-Request':'1'};
    const response=await fetch(origin+'/v3/api/auth/login',{method:'POST',headers,body:JSON.stringify(person())});
    expect(response.status).toBe(200);
    const setCookie=response.headers.get('set-cookie')!;
    expect(setCookie).toContain('HttpOnly');expect(setCookie).toContain('SameSite=Strict');
    const sessionCookie=setCookie.split(';')[0];
    expect((await fetch(origin+'/v3/api/game')).status).toBe(403);
    expect((await fetch(origin+'/v3/api/game',{headers:{Cookie:sessionCookie}})).status).toBe(200);
    expect((await fetch(origin+'/v3/api/commands',{method:'POST',headers:{...headers,Origin:'https://evil.invalid',Cookie:sessionCookie},body:'{}'})).status).toBe(403);
    expect((await fetch(origin+'/v3/api/commands',{method:'POST',headers:{...headers,'Content-Type':'text/plain',Cookie:sessionCookie},body:'{}'})).status).toBe(415);
    const raw=JSON.stringify({contract:'family_life_v3.commands',version:'0.1',command:'OpenToday',idempotencyKey:newEntityId(),payload:{}});
    const send=()=>fetch(origin+'/v3/api/commands',{method:'POST',headers:{...headers,Cookie:sessionCookie},body:raw});
    const first=await (await send()).json(),second=await (await send()).json();
    expect(first.operationId).toBeTruthy();expect(second.operationId).toBe(first.operationId);expect(second.outcome).toBe('already_applied');
    const duplicate=await fetch(origin+'/v3/api/commands',{method:'POST',headers:{...headers,Cookie:sessionCookie},body:raw.replace('"payload":{}','"payload":{},"payload":{}')});
    expect(duplicate.status).toBe(400);
    const logout=await fetch(origin+'/v3/api/auth/logout',{method:'POST',headers:{...headers,Cookie:sessionCookie},body:'{}'});
    expect(logout.status).toBe(200);expect((await fetch(origin+'/v3/api/game',{headers:{Cookie:sessionCookie}})).status).toBe(403);
  });
});
