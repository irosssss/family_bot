import { closedObject, reject } from './errors';
import { entityId, revision } from './ids';
import { instant, key } from './foundation';
import type { accessBindings,sessionContexts,sessionTokenVerifiers } from '../db/schema/familyAccess';

export interface FamilyAccessRecords {
  binding: typeof accessBindings.$inferSelect;
  session: typeof sessionContexts.$inferSelect;
  verifier: typeof sessionTokenVerifiers.$inferSelect;
}
const common = ['id','schema_version','created_at','retention_policy_id','retention_policy_revision','updated_at','state_revision','family_id'];
const fields = {
  binding: ['account_id','profile_id','profile_role','kind','manager_binding_id','manager_kind','status','revoked_at','origin_invitation_id'],
  session: ['account_id','external_identity_id','profile_id','binding_id','binding_kind','binding_revision','mode','parent_session_id','parent_mode',
    'parent_binding_id','parent_binding_kind','origin_launch_id','expires_at','revoked_at','adult_verified_at','adult_grant_expires_at','adult_idle_expires_at',
    'protection_revision','policy_id','policy_revision','policy_digest'],
  verifier: ['session_id','token_verifier','verifier_version','retired_at'],
};
export function parseFamilyAccessRecord<K extends keyof FamilyAccessRecords>(kind: K,input: unknown): Readonly<FamilyAccessRecords[K]> {
  if (!Object.hasOwn(fields,kind)) reject('contract.record_kind_invalid');
  const row = closedObject(input,[...common,...fields[kind]]);
  if (row.schema_version !== 1) reject('contract.schema_unsupported');
  entityId(row.id); entityId(row.family_id); key(row.retention_policy_id); revision(row.retention_policy_revision); revision(row.state_revision);
  const created = instant(row.created_at), updated = instant(row.updated_at);
  if (updated < created) reject('contract.time_order_invalid');
  for (const name of ['account_id','profile_id','session_id','binding_id','external_identity_id']) if (Object.hasOwn(row,name)) entityId(row[name]);
  const within = (name: string) => { const t = instant(row[name]); if (t < created || t > updated) reject('contract.time_order_invalid'); return t; };
  for (const name of ['revoked_at','retired_at']) if (Object.hasOwn(row,name) && row[name] !== null) within(name);
  const digest = (v: unknown) => { if (typeof v !== 'string' || !/^[a-f0-9]{64}$/.test(v)) reject('contract.digest_invalid'); };
  if (kind === 'binding') {
    if (!['adult_membership','own_child','managed_child'].includes(row.kind as string)
      || row.profile_role !== (row.kind === 'adult_membership' ? 'parent' : 'child')) reject('contract.role_invalid');
    if (row.kind === 'managed_child') {
      entityId(row.manager_binding_id);
      if (row.manager_kind !== 'adult_membership' || row.manager_binding_id === row.id) reject('contract.lineage_invalid');
    } else if (row.manager_binding_id !== null || row.manager_kind !== null) reject('contract.lineage_invalid');
    if (!['active','revoked'].includes(row.status as string) || (row.status === 'active') !== (row.revoked_at === null)) reject('contract.state_invalid');
    if (row.origin_invitation_id !== null) reject('contract.invitation_not_supported');
  } else if (kind === 'verifier') {
    digest(row.token_verifier); if (row.verifier_version !== 1) reject('contract.schema_unsupported');
  } else {
    const mode = row.mode;
    if (!['adult','own_child','managed_child'].includes(mode as string)
      || row.binding_kind !== (mode === 'adult' ? 'adult_membership' : mode)) reject('contract.role_invalid');
    revision(row.binding_revision); revision(row.policy_revision); key(row.policy_id); digest(row.policy_digest);
    const expires = instant(row.expires_at); if (expires <= created) reject('contract.time_order_invalid');
    if (row.origin_launch_id !== null) entityId(row.origin_launch_id);
    if (mode === 'own_child' && row.origin_launch_id === null) reject('contract.launch_required');
    if (mode === 'managed_child') {
      entityId(row.parent_session_id); entityId(row.parent_binding_id);
      if (row.parent_session_id === row.id || row.parent_mode !== 'adult' || row.parent_binding_kind !== 'adult_membership'
        || row.origin_launch_id !== null) reject('contract.lineage_invalid');
    } else if (['parent_session_id','parent_mode','parent_binding_id','parent_binding_kind'].some(f => row[f] !== null)) reject('contract.lineage_invalid');
    if (mode === 'adult') {
      revision(row.protection_revision); const verified = within('adult_verified_at');
      const grant = instant(row.adult_grant_expires_at), idle = instant(row.adult_idle_expires_at);
      if (grant <= verified || grant > expires || idle <= verified || idle > grant) reject('contract.time_order_invalid');
    } else if (['protection_revision','adult_verified_at','adult_grant_expires_at','adult_idle_expires_at'].some(f => row[f] !== null)) reject('contract.role_invalid');
  }
  return Object.freeze({ ...row }) as unknown as Readonly<FamilyAccessRecords[K]>;
}
export function familyAccessRecordToDto<K extends keyof FamilyAccessRecords>(kind: K,input: Record<string,unknown>) {
  const row = { ...input };
  for (const name of ['created_at','updated_at','revoked_at','retired_at','expires_at','adult_verified_at','adult_grant_expires_at','adult_idle_expires_at']) {
    if (Object.hasOwn(row,name) && row[name] !== null) {
      if (typeof row[name] !== 'string' || !Number.isFinite(Date.parse(row[name]))) reject('contract.instant_invalid');
      row[name] = new Date(row[name] as string).toISOString();
    }
  }
  return parseFamilyAccessRecord(kind,row);
}
