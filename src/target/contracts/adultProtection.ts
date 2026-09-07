import { closedObject, reject } from './errors';
import { entityId, revision } from './ids';
import { instant, key } from './foundation';
import type { familySecurityPolicy, launchConsumptions, adultProtections, adultRecoveryCredentials,
  adultSetups, adultAttempts, adultActionProofs, accessOperations, accessAuditEvents } from '../db/schema/adultProtection';

export interface AdultRecords {
  policy: typeof familySecurityPolicy.$inferSelect;
  consumption: typeof launchConsumptions.$inferSelect;
  protection: typeof adultProtections.$inferSelect;
  recovery: typeof adultRecoveryCredentials.$inferSelect;
  setup: typeof adultSetups.$inferSelect;
  attempt: typeof adultAttempts.$inferSelect;
  proof: typeof adultActionProofs.$inferSelect;
  operation: typeof accessOperations.$inferSelect;
  audit: typeof accessAuditEvents.$inferSelect;
}
const base = ['id','schema_version','created_at','retention_policy_id','retention_policy_revision'];
const mutable = ['state_revision','updated_at'];
const binding = ['family_id','account_id','profile_id','binding_id','binding_kind'];
const fields = {
  policy: [...mutable,'scope','policy_id','policy_revision','family_policy_digest','security_digest','pepper_key_id','activated_at'],
  consumption: ['launch_id','purpose'],
  protection: [...mutable,...binding,'credential_revision','status','kdf_id','pin_salt','pin_verifier','pepper_key_id','recovery_ack_at','revoked_at'],
  recovery: [...mutable,'family_id','binding_id','protection_id','credential_revision','verifier','verifier_version','acknowledged_at','revoked_at'],
  setup: [...mutable,...binding,'binding_revision','external_identity_id','launch_id','token_verifier','verifier_version','policy_revision','state','protection_id','expires_at','revoked_at'],
  attempt: [...mutable,...binding,'protection_id','credential_revision','policy_revision','launch_id','setup_id','session_id','purpose','intent_digest','outcome','finished_at'],
  proof: [...mutable,...binding,'protection_id','credential_revision','policy_revision','session_id','session_revision','source_verifier_id','source_verifier_revision',
    'attempt_id','operation_id','action','target_session_id','target_binding_id','expected_revision','token_verifier','verifier_version','expires_at','consumed_at'],
  operation: ['family_id','actor_binding_id','target_binding_id','action','request_digest'],
  audit: [...binding,'action','outcome','policy_revision','attempt_id','operation_id'],
};
const idFields = ['family_id','account_id','profile_id','binding_id','launch_id','protection_id','external_identity_id','setup_id','session_id',
  'source_verifier_id','attempt_id','operation_id','target_session_id','target_binding_id','actor_binding_id'];
const nullableIds: Partial<Record<keyof AdultRecords, string[]>> = {
  setup: ['protection_id'], attempt: ['protection_id','launch_id','setup_id','session_id'], proof: ['target_session_id','target_binding_id'], audit: ['attempt_id','operation_id'],
};
const finishedOutcomes = ['accepted','denied','stale','unavailable'];
const actions = ['begin_setup','prepare_setup','rotate_recovery','recovery_ack','login','switch','fresh','revoke_session','revoke_binding'];

export function parseAdultRecord<K extends keyof AdultRecords>(kind: K, input: unknown): Readonly<AdultRecords[K]> {
  if (!Object.hasOwn(fields,kind)) reject('contract.record_kind_invalid');
  const row = closedObject(input,[...base,...fields[kind]]);
  entityId(row.id); key(row.retention_policy_id); revision(row.retention_policy_revision);
  if (row.schema_version !== 1) reject('contract.schema_unsupported');
  const created = instant(row.created_at), updated = Object.hasOwn(row,'updated_at') ? instant(row.updated_at) : created;
  if (updated < created) reject('contract.time_order_invalid');
  for (const name of idFields) if (Object.hasOwn(row,name)) {
    if (row[name] === null && nullableIds[kind]?.includes(name)) continue;
    entityId(row[name]);
  }
  for (const name of Object.keys(row).filter(k => k.endsWith('_revision') || k === 'expected_revision')) {
    if (kind === 'attempt' && name === 'credential_revision' && row[name] === null && row.protection_id === null) continue;
    revision(row[name]);
  }
  if (Object.hasOwn(row,'binding_kind') && row.binding_kind !== 'adult_membership') reject('contract.role_invalid');
  for (const name of ['policy_id','pepper_key_id']) if (Object.hasOwn(row,name)) key(row[name]);
  for (const name of ['family_policy_digest','security_digest','pin_verifier','token_verifier','verifier','intent_digest','request_digest']) {
    if (Object.hasOwn(row,name) && (typeof row[name] !== 'string' || !/^[a-f0-9]{64}$/.test(row[name] as string))) reject('contract.digest_invalid');
  }
  for (const name of ['activated_at','recovery_ack_at','revoked_at','acknowledged_at','finished_at','consumed_at']) {
    if (Object.hasOwn(row,name) && row[name] !== null) {
      const value = instant(row[name]); if (value < created || value > updated) reject('contract.time_order_invalid');
    }
  }
  if (Object.hasOwn(row,'expires_at') && instant(row.expires_at) <= created) reject('contract.time_order_invalid');
  if (Object.hasOwn(row,'verifier_version') && row.verifier_version !== 1) reject('contract.schema_unsupported');
  if (kind === 'policy') {
    if (row.scope !== 'family_access') reject('contract.policy_invalid');
    instant(row.activated_at);
  } else if (kind === 'consumption') {
    if (!['own_child','adult_login','adult_setup'].includes(row.purpose as string)) reject('contract.purpose_invalid');
  } else if (kind === 'protection') {
    if (row.kdf_id !== 'argon2id_v19_19m_t2_p1' || typeof row.pin_salt !== 'string' || !/^[a-f0-9]{32}$/.test(row.pin_salt)) reject('contract.verifier_invalid');
    if (!(row.status === 'pending' && row.recovery_ack_at === null && row.revoked_at === null)
      && !(row.status === 'active' && row.recovery_ack_at !== null && row.revoked_at === null)
      && !(row.status === 'revoked' && row.revoked_at !== null)) reject('contract.state_invalid');
  } else if (kind === 'setup') {
    if (!(row.state === 'awaiting_pin' && row.protection_id === null && row.revoked_at === null)
      && !(row.state === 'awaiting_recovery' && row.protection_id !== null && row.revoked_at === null)
      && !(row.state === 'completed' && row.protection_id !== null && row.revoked_at !== null)
      && !(row.state === 'revoked' && row.revoked_at !== null)) reject('contract.state_invalid');
  } else if (kind === 'attempt') {
    if ((row.protection_id === null) !== (row.credential_revision === null)) reject('contract.revision_invalid');
    if (['launch_id','setup_id','session_id'].filter(k => row[k] !== null).length !== 1) reject('contract.source_invalid');
    if (!(['prepare_setup','recovery_ack'].includes(row.purpose as string) && row.setup_id !== null)
      && !(row.purpose === 'login' && row.launch_id !== null)
      && !(['switch','fresh'].includes(row.purpose as string) && row.session_id !== null)) reject('contract.source_invalid');
    if (!(row.outcome === 'pending' && row.finished_at === null)
      && !(finishedOutcomes.includes(row.outcome as string) && row.finished_at !== null)) reject('contract.state_invalid');
  } else if (kind === 'proof') {
    if (!(row.action === 'revoke_session' && row.target_session_id !== null && row.target_binding_id === null)
      && !(row.action === 'revoke_binding' && row.target_binding_id !== null && row.target_session_id === null)) reject('contract.action_invalid');
  } else if (kind === 'operation') {
    if (!['revoke_session','revoke_binding'].includes(row.action as string)) reject('contract.action_invalid');
  } else if (kind === 'audit' && (!actions.includes(row.action as string) || !finishedOutcomes.includes(row.outcome as string))) reject('contract.action_invalid');
  return Object.freeze({ ...row }) as unknown as Readonly<AdultRecords[K]>;
}

export function adultRecordToDto<K extends keyof AdultRecords>(kind: K, input: Record<string,unknown>) {
  const row = { ...input };
  for (const name of Object.keys(row).filter(k => k.endsWith('_at'))) {
    if (row[name] !== null) {
      if (typeof row[name] !== 'string' || !Number.isFinite(Date.parse(row[name]))) reject('contract.instant_invalid');
      row[name] = new Date(row[name] as string).toISOString();
    }
  }
  return parseAdultRecord(kind,row);
}
