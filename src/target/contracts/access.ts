import { closedObject, reject } from './errors';
import { entityId, revision } from './ids';
import { instant, key } from './foundation';
import type { externalIdentities, accessLaunches, identityExchangeReceipts, identityExchangePolicy } from '../db/schema/access';

export interface AccessRecordMap {
  external_identity: typeof externalIdentities.$inferSelect;
  access_launch: typeof accessLaunches.$inferSelect;
  exchange_receipt: typeof identityExchangeReceipts.$inferSelect;
  exchange_policy: typeof identityExchangePolicy.$inferSelect;
}
const baseKeys = ['id','schema_version','created_at','retention_policy_id','retention_policy_revision'];
const mutableKeys = ['state_revision','updated_at'];
const fields = {
  external_identity: [...mutableKeys,'account_id','provider','subject','verified_at','revoked_at'],
  access_launch: [...mutableKeys,'account_id','external_identity_id','token_verifier','verifier_version','expires_at','revoked_at'],
  exchange_receipt: ['replay_fingerprint','launch_id','verification_policy_id','verification_policy_revision','authenticated_at','cleanup_after'],
  exchange_policy: [...mutableKeys,'scope','environment','bot_id','policy_digest','verification_policy_id','verification_policy_revision','activated_at','auth_date_floor'],
};
export function parseAccessRecord<K extends keyof AccessRecordMap>(kind: K, input: unknown): Readonly<AccessRecordMap[K]> {
  if (!Object.hasOwn(fields, kind)) return reject('contract.record_kind_invalid');
  const row = closedObject(input, [...baseKeys, ...fields[kind]]);
  entityId(row.id); instant(row.created_at); key(row.retention_policy_id); revision(row.retention_policy_revision);
  if (row.schema_version !== 1) reject('contract.schema_unsupported');
  if (kind !== 'exchange_receipt') {
    revision(row.state_revision); instant(row.updated_at);
    if ((row.updated_at as string) < (row.created_at as string)) reject('contract.time_order_invalid');
  }
  for (const name of ['account_id','external_identity_id','launch_id']) if (Object.hasOwn(row, name)) entityId(row[name]);
  const within = (name: string) => {
    const time = instant(row[name]);
    if (time < (row.created_at as string) || time > (row.updated_at as string)) reject('contract.time_order_invalid');
  };
  const hash = (value: unknown) => {
    if (typeof value !== 'string' || !/^[0-9a-f]{64}$/.test(value)) reject('contract.digest_invalid');
  };
  const subject = (value: unknown) => {
    if (typeof value !== 'string' || !/^[1-9][0-9]{0,15}$/.test(value)
      || !Number.isSafeInteger(Number(value))) reject('contract.subject_invalid');
  };
  if (Object.hasOwn(row, 'revoked_at') && row.revoked_at !== null) within('revoked_at');
  if (kind === 'external_identity') {
    if (row.provider !== 'telegram') reject('contract.provider_invalid');
    subject(row.subject); within('verified_at');
  } else if (kind === 'access_launch') {
    hash(row.token_verifier);
    if (row.verifier_version !== 1) reject('contract.schema_unsupported');
    if (instant(row.expires_at) <= (row.created_at as string)) reject('contract.time_order_invalid');
  } else {
    key(row.verification_policy_id); revision(row.verification_policy_revision);
    if (kind === 'exchange_receipt') {
      hash(row.replay_fingerprint);
      if (instant(row.cleanup_after) <= instant(row.authenticated_at)
        || (row.cleanup_after as string) < (row.created_at as string)) reject('contract.time_order_invalid');
    } else {
      if (row.scope !== 'telegram' || !['test','production'].includes(row.environment as string)) reject('contract.scope_invalid');
      subject(row.bot_id); hash(row.policy_digest); within('activated_at');
      const floor = Date.parse(instant(row.auth_date_floor)), activated = Date.parse(row.activated_at as string);
      if (floor < Math.floor(activated / 1000) * 1000 || floor > activated + 1000) reject('contract.time_order_invalid');
    }
  }
  return Object.freeze({ ...row }) as unknown as Readonly<AccessRecordMap[K]>;
}

export function accessRecordToDto<K extends keyof AccessRecordMap>(kind: K, input: Record<string, unknown>) {
  const row = { ...input };
  for (const field of ['created_at','updated_at','verified_at','revoked_at','expires_at','authenticated_at','cleanup_after','activated_at','auth_date_floor']) {
    if (Object.hasOwn(row, field) && row[field] !== null) {
      if (typeof row[field] !== 'string' || !Number.isFinite(Date.parse(row[field]))) reject('contract.instant_invalid');
      row[field] = new Date(row[field] as string).toISOString();
    }
  }
  return parseAccessRecord(kind, row);
}
