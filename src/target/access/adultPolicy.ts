import { eq, sql } from 'drizzle-orm';
import type { openTargetDatabase } from '../db/database';
import { familySecurityPolicy } from '../db/schema/adultProtection';
import { parseAdultRecord, adultRecordToDto } from '../contracts/adultProtection';
import { closedObject, reject } from '../contracts/errors';
import { newEntityId, revision } from '../contracts/ids';
import { instant, key } from '../contracts/foundation';
import { familyPolicyDigest, type FamilySessionConfig, type FamilyTransaction } from './familySession';
import { pinKdfId, secretDigest } from './adultCrypto';

type Database = Awaited<ReturnType<typeof openTargetDatabase>>['db'];
export interface AdultSecurityConfig {
  readonly family: FamilySessionConfig;
  readonly pepperKeyId: string;
  readonly setupSeconds: number;
  readonly adultGrantSeconds: number;
  readonly adultIdleSeconds: number;
  readonly freshSeconds: number;
  readonly failedShortMax: number;
  readonly shortWindowSeconds: number;
  readonly pauseSeconds: number;
  readonly failedDailyMax: number;
  readonly dailyWindowSeconds: number;
  readonly sourceAttemptMax: number;
  readonly sourceWindowSeconds: number;
  readonly revokePairSeconds: number;
}
const durationFields = ['setupSeconds','adultGrantSeconds','adultIdleSeconds','freshSeconds','shortWindowSeconds','pauseSeconds',
  'dailyWindowSeconds','sourceWindowSeconds','revokePairSeconds'] as const;
const countFields = ['failedShortMax','failedDailyMax','sourceAttemptMax'] as const;
export function parseAdultConfig(input: AdultSecurityConfig): AdultSecurityConfig {
  const row = closedObject(input,['family','pepperKeyId',...durationFields,...countFields]);
  const family = closedObject(row.family,['policyId','policyRevision','ownChildTtlSeconds','retentionId','retentionRevision','now']);
  key(family.policyId); revision(family.policyRevision); key(family.retentionId); revision(family.retentionRevision);
  if (typeof family.now !== 'function' || !Number.isSafeInteger(family.ownChildTtlSeconds)
    || (family.ownChildTtlSeconds as number) < 1 || (family.ownChildTtlSeconds as number) > 86400) reject('adult.config_invalid');
  key(row.pepperKeyId);
  for (const name of durationFields) if (!Number.isSafeInteger(row[name]) || (row[name] as number) < 1 || (row[name] as number) > 86400) reject('adult.config_invalid');
  for (const name of countFields) if (!Number.isSafeInteger(row[name]) || (row[name] as number) < 1 || (row[name] as number) > 100) reject('adult.config_invalid');
  if (!(row.freshSeconds! <= row.adultIdleSeconds! && row.adultIdleSeconds! <= row.adultGrantSeconds!
    && row.adultGrantSeconds! <= family.ownChildTtlSeconds! && row.shortWindowSeconds! <= row.dailyWindowSeconds!
    && row.sourceWindowSeconds! <= row.dailyWindowSeconds! && row.failedShortMax! <= row.failedDailyMax!)) reject('adult.config_invalid');
  return Object.freeze({ ...row, family: Object.freeze({ ...family }) }) as unknown as AdultSecurityConfig;
}

export function createAdultPolicy(db: Database, cfg: AdultSecurityConfig, pepper: Uint8Array) {
  if (!(pepper instanceof Uint8Array) || pepper.byteLength !== 32) reject('adult.pepper_required');
  const familyDigest = familyPolicyDigest(cfg.family);
  // G03-F adds restricted recovery setup semantics. Mixed older binaries must not
  // share authority after cutover; activation therefore requires a new policy revision.
  const digest = secretDigest('adult_security_policy_v1', JSON.stringify(['g03_f_lifecycle_v1',familyDigest, cfg.pepperKeyId, pinKdfId,
    secretDigest('pepper_fingerprint_v1',Buffer.from(pepper).toString('hex')),
    ...durationFields.map(k => [k,cfg[k]]), ...countFields.map(k => [k,cfg[k]])]));
  const now = () => {
    const time = cfg.family.now();
    if (!Number.isSafeInteger(time) || time < 0) reject('adult.clock_invalid');
    return instant(new Date(time).toISOString());
  };
  const base = (time = now()) => ({ id: newEntityId(), schema_version: 1, created_at: time,
    retention_policy_id: cfg.family.retentionId, retention_policy_revision: cfg.family.retentionRevision });
  const mutable = (time = now()) => ({ ...base(time), updated_at: time, state_revision: 1 });
  async function assertActive(tx: FamilyTransaction) {
    const [stored] = await tx.select().from(familySecurityPolicy).where(eq(familySecurityPolicy.scope,'family_access')).for('share');
    if (!stored) reject('adult.policy_mismatch');
    const head = adultRecordToDto('policy',stored);
    if (head.security_digest !== digest || head.family_policy_digest !== familyDigest || head.policy_revision !== cfg.family.policyRevision
      || head.policy_id !== cfg.family.policyId || now() < head.updated_at) reject('adult.policy_mismatch');
    return head;
  }
  async function activate(expectedRevision: number) {
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) reject('adult.policy_conflict');
    return db.transaction(async tx => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(473031, 1)`);
      const [stored] = await tx.select().from(familySecurityPolicy).where(eq(familySecurityPolicy.scope,'family_access')).for('update');
      const time = now();
      if (!stored) {
        if (expectedRevision !== 0) reject('adult.policy_conflict');
        await tx.insert(familySecurityPolicy).values(parseAdultRecord('policy',{ ...mutable(time),scope:'family_access',policy_id:cfg.family.policyId,
          policy_revision:cfg.family.policyRevision,family_policy_digest:familyDigest,security_digest:digest,pepper_key_id:cfg.pepperKeyId,activated_at:time }));
        return Object.freeze({ ok: true as const, revision: 1 });
      }
      const head = adultRecordToDto('policy',stored);
      if (head.state_revision !== expectedRevision || time < head.updated_at) reject('adult.policy_conflict');
      if (head.security_digest === digest) return Object.freeze({ ok:true as const,revision:head.state_revision });
      if (cfg.family.policyId !== head.policy_id || cfg.family.policyRevision <= head.policy_revision || time <= head.activated_at) reject('adult.policy_conflict');
      const updated = parseAdultRecord('policy',{ ...head,updated_at:time,activated_at:time,state_revision:head.state_revision+1,
        policy_revision:cfg.family.policyRevision,family_policy_digest:familyDigest,security_digest:digest,pepper_key_id:cfg.pepperKeyId });
      await tx.update(familySecurityPolicy).set(updated).where(eq(familySecurityPolicy.id,head.id));
      return Object.freeze({ ok:true as const,revision:updated.state_revision });
    });
  }
  return Object.freeze({ assertActive,activate,now,base,mutable });
}
