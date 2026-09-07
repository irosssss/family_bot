import { sql } from 'drizzle-orm';
import { check, foreignKey, index, integer, unique, uuid } from 'drizzle-orm/pg-core';
import { accounts, foundationSchema, rpg, keyText, instant, identityRetention, mutable,
  commonConstraints, mutableConstraints, optionalTime } from './foundation';

export const externalIdentities = rpg.table('external_identities', {
  ...identityRetention(), ...mutable(), account_id: uuid('account_id').notNull(),
  provider: keyText('provider').notNull(), subject: keyText('subject').notNull(),
  verified_at: instant('verified_at').notNull(), revoked_at: instant('revoked_at'),
}, t => [
  ...mutableConstraints('external_identities', t),
  check('external_identities_provider', sql`${t.provider} = 'telegram'`),
  check('external_identities_subject', sql`${t.subject} ~ '^[1-9][0-9]{0,15}$' AND ${t.subject}::numeric <= 9007199254740991`),
  check('external_identities_verified', sql`isfinite(${t.verified_at}) AND ${t.verified_at} >= ${t.created_at} AND ${t.verified_at} <= ${t.updated_at}`),
  optionalTime('external_identities_revoked', t.revoked_at, t.created_at, t.updated_at),
  unique('external_identities_subject_uq').on(t.provider, t.subject),
  unique('external_identities_account_uq').on(t.id, t.account_id),
  foreignKey({ name: 'external_identities_account_fk', columns: [t.account_id], foreignColumns: [accounts.id] }).onDelete('no action').onUpdate('no action'),
]);

// Singleton deployment boundary. Changing policy requires explicit CAS activation;
// retained even after receipts expire, so policy widening cannot resurrect a replay.
export const identityExchangePolicy = rpg.table('identity_exchange_policy', {
  ...identityRetention(), ...mutable(), scope: keyText('scope').notNull(), environment: keyText('environment').notNull(),
  bot_id: keyText('bot_id').notNull(), policy_digest: keyText('policy_digest').notNull(),
  verification_policy_id: keyText('verification_policy_id').notNull(), verification_policy_revision: integer('verification_policy_revision').notNull(),
  activated_at: instant('activated_at').notNull(), auth_date_floor: instant('auth_date_floor').notNull(),
}, t => [
  ...mutableConstraints('identity_exchange_policy', t),
  unique('identity_exchange_policy_scope_uq').on(t.scope),
  check('identity_exchange_policy_scope', sql`${t.scope} = 'telegram' AND ${t.environment} IN ('test','production')`),
  check('identity_exchange_policy_bot', sql`${t.bot_id} ~ '^[1-9][0-9]{0,15}$' AND ${t.bot_id}::numeric <= 9007199254740991`),
  check('identity_exchange_policy_digest', sql`${t.policy_digest} ~ '^[0-9a-f]{64}$'`),
  check('identity_exchange_policy_revision', sql`${t.verification_policy_id} ~ '^[a-z][a-z0-9_]*$' AND ${t.verification_policy_revision} > 0`),
  check('identity_exchange_policy_time', sql`isfinite(${t.activated_at}) AND isfinite(${t.auth_date_floor})
    AND ${t.activated_at} >= ${t.created_at} AND ${t.activated_at} <= ${t.updated_at}
    AND ${t.auth_date_floor} >= date_trunc('second', ${t.activated_at})
    AND ${t.auth_date_floor} <= ${t.activated_at} + interval '1 second'`),
]);

export const accessLaunches = rpg.table('access_launches', {
  ...identityRetention(), ...mutable(), account_id: uuid('account_id').notNull(), external_identity_id: uuid('external_identity_id').notNull(),
  token_verifier: keyText('token_verifier').notNull(), verifier_version: integer('verifier_version').notNull(),
  expires_at: instant('expires_at').notNull(), revoked_at: instant('revoked_at'),
}, t => [
  ...mutableConstraints('access_launches', t),
  foreignKey({ name: 'access_launches_identity_account_fk', columns: [t.external_identity_id, t.account_id],
    foreignColumns: [externalIdentities.id, externalIdentities.account_id] }).onDelete('no action').onUpdate('no action'),
  unique('access_launches_verifier_uq').on(t.token_verifier),
  check('access_launches_verifier', sql`${t.token_verifier} ~ '^[0-9a-f]{64}$' AND ${t.verifier_version} = 1`),
  check('access_launches_expiry', sql`isfinite(${t.expires_at}) AND ${t.expires_at} > ${t.created_at}`),
  optionalTime('access_launches_revoked', t.revoked_at, t.created_at, t.updated_at),
  index('access_launches_expiry_idx').on(t.expires_at),
]);

export const identityExchangeReceipts = rpg.table('identity_exchange_receipts', {
  ...identityRetention(), replay_fingerprint: keyText('replay_fingerprint').notNull(), launch_id: uuid('launch_id').notNull(),
  verification_policy_id: keyText('verification_policy_id').notNull(), verification_policy_revision: integer('verification_policy_revision').notNull(),
  authenticated_at: instant('authenticated_at').notNull(), cleanup_after: instant('cleanup_after').notNull(),
}, t => [
  ...commonConstraints('identity_exchange_receipts', t),
  unique('identity_exchange_receipts_fingerprint_uq').on(t.replay_fingerprint),
  unique('identity_exchange_receipts_launch_uq').on(t.launch_id),
  foreignKey({ name: 'identity_exchange_receipts_launch_fk', columns: [t.launch_id], foreignColumns: [accessLaunches.id] }).onDelete('no action').onUpdate('no action'),
  check('identity_exchange_receipts_fingerprint', sql`${t.replay_fingerprint} ~ '^[0-9a-f]{64}$'`),
  check('identity_exchange_receipts_policy', sql`${t.verification_policy_id} ~ '^[a-z][a-z0-9_]*$' AND ${t.verification_policy_revision} > 0`),
  check('identity_exchange_receipts_time', sql`isfinite(${t.authenticated_at}) AND isfinite(${t.cleanup_after})
    AND ${t.cleanup_after} > ${t.authenticated_at} AND ${t.cleanup_after} >= ${t.created_at}`),
  index('identity_exchange_receipts_cleanup_idx').on(t.cleanup_after),
]);

export const accessTables = [externalIdentities, identityExchangePolicy, accessLaunches, identityExchangeReceipts] as const;
export const targetSchema = { ...foundationSchema, externalIdentities, identityExchangePolicy, accessLaunches, identityExchangeReceipts };
