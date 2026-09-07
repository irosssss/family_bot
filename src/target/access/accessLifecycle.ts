import { and, eq, gte, isNull, or, sql } from 'drizzle-orm';
import type { openTargetDatabase } from '../db/database';
import { lifecycleRequests, lifecycleEvents } from '../db/schema/accessLifecycle';
import { accessBindings, sessionContexts } from '../db/schema/familyAccess';
import { adultProtections, adultRecoveryCredentials, adultSetups, launchConsumptions, accessOperations } from '../db/schema/adultProtection';
import { externalIdentities } from '../db/schema/access';
import { families, memberProfiles, players, accounts } from '../db/schema/foundation';
import { lifecycleRecordToDto, parseLifecycleRecord, type LifecycleRecords } from '../contracts/accessLifecycle';
import { parseAdultRecord } from '../contracts/adultProtection';
import { parseFamilyAccessRecord, type FamilyAccessRecords } from '../contracts/familyAccess';
import { closedObject, reject } from '../contracts/errors';
import { entityId, revision } from '../contracts/ids';
import { createAdultAccessService, type AdultDependencies } from './adultAccess';
import type { createIdentityExchangeService } from './identityExchange';
import type { AdultSecurityConfig } from './adultPolicy';
import type { FamilyTransaction } from './familySession';
import { equalDigest, isBearer, newBearer, parsePin, pinKdfId, recoveryVerifier, secretDigest, withSecret } from './adultCrypto';

type Database=Awaited<ReturnType<typeof openTargetDatabase>>['db'];
type Request=LifecycleRecords['request'];
type Binding=FamilyAccessRecords['binding'];
type Exchange=ReturnType<typeof createIdentityExchangeService>;
export function createAccessLifecycleService(db:Database,exchange:Exchange,config:AdultSecurityConfig,pepper:Uint8Array,dependencies:AdultDependencies={}) {
  const adult=createAdultAccessService(db,exchange,config,pepper,dependencies);
  const {family,policy,cfg,now,base,mutable,limitedKdf,withFreshPin,rotateRecovery,protectionFor,entropy}=adult.internal;
  const plus=(time:string,seconds:number)=>new Date(Date.parse(time)+seconds*1000).toISOString();
  const digest=(value:readonly unknown[])=>secretDigest('lifecycle_intent_v1',JSON.stringify(value));
  const fail=()=>Object.freeze({ok:false as const,error_key:'access.lifecycle_denied'});
  async function safe<T>(work:()=>Promise<T>) {try{return await work();}catch{return fail();}}
  const publicRequest=(r:Request)=>Object.freeze({id:r.id,revision:r.state_revision,kind:r.kind,state:r.state,
    family_id:r.family_id,target_profile_id:r.target_profile_id,candidate_account_id:r.candidate_account_id,result_binding_id:r.result_binding_id,
    completed_operation_id:r.state==='consumed'&&r.kind!=='exclusion'?r.id:null,expires_at:r.expires_at});
  const empty=()=>({target_binding_id:null,target_revision:null,target_profile_id:null,target_profile_revision:null,protection_id:null,protection_revision:null,
    issuer_binding_id:null,issuer_revision:null,issuer_protection_revision:null,invite_verifier:null,candidate_verifier:null,
    candidate_account_id:null,candidate_identity_id:null,candidate_launch_id:null,basis:null,basis_credential_id:null,approver_binding_id:null,
    approver_revision:null,approver_protection_revision:null,approved_at:null,result_binding_id:null,closed_at:null});
  async function event(tx:FamilyTransaction,r:Request,action:string,outcome='accepted',actor:string|null=null,operationId:string|null=null,requestDigest=r.request_digest) {
    await tx.insert(lifecycleEvents).values(parseLifecycleRecord('event',{...base(),family_id:r.family_id,request_id:r.id,
      actor_binding_id:actor,candidate_account_id:r.candidate_account_id,action,outcome,policy_revision:cfg.family.policyRevision,
      operation_id:operationId,request_digest:requestDigest}));
  }
  async function update(tx:FamilyTransaction,r:Request,changes:Partial<Request>) {
    const next=parseLifecycleRecord('request',{...r,...changes,updated_at:now(),state_revision:r.state_revision+1});
    await tx.update(lifecycleRequests).set(next).where(and(eq(lifecycleRequests.id,r.id),eq(lifecycleRequests.state_revision,r.state_revision)));
    return next;
  }
  async function load(tx:FamilyTransaction,id:string,expected?:number,allowClosed=false,expectedFamily?:string) {
    const [hint]=await tx.select({family_id:lifecycleRequests.family_id}).from(lifecycleRequests).where(eq(lifecycleRequests.id,id));
    if(!hint||expectedFamily!==undefined&&hint.family_id!==expectedFamily) reject('access.lifecycle_denied');
    await policy.assertActive(tx); await family.lockFamily(tx,hint.family_id);
    const [row]=await tx.select().from(lifecycleRequests).where(eq(lifecycleRequests.id,id)).for('update');
    if(!row) reject('access.lifecycle_denied'); const r=lifecycleRecordToDto('request',row);
    if(r.policy_revision!==cfg.family.policyRevision||now()<r.updated_at||now()>=r.expires_at
      ||!allowClosed&&r.closed_at!==null||expected!==undefined&&r.state_revision!==expected) reject('access.lifecycle_denied');
    return r;
  }
  async function byBearer(tx:FamilyTransaction,bearer:unknown,expected?:number,allowClosed=false) {
    if(!isBearer(bearer)) reject('access.lifecycle_denied');
    const [hint]=await tx.select({id:lifecycleRequests.id}).from(lifecycleRequests).where(eq(lifecycleRequests.candidate_verifier,secretDigest('lifecycle_candidate_v1',bearer)));
    if(!hint) reject('access.lifecycle_denied'); const r=await load(tx,hint.id,expected,allowClosed);
    await family.validSource(tx,r.candidate_account_id!,r.candidate_identity_id!); return r;
  }
  async function validAdult(tx:FamilyTransaction,id:string,familyId:string,expected?:number,protectionRevision?:number) {
    const b=await family.validBinding(tx,id,familyId),p=await protectionFor(tx,b,true);
    const [account]=await tx.select().from(accounts).where(eq(accounts.id,b.account_id)).for('share');
    if(b.kind!=='adult_membership'||!p||!account||account.status!=='active'||expected!==undefined&&b.state_revision!==expected
      ||protectionRevision!==undefined&&p.credential_revision!==protectionRevision) reject('access.lifecycle_denied');
    return {b,p};
  }
  async function target(tx:FamilyTransaction,r:Request) {
    const b=await family.validBinding(tx,r.target_binding_id!,r.family_id);
    const profile=await activeProfile(tx,r.family_id,b.profile_id);
    const p=await protectionFor(tx,b,false);
    if(b.kind!=='adult_membership'||b.state_revision!==r.target_revision||b.profile_id!==r.target_profile_id||profile.state_revision!==r.target_profile_revision
      ||r.kind==='recovery'&&(!p||p.status==='revoked'||p.id!==r.protection_id||p.credential_revision!==r.protection_revision)) reject('access.lifecycle_denied');
    return {b,p};
  }
  async function basis(tx:FamilyTransaction,r:Request) {
    await target(tx,r);
    if(r.state!=='approved') reject('access.lifecycle_denied');
    if(r.basis==='adult') {
      const {b}=await validAdult(tx,r.approver_binding_id!,r.family_id,r.approver_revision!,r.approver_protection_revision!);
      if(b.id===r.target_binding_id) reject('access.lifecycle_denied');
    } else if(r.basis==='code') {
      const [code]=await tx.select().from(adultRecoveryCredentials).where(and(eq(adultRecoveryCredentials.id,r.basis_credential_id!),eq(adultRecoveryCredentials.protection_id,r.protection_id!),isNull(adultRecoveryCredentials.revoked_at)));
      if(!code||code.acknowledged_at===null||code.credential_revision!==r.protection_revision) reject('access.lifecycle_denied');
    } else reject('access.lifecycle_denied');
  }
  async function consumeLaunch(tx:FamilyTransaction,id:string) {
    // Lifecycle also consumes identity launches permanently; this receipt is not an adult session.
    await tx.insert(launchConsumptions).values(parseAdultRecord('consumption',{...base(),launch_id:id,purpose:'adult_setup'}));
  }
  async function bumpFamily(tx:FamilyTransaction,id:string) {
    await tx.update(families).set({updated_at:now(),state_revision:sql`${families.state_revision}+1`,membership_revision:sql`${families.membership_revision}+1`}).where(eq(families.id,id));
  }
  async function revokeParticipation(tx:FamilyTransaction,b:Binding) {
    const time=now();
    const bindings=await tx.select().from(accessBindings).where(and(eq(accessBindings.family_id,b.family_id),
      or(eq(accessBindings.id,b.id),eq(accessBindings.manager_binding_id,b.id)),eq(accessBindings.status,'active')));
    for(const binding of bindings) {
      const contexts=await tx.select({id:sessionContexts.id}).from(sessionContexts).where(and(eq(sessionContexts.family_id,b.family_id),eq(sessionContexts.binding_id,binding.id)));
      await family.revokeContexts(tx,b.family_id,contexts.map(c=>c.id));
      await tx.update(accessBindings).set({status:'revoked',revoked_at:time,updated_at:time,state_revision:binding.state_revision+1}).where(eq(accessBindings.id,binding.id));
    }
    await tx.update(adultProtections).set({status:'revoked',revoked_at:time,updated_at:time,state_revision:sql`${adultProtections.state_revision}+1`}).where(and(eq(adultProtections.binding_id,b.id),isNull(adultProtections.revoked_at)));
    await tx.update(adultRecoveryCredentials).set({revoked_at:time,updated_at:time,state_revision:sql`${adultRecoveryCredentials.state_revision}+1`}).where(and(eq(adultRecoveryCredentials.binding_id,b.id),isNull(adultRecoveryCredentials.revoked_at)));
    await tx.update(adultSetups).set({state:'revoked',revoked_at:time,updated_at:time,state_revision:sql`${adultSetups.state_revision}+1`}).where(and(eq(adultSetups.binding_id,b.id),isNull(adultSetups.revoked_at)));
    await tx.update(lifecycleRequests).set({state:'revoked',closed_at:time,updated_at:time,state_revision:sql`${lifecycleRequests.state_revision}+1`}).where(and(eq(lifecycleRequests.family_id,b.family_id),isNull(lifecycleRequests.closed_at),
      or(eq(lifecycleRequests.target_binding_id,b.id),eq(lifecycleRequests.issuer_binding_id,b.id),eq(lifecycleRequests.approver_binding_id,b.id))));
    return bindings.filter(row=>row.kind==='managed_child');
  }
  async function newBinding(tx:FamilyTransaction,familyId:string,accountId:string,profileId:string,kind:Binding['kind'],managerId:string|null=null) {
    const binding=parseFamilyAccessRecord('binding',{...mutable(),family_id:familyId,account_id:accountId,profile_id:profileId,
      profile_role:kind==='adult_membership'?'parent':'child',kind,manager_binding_id:managerId,manager_kind:managerId?'adult_membership':null,
      status:'active',revoked_at:null,origin_invitation_id:null});
    await tx.insert(accessBindings).values(binding); return binding;
  }
  async function beginRecovery(launchBearer:unknown,input:unknown) {
    return safe(()=>db.transaction(async tx=>{
      const req=closedObject(input,['family_id','binding_id']),familyId=entityId(req.family_id),bindingId=entityId(req.binding_id);
      await policy.assertActive(tx); await family.lockFamily(tx,familyId);
      const l=await exchange.lockLaunch(tx,launchBearer),b=await family.validBinding(tx,bindingId,familyId),p=await protectionFor(tx,b,false);
      if(b.kind!=='adult_membership'||!p||p.status==='revoked') reject('access.lifecycle_denied');
      const profile=await activeProfile(tx,familyId,b.profile_id);
      const recent=await tx.select({id:lifecycleRequests.id}).from(lifecycleRequests).where(and(eq(lifecycleRequests.family_id,familyId),eq(lifecycleRequests.candidate_account_id,l.account_id),gte(lifecycleRequests.created_at,plus(now(),-cfg.sourceWindowSeconds))));
      if(recent.length>=cfg.sourceAttemptMax) reject('access.lifecycle_denied');
      const bearer=newBearer(entropy),r=parseLifecycleRecord('request',{...mutable(),...empty(),family_id:familyId,kind:'recovery',state:'claimed',
        policy_revision:cfg.family.policyRevision,request_digest:digest(['recovery',familyId,b.id,l.account_id,l.external_identity_id]),expires_at:plus(now(),cfg.setupSeconds),
        target_binding_id:b.id,target_revision:b.state_revision,target_profile_id:b.profile_id,target_profile_revision:profile.state_revision,protection_id:p.id,protection_revision:p.credential_revision,
        candidate_verifier:secretDigest('lifecycle_candidate_v1',bearer),candidate_account_id:l.account_id,candidate_identity_id:l.external_identity_id,candidate_launch_id:l.launch_id});
      await consumeLaunch(tx,l.launch_id); await tx.insert(lifecycleRequests).values(r); await event(tx,r,'request');
      return withSecret({ok:true as const,request:publicRequest(r)},'bearer',bearer);
    }));
  }
  async function authorizeRecoveryCode(bearer:unknown,input:unknown) {
    return safe(()=>db.transaction(async tx=>{
      const req=closedObject(input,['expected_revision','recovery_code']),expected=revision(req.expected_revision),rawCode=req.recovery_code;
      const r=await byBearer(tx,bearer,expected); if(r.kind!=='recovery'||r.state!=='claimed') reject('access.lifecycle_denied');
      await target(tx,r);
      const attempts=await tx.select({id:lifecycleEvents.id}).from(lifecycleEvents).where(and(eq(lifecycleEvents.family_id,r.family_id),eq(lifecycleEvents.candidate_account_id,r.candidate_account_id!),eq(lifecycleEvents.action,'code'),gte(lifecycleEvents.created_at,plus(now(),-cfg.sourceWindowSeconds))));
      if(attempts.length>=cfg.sourceAttemptMax) reject('access.lifecycle_denied');
      let verifier:string|null=null; try {verifier=recoveryVerifier(rawCode);}catch { /* malformed attempts count too */ }
      const [code]=await tx.select().from(adultRecoveryCredentials).where(and(eq(adultRecoveryCredentials.protection_id,r.protection_id!),isNull(adultRecoveryCredentials.revoked_at)));
      if(!code||code.acknowledged_at===null||code.credential_revision!==r.protection_revision||!verifier||!equalDigest(code.verifier,verifier)) {await event(tx,r,'code','denied'); return fail();}
      const next=await update(tx,r,{state:'approved',basis:'code',basis_credential_id:code.id,approved_at:now()}); await event(tx,next,'code');
      return {ok:true as const,request:publicRequest(next)};
    }));
  }
  async function completeRecovery(bearer:unknown,input:unknown) {
    return safe(async()=>{
      const req=closedObject(input,['expected_revision','pin','pin_confirmation']),expected=revision(req.expected_revision),pin=parsePin(req.pin);
      if(pin!==parsePin(req.pin_confirmation)) reject('access.lifecycle_denied');
      const captured=await db.transaction(async tx=>{const r=await byBearer(tx,bearer,expected); await basis(tx,r);
        const recent=await tx.select({id:lifecycleEvents.id}).from(lifecycleEvents).where(and(eq(lifecycleEvents.request_id,r.id),eq(lifecycleEvents.action,'prepare'),gte(lifecycleEvents.created_at,plus(now(),-cfg.sourceWindowSeconds))));
        if(recent.length>=cfg.sourceAttemptMax) reject('access.lifecycle_denied');
        await event(tx,r,'prepare'); return r;});
      const bytes=entropy(16);if(!(bytes instanceof Uint8Array)||bytes.byteLength!==16) reject('adult.entropy_unavailable');
      const salt=Buffer.from(bytes).toString('hex'),verifier=await limitedKdf(pin,salt);
      return db.transaction(async tx=>{
        const r=await byBearer(tx,bearer,expected); if(r.id!==captured.id) reject('access.lifecycle_denied'); await basis(tx,r);
        const {b}=await target(tx,r),managed=await revokeParticipation(tx,b);
        const binding=await newBinding(tx,r.family_id,r.candidate_account_id!,b.profile_id,'adult_membership');
        for(const old of managed) await newBinding(tx,r.family_id,binding.account_id,old.profile_id,'managed_child',binding.id);
        const protection=parseAdultRecord('protection',{...mutable(),family_id:r.family_id,account_id:binding.account_id,profile_id:binding.profile_id,binding_id:binding.id,
          binding_kind:'adult_membership',credential_revision:1,status:'pending',kdf_id:pinKdfId,pin_salt:salt,pin_verifier:verifier,pepper_key_id:cfg.pepperKeyId,recovery_ack_at:null,revoked_at:null});
        await tx.insert(adultProtections).values(protection); const code=await rotateRecovery(tx,protection);
        const setup=parseAdultRecord('setup',{...mutable(),family_id:r.family_id,account_id:binding.account_id,profile_id:binding.profile_id,binding_id:binding.id,binding_kind:'adult_membership',binding_revision:1,
          external_identity_id:r.candidate_identity_id,launch_id:r.candidate_launch_id,token_verifier:secretDigest('adult_setup_v1',bearer as string),verifier_version:1,
          policy_revision:cfg.family.policyRevision,state:'awaiting_recovery',protection_id:protection.id,expires_at:plus(now(),cfg.setupSeconds),revoked_at:null});
        await tx.insert(adultSetups).values(setup);
        // revokeParticipation invalidated competing requests, including this one. Consume this exact snapshot in the same commit.
        const [revoked]=await tx.select().from(lifecycleRequests).where(eq(lifecycleRequests.id,r.id));
        const completed=await update(tx,lifecycleRecordToDto('request',revoked),{state:'consumed',closed_at:now(),result_binding_id:binding.id});
        await bumpFamily(tx,r.family_id); await event(tx,completed,'consume','accepted',null,r.id);
        return withSecret({ok:true as const,binding_id:binding.id,setup_revision:setup.state_revision,recovery_locator:code.locator},'recovery_code',code.code);
      });
    });
  }
  async function replay(tx:FamilyTransaction,operationId:string,actorId:string,requestDigest:string) {
    const [prior]=await tx.select().from(lifecycleEvents).where(eq(lifecycleEvents.operation_id,operationId));
    if(!prior) return false;
    if(prior.actor_binding_id!==actorId||prior.request_digest!==requestDigest) reject('access.lifecycle_denied');
    return true;
  }
  async function approveRecovery(bearer:unknown,input:unknown) {
    return safe(async()=>{
      const req=closedObject(input,['request_id','expected_revision','candidate_account_id','pin','operation_id']);
      const id=entityId(req.request_id),expected=revision(req.expected_revision),candidate=entityId(req.candidate_account_id),op=entityId(req.operation_id);
      const intent=['approve_recovery',id,expected,candidate,op],d=digest(intent);
      return withFreshPin(bearer,req.pin,intent,async(tx,source)=>{
        if(await replay(tx,op,source.binding.id,d)) return {ok:true as const};
        const r=await load(tx,id,expected,false,source.binding.family_id); await target(tx,r);
        if(r.kind!=='recovery'||r.state!=='claimed'||r.candidate_account_id!==candidate||r.target_binding_id===source.binding.id) reject('access.lifecycle_denied');
        await family.validSource(tx,r.candidate_account_id!,r.candidate_identity_id!);
        const next=await update(tx,r,{state:'approved',basis:'adult',approver_binding_id:source.binding.id,approver_revision:source.binding.state_revision,
          approver_protection_revision:source.protection!.credential_revision,approved_at:now()});
        await event(tx,next,'approve','accepted',source.binding.id,op,d); return {ok:true as const};
      });
    });
  }
  async function issueInvitation(bearer:unknown,input:unknown) {
    return safe(async()=>{
      const req=closedObject(input,['kind','profile_id','pin','operation_id']);
      if(req.kind!=='invite_child'&&req.kind!=='invite_adult') reject('access.lifecycle_denied');
      const kind=req.kind,profileId=req.profile_id===null?null:entityId(req.profile_id),op=entityId(req.operation_id);
      if((kind==='invite_child')!==(profileId!==null)) reject('access.lifecycle_denied');
      const intent=['issue_invite',kind,profileId,op],d=digest(intent);
      return withFreshPin(bearer,req.pin,intent,async(tx,source)=>{
        if(await replay(tx,op,source.binding.id,d)) return {ok:true as const};
        const profile=profileId?await childTarget(tx,source.binding.family_id,profileId):null;
        const recent=await tx.select({id:lifecycleRequests.id}).from(lifecycleRequests).where(and(eq(lifecycleRequests.issuer_binding_id,source.binding.id),gte(lifecycleRequests.created_at,plus(now(),-cfg.sourceWindowSeconds))));
        if(recent.length>=cfg.sourceAttemptMax) reject('access.lifecycle_denied');
        const secret=newBearer(entropy),r=parseLifecycleRecord('request',{...mutable(),...empty(),family_id:source.binding.family_id,
          kind,state:'issued',policy_revision:cfg.family.policyRevision,request_digest:d,expires_at:plus(now(),cfg.setupSeconds),
          target_profile_id:profileId,target_profile_revision:profile?.state_revision??null,issuer_binding_id:source.binding.id,issuer_revision:source.binding.state_revision,
          issuer_protection_revision:source.protection!.credential_revision,invite_verifier:secretDigest('lifecycle_invite_v1',secret)});
        await tx.insert(lifecycleRequests).values(r); await event(tx,r,'request','accepted',source.binding.id,op,d);
        return withSecret({ok:true as const,request:publicRequest(r)},'invite_secret',secret);
      });
    });
  }
  async function activeProfile(tx:FamilyTransaction,familyId:string,profileId:string) {
    const [p]=await tx.select().from(memberProfiles).where(and(eq(memberProfiles.family_id,familyId),eq(memberProfiles.id,profileId))).for('share');
    if(!p||p.status!=='active'||now()<new Date(p.updated_at).toISOString()) reject('access.lifecycle_denied');return p;
  }
  async function childTarget(tx:FamilyTransaction,familyId:string,profileId:string,expected?:number) {
    const p=await activeProfile(tx,familyId,profileId);
    const [player]=await tx.select().from(players).where(and(eq(players.family_id,familyId),eq(players.profile_id,profileId))).for('share');
    const existing=await tx.select({id:accessBindings.id}).from(accessBindings).where(and(eq(accessBindings.family_id,familyId),eq(accessBindings.profile_id,profileId),eq(accessBindings.kind,'own_child'),eq(accessBindings.status,'active')));
    if(p.family_role!=='child'||!player||existing.length||expected!==undefined&&p.state_revision!==expected) reject('access.lifecycle_denied');return p;
  }
  async function issuer(tx:FamilyTransaction,r:Request) {
    return validAdult(tx,r.issuer_binding_id!,r.family_id,r.issuer_revision!,r.issuer_protection_revision!);
  }
  async function claimInvitation(launchBearer:unknown,input:unknown) {
    return safe(()=>db.transaction(async tx=>{
      const req=closedObject(input,['invite_secret']); if(!isBearer(req.invite_secret)) reject('access.lifecycle_denied');
      const [hint]=await tx.select({id:lifecycleRequests.id}).from(lifecycleRequests).where(eq(lifecycleRequests.invite_verifier,secretDigest('lifecycle_invite_v1',req.invite_secret)));
      if(!hint) reject('access.lifecycle_denied'); const r=await load(tx,hint.id);
      if(!['invite_child','invite_adult'].includes(r.kind)||!['issued','claimed','approved'].includes(r.state)) reject('access.lifecycle_denied');
      await issuer(tx,r); const launch=await exchange.lockLaunch(tx,launchBearer);
      if(r.candidate_account_id!==null&&(r.candidate_account_id!==launch.account_id||r.candidate_identity_id!==launch.external_identity_id)) reject('access.lifecycle_denied');
      const recent=await tx.select({id:lifecycleEvents.id}).from(lifecycleEvents).where(and(eq(lifecycleEvents.request_id,r.id),eq(lifecycleEvents.action,'claim'),gte(lifecycleEvents.created_at,plus(now(),-cfg.sourceWindowSeconds))));
      if(recent.length>=cfg.sourceAttemptMax) reject('access.lifecycle_denied');
      const token=newBearer(entropy);
      const next=await update(tx,r,{state:r.state==='issued'?'claimed':r.state,candidate_verifier:secretDigest('lifecycle_candidate_v1',token),
        candidate_account_id:launch.account_id,candidate_identity_id:launch.external_identity_id,candidate_launch_id:r.candidate_launch_id??launch.launch_id});
      await consumeLaunch(tx,launch.launch_id); await event(tx,next,'claim');
      return withSecret({ok:true as const,request:publicRequest(next)},'bearer',token);
    }));
  }
  async function approveInvitation(bearer:unknown,input:unknown) {
    return safe(async()=>{
      const req=closedObject(input,['request_id','expected_revision','candidate_account_id','pin','operation_id']);
      const id=entityId(req.request_id),expected=revision(req.expected_revision),candidate=entityId(req.candidate_account_id),op=entityId(req.operation_id);
      const intent=['approve_invite',id,expected,candidate,op],d=digest(intent);
      return withFreshPin(bearer,req.pin,intent,async(tx,source)=>{
        if(await replay(tx,op,source.binding.id,d)) return {ok:true as const};
        const r=await load(tx,id,expected,false,source.binding.family_id); await issuer(tx,r);
        if(!['invite_child','invite_adult'].includes(r.kind)||r.state!=='claimed'||r.candidate_account_id!==candidate) reject('access.lifecycle_denied');
        await family.validSource(tx,r.candidate_account_id!,r.candidate_identity_id!);
        if(r.kind==='invite_child') await childTarget(tx,r.family_id,r.target_profile_id!,r.target_profile_revision!);
        const next=await update(tx,r,{state:'approved',basis:'adult',approver_binding_id:source.binding.id,approver_revision:source.binding.state_revision,
          approver_protection_revision:source.protection!.credential_revision,approved_at:now()});
        await event(tx,next,'approve','accepted',source.binding.id,op,d); return {ok:true as const};
      });
    });
  }
  async function consumeInvitation(bearer:unknown,input:unknown) {
    return safe(()=>db.transaction(async tx=>{
      const req=closedObject(input,['expected_revision','display_name']),expected=revision(req.expected_revision);
      if(typeof req.display_name!=='string'||req.display_name.length<1||req.display_name.length>100||req.display_name.includes('\0')) reject('access.lifecycle_denied');
      const displayName=req.display_name;
      const r=await byBearer(tx,bearer,undefined,true);
      if(!['invite_child','invite_adult'].includes(r.kind)) reject('access.lifecycle_denied');
      if(r.state==='consumed') return {ok:true as const,binding_id:r.result_binding_id!};
      if(r.state!=='approved'||r.state_revision!==expected||r.basis!=='adult') reject('access.lifecycle_denied');
      await issuer(tx,r); await validAdult(tx,r.approver_binding_id!,r.family_id,r.approver_revision!,r.approver_protection_revision!);
      let profileId=r.target_profile_id;
      if(r.kind==='invite_child') await childTarget(tx,r.family_id,profileId!,r.target_profile_revision!);
      else {
        const p={...mutable(),family_id:r.family_id,display_name:displayName,family_role:'parent' as const,status:'active' as const,archived_at:null,left_at:null};
        await tx.insert(memberProfiles).values(p); profileId=p.id;
      }
      const binding=await newBinding(tx,r.family_id,r.candidate_account_id!,profileId!,r.kind==='invite_child'?'own_child':'adult_membership');
      const next=await update(tx,r,{state:'consumed',closed_at:now(),result_binding_id:binding.id});
      await bumpFamily(tx,r.family_id); await event(tx,next,'consume','accepted',null,r.id); return {ok:true as const,binding_id:binding.id};
    }));
  }
  async function leave(tx:FamilyTransaction,b:Binding) {
    const others=await tx.select({id:accessBindings.id}).from(accessBindings).where(and(eq(accessBindings.family_id,b.family_id),eq(accessBindings.kind,'adult_membership'),eq(accessBindings.status,'active')));
    let eligible=false;
    for(const other of others) if(other.id!==b.id) {
      try {await validAdult(tx,other.id,b.family_id); eligible=true;break;} catch { /* Pending/disabled participants cannot inherit management. */ }
    }
    if(!eligible) reject('access.lifecycle_denied');
    await revokeParticipation(tx,b);
    await tx.update(memberProfiles).set({status:'left',left_at:now(),updated_at:now(),state_revision:sql`${memberProfiles.state_revision}+1`}).where(and(eq(memberProfiles.family_id,b.family_id),eq(memberProfiles.id,b.profile_id)));
    await bumpFamily(tx,b.family_id);
  }
  async function leaveFamily(bearer:unknown,input:unknown) {
    return safe(async()=>{
      const req=closedObject(input,['pin','expected_binding_revision','operation_id']),expected=revision(req.expected_binding_revision),op=entityId(req.operation_id);
      const intent=['leave',expected,op],d=digest(intent);
      return withFreshPin(bearer,req.pin,intent,async(tx,source)=>{
        if(source.binding.state_revision!==expected) reject('access.lifecycle_denied');
        await leave(tx,source.binding);
        await tx.insert(lifecycleEvents).values(parseLifecycleRecord('event',{...base(),family_id:source.binding.family_id,request_id:null,actor_binding_id:source.binding.id,
          candidate_account_id:null,action:'leave',outcome:'accepted',policy_revision:cfg.family.policyRevision,operation_id:op,request_digest:d}));
        return {ok:true as const};
      });
    });
  }
  async function requestExclusion(bearer:unknown,input:unknown) {
    return safe(async()=>{
      const req=closedObject(input,['pin','target_binding_id','expected_revision','operation_id']),targetId=entityId(req.target_binding_id),expected=revision(req.expected_revision),op=entityId(req.operation_id);
      const intent=['exclusion',targetId,expected,op],d=digest(intent);
      return withFreshPin(bearer,req.pin,intent,async(tx,source)=>{
        if(await replay(tx,op,source.binding.id,d)) return {ok:true as const};
        const {b}=await validAdult(tx,targetId,source.binding.family_id,expected);
        if(b.id===source.binding.id) reject('access.lifecycle_denied');
        const recent=await tx.select({id:lifecycleRequests.id}).from(lifecycleRequests).where(and(eq(lifecycleRequests.issuer_binding_id,source.binding.id),gte(lifecycleRequests.created_at,plus(now(),-cfg.sourceWindowSeconds))));
        if(recent.length>=cfg.sourceAttemptMax) reject('access.lifecycle_denied');
        const profile=await activeProfile(tx,b.family_id,b.profile_id);
        const r=parseLifecycleRecord('request',{...mutable(),...empty(),family_id:b.family_id,kind:'exclusion',state:'issued',policy_revision:cfg.family.policyRevision,
          request_digest:d,expires_at:plus(now(),cfg.setupSeconds),target_binding_id:b.id,target_revision:b.state_revision,target_profile_id:b.profile_id,target_profile_revision:profile.state_revision,
          issuer_binding_id:source.binding.id,issuer_revision:source.binding.state_revision,issuer_protection_revision:source.protection!.credential_revision});
        await tx.insert(lifecycleRequests).values(r); await event(tx,r,'request','accepted',source.binding.id,op,d);
        return {ok:true as const,request:publicRequest(r)};
      });
    });
  }
  async function consentExclusion(bearer:unknown,input:unknown) {
    return safe(async()=>{
      const req=closedObject(input,['pin','request_id','expected_revision','operation_id']),id=entityId(req.request_id),expected=revision(req.expected_revision),op=entityId(req.operation_id);
      const intent=['consent_exclusion',id,expected,op],d=digest(intent);
      return withFreshPin(bearer,req.pin,intent,async(tx,source)=>{
        const r=await load(tx,id,expected,false,source.binding.family_id);
        if(r.kind!=='exclusion'||r.state!=='issued'||r.target_binding_id!==source.binding.id) reject('access.lifecycle_denied');
        await target(tx,r); await issuer(tx,r); await leave(tx,source.binding);
        const [row]=await tx.select().from(lifecycleRequests).where(eq(lifecycleRequests.id,r.id));
        const next=await update(tx,lifecycleRecordToDto('request',row),{state:'consumed',closed_at:now()});
        await event(tx,next,'exclude','accepted',source.binding.id,op,d); return {ok:true as const};
      });
    });
  }
  async function getRequest(bearer:unknown) {
    return safe(()=>db.transaction(async tx=>({ok:true as const,request:publicRequest(await byBearer(tx,bearer,undefined,true))})));
  }
  async function inspectRequest(bearer:unknown,input:unknown) {
    return safe(()=>db.transaction(async tx=>{
      const req=closedObject(input,['request_id']),id=entityId(req.request_id);
      await policy.assertActive(tx);const actor=await family.resolveLocked(tx,bearer);
      if(actor.mode!=='adult') reject('access.lifecycle_denied');
      const r=await load(tx,id,undefined,false,actor.family_id);
      if(r.kind==='exclusion'&&actor.binding_id!==r.issuer_binding_id&&actor.binding_id!==r.target_binding_id) reject('access.lifecycle_denied');
      let candidate:null|{account_id:string;provider:string;subject:string}=null;
      if(r.candidate_account_id) {
        await family.validSource(tx,r.candidate_account_id,r.candidate_identity_id!);
        const [identity]=await tx.select().from(externalIdentities).where(eq(externalIdentities.id,r.candidate_identity_id!));
        candidate={account_id:r.candidate_account_id,provider:identity.provider,subject:identity.subject};
      }
      return {ok:true as const,request:publicRequest(r),candidate};
    }));
  }
  async function cancelRequest(bearer:unknown,input:unknown) {
    return safe(async()=>{
      const req=closedObject(input,['request_id','expected_revision','pin','operation_id']),id=entityId(req.request_id),expected=revision(req.expected_revision),op=entityId(req.operation_id);
      const intent=['cancel_request',id,expected,op],d=digest(intent);
      return withFreshPin(bearer,req.pin,intent,async(tx,source)=>{
        if(await replay(tx,op,source.binding.id,d)) return {ok:true as const};
        const r=await load(tx,id,expected,false,source.binding.family_id);
        if(r.issuer_binding_id!==source.binding.id&&r.approver_binding_id!==source.binding.id&&r.target_binding_id!==source.binding.id) reject('access.lifecycle_denied');
        const next=await update(tx,r,{state:'revoked',closed_at:now()});await event(tx,next,'cancel','accepted',source.binding.id,op,d);return {ok:true as const};
      });
    });
  }
  async function getOperation(launchBearer:unknown,input:unknown) {
    return safe(()=>db.transaction(async tx=>{
      const req=closedObject(input,['operation_id']),id=entityId(req.operation_id);
      const [receipt]=await tx.select().from(lifecycleEvents).where(eq(lifecycleEvents.operation_id,id));
      if(!receipt||!receipt.actor_binding_id) reject('access.lifecycle_denied');
      await policy.assertActive(tx);await family.lockFamily(tx,receipt.family_id);
      const launch=await exchange.lockLaunch(tx,launchBearer);
      const [actor]=await tx.select().from(accessBindings).where(and(eq(accessBindings.family_id,receipt.family_id),eq(accessBindings.id,receipt.actor_binding_id)));
      if(!actor||actor.account_id!==launch.account_id) reject('access.lifecycle_denied');
      return {ok:true as const,operation_id:id,request_id:receipt.request_id,action:receipt.action,outcome:receipt.outcome};
    }));
  }
  async function revokeAdultSessions(bearer:unknown,input:unknown) {
    return safe(async()=>{
      const req=closedObject(input,['target_binding_id','expected_revision','pin','operation_id']),targetId=entityId(req.target_binding_id),expected=revision(req.expected_revision),op=entityId(req.operation_id);
      const intent=['revoke_adult_sessions',targetId,expected,op],d=digest(intent);
      return withFreshPin(bearer,req.pin,intent,async(tx,source)=>{
        if(await replay(tx,op,source.binding.id,d)) return {ok:true as const};
        const {b}=await validAdult(tx,targetId,source.binding.family_id,expected);
        if(b.id===source.binding.id) reject('access.lifecycle_denied');
        const prior=await tx.select({id:accessOperations.id}).from(accessOperations).where(and(eq(accessOperations.family_id,b.family_id),
          eq(accessOperations.actor_binding_id,source.binding.id),eq(accessOperations.target_binding_id,b.id),gte(accessOperations.created_at,plus(now(),-cfg.revokePairSeconds))));
        if(prior.length) reject('access.lifecycle_denied');
        const contexts=await tx.select({id:sessionContexts.id}).from(sessionContexts).where(and(eq(sessionContexts.family_id,b.family_id),eq(sessionContexts.binding_id,b.id)));
        await family.revokeContexts(tx,b.family_id,contexts.map(c=>c.id));
        await tx.insert(accessOperations).values(parseAdultRecord('operation',{...base(),id:op,family_id:b.family_id,actor_binding_id:source.binding.id,target_binding_id:b.id,action:'revoke_session',request_digest:d}));
        await tx.insert(lifecycleEvents).values(parseLifecycleRecord('event',{...base(),family_id:b.family_id,request_id:null,actor_binding_id:source.binding.id,candidate_account_id:null,
          action:'sessions',outcome:'accepted',policy_revision:cfg.family.policyRevision,operation_id:op,request_digest:d}));
        return {ok:true as const};
      });
    });
  }
  return Object.freeze({beginRecovery,authorizeRecoveryCode,approveRecovery,completeRecovery,issueInvitation,claimInvitation,
    approveInvitation,consumeInvitation,leaveFamily,requestExclusion,consentExclusion,revokeAdultSessions,getRequest,inspectRequest,cancelRequest,getOperation,adult});
}
