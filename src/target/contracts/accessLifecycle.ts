import { closedObject, reject } from './errors';
import { entityId, revision } from './ids';
import { instant, key } from './foundation';
import type { lifecycleRequests, lifecycleEvents } from '../db/schema/accessLifecycle';

export interface LifecycleRecords { request:typeof lifecycleRequests.$inferSelect; event:typeof lifecycleEvents.$inferSelect }
const common=['id','schema_version','created_at','retention_policy_id','retention_policy_revision','family_id','request_digest','policy_revision'];
const fields={
  request:['updated_at','state_revision','kind','state','expires_at','closed_at','target_binding_id','target_revision','target_profile_id','target_profile_revision',
    'protection_id','protection_revision','issuer_binding_id','issuer_revision','issuer_protection_revision','invite_verifier','candidate_verifier',
    'candidate_account_id','candidate_identity_id','candidate_launch_id','basis','basis_credential_id','approver_binding_id','approver_revision','approver_protection_revision','approved_at','result_binding_id'],
  event:['request_id','actor_binding_id','candidate_account_id','action','outcome','operation_id'],
};
export function parseLifecycleRecord<K extends keyof LifecycleRecords>(kind:K,input:unknown):Readonly<LifecycleRecords[K]> {
  if (!Object.hasOwn(fields,kind)) reject('contract.record_kind_invalid');
  const r=closedObject(input,[...common,...fields[kind]]);
  if(r.schema_version!==1) reject('contract.schema_unsupported');
  for(const [name,value] of Object.entries(r)) {
    if(name==='retention_policy_id') key(value);
    else if(name==='id'||name.endsWith('_id')) {if(value!==null) entityId(value);}
    else if(name.endsWith('_revision')) {if(value!==null) revision(value);}
    else if(name.endsWith('_verifier')||name==='request_digest') {if(value!==null && (typeof value!=='string'||!/^[a-f0-9]{64}$/.test(value))) reject('contract.digest_invalid');}
  }
  const created=instant(r.created_at);
  if(kind==='request') {
    const updated=instant(r.updated_at); if(updated<created||instant(r.expires_at)<=created) reject('contract.time_order_invalid');
    for(const name of ['closed_at','approved_at']) if(r[name]!==null) {const t=instant(r[name]); if(t<created||t>updated) reject('contract.time_order_invalid');}
    const all=(names:string[],present:boolean)=>names.every(n=>present?r[n]!==null:r[n]===null);
    if(!['recovery','invite_child','invite_adult','exclusion'].includes(r.kind as string)) reject('contract.kind_invalid');
    const candidate=['candidate_verifier','candidate_account_id','candidate_identity_id','candidate_launch_id'];
    if(!all(candidate,true)&&!all(candidate,false)) reject('contract.source_invalid');
    if(['invite_child','invite_adult'].includes(r.kind as string)!==(r.invite_verifier!==null)
      ||r.kind==='recovery'&&r.candidate_account_id===null||r.kind==='exclusion'&&r.candidate_account_id!==null) reject('contract.source_invalid');
    if((r.result_binding_id!==null)!==(r.state==='consumed'&&r.kind!=='exclusion')
      ||r.state==='consumed'&&r.kind!=='exclusion'&&r.basis===null) reject('contract.state_invalid');
    if(r.kind==='recovery'||r.kind==='exclusion') {if(!all(['target_binding_id','target_revision','target_profile_id'],true)) reject('contract.target_invalid');}
    else if(r.target_binding_id!==null||r.target_revision!==null||(r.kind==='invite_child')!==(r.target_profile_id!==null)) reject('contract.target_invalid');
    if((r.target_profile_id!==null)!==(r.target_profile_revision!==null)) reject('contract.target_invalid');
    if(!all(['protection_id','protection_revision'],r.kind==='recovery')||!all(['issuer_binding_id','issuer_revision','issuer_protection_revision'],r.kind!=='recovery')) reject('contract.source_invalid');
    const approver=['approver_binding_id','approver_revision','approver_protection_revision'];
    if(r.basis===null) {if(!all(approver,false)||r.approved_at!==null) reject('contract.approval_invalid');}
    else if(r.basis==='code') {if(r.kind!=='recovery'||!all(approver,false)||r.approved_at===null) reject('contract.approval_invalid');}
    else if(r.basis==='adult') {if(!all(approver,true)||r.approved_at===null) reject('contract.approval_invalid');}
    else reject('contract.approval_invalid');
    if((r.basis_credential_id!==null)!==(r.basis==='code')) reject('contract.approval_invalid');
    if(r.state==='issued') {if(r.kind==='recovery'||r.candidate_account_id!==null||r.basis!==null||r.closed_at!==null) reject('contract.state_invalid');}
    else if(r.state==='claimed') {if(r.candidate_account_id===null||r.basis!==null||r.closed_at!==null) reject('contract.state_invalid');}
    else if(r.state==='approved') {if(r.basis===null||r.closed_at!==null) reject('contract.state_invalid');}
    else if(['consumed','revoked'].includes(r.state as string)) {if(r.closed_at===null) reject('contract.state_invalid');}
    else reject('contract.state_invalid');
  } else if(!['request','code','prepare','approve','consume','claim','leave','exclude','cancel','sessions'].includes(r.action as string)||!['accepted','denied'].includes(r.outcome as string)) reject('contract.event_invalid');
  return Object.freeze({...r}) as unknown as Readonly<LifecycleRecords[K]>;
}
export function lifecycleRecordToDto<K extends keyof LifecycleRecords>(kind:K,input:Record<string,unknown>) {
  const row={...input};
  for(const name of ['created_at','updated_at','expires_at','closed_at','approved_at']) if(Object.hasOwn(row,name)&&row[name]!==null) {
    if(typeof row[name]!=='string'||!Number.isFinite(Date.parse(row[name] as string))) reject('contract.instant_invalid');
    row[name]=new Date(row[name] as string).toISOString();
  }
  return parseLifecycleRecord(kind,row);
}
