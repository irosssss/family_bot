import { sql } from 'drizzle-orm';
import { check, foreignKey, index, integer, unique, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import { rpg, keyText, instant, identityRetention, mutable, commonConstraints, mutableConstraints, optionalTime } from './foundation';
import { accessLaunches, externalIdentities } from './access';
import { accessBindings, sessionContexts, sessionTokenVerifiers, targetSchema as familySchema } from './familyAccess';

export const familySecurityPolicy = rpg.table('family_security_policy', {
  ...identityRetention(), ...mutable(), scope: keyText('scope').notNull(),
  policy_id: keyText('policy_id').notNull(), policy_revision: integer('policy_revision').notNull(),
  family_policy_digest: keyText('family_policy_digest').notNull(), security_digest: keyText('security_digest').notNull(),
  pepper_key_id: keyText('pepper_key_id').notNull(), activated_at: instant('activated_at').notNull(),
}, t => [
  ...mutableConstraints('family_security_policy', t), unique('family_security_policy_scope_uq').on(t.scope),
  check('family_security_policy_scope', sql`${t.scope} = 'family_access'`),
  check('family_security_policy_values', sql`${t.policy_id} ~ '^[a-z][a-z0-9_]*$' AND ${t.policy_revision} > 0
    AND ${t.pepper_key_id} ~ '^[a-z][a-z0-9_]*$' AND ${t.family_policy_digest} ~ '^[a-f0-9]{64}$' AND ${t.security_digest} ~ '^[a-f0-9]{64}$'`),
  check('family_security_policy_time', sql`isfinite(${t.activated_at}) AND ${t.activated_at} >= ${t.created_at} AND ${t.activated_at} <= ${t.updated_at}`),
]);

export const launchConsumptions = rpg.table('launch_consumptions', {
  ...identityRetention(), launch_id: uuid('launch_id').notNull(), purpose: keyText('purpose').notNull(),
}, t => [
  ...commonConstraints('launch_consumptions', t), unique('launch_consumptions_launch_uq').on(t.launch_id),
  foreignKey({ name: 'launch_consumptions_launch_fk', columns: [t.launch_id], foreignColumns: [accessLaunches.id] }),
  check('launch_consumptions_purpose', sql`${t.purpose} IN ('own_child','adult_login','adult_setup')`),
]);

const familyBinding = () => ({ family_id: uuid('family_id').notNull(), account_id: uuid('account_id').notNull(),
  profile_id: uuid('profile_id').notNull(), binding_id: uuid('binding_id').notNull(), binding_kind: keyText('binding_kind').notNull() });
type BindingColumns = { [K in keyof ReturnType<typeof familyBinding>]: AnyPgColumn };
const bindingConstraints = (name: string, t: BindingColumns) => [
  foreignKey({ name: `${name}_binding_fk`, columns: [t.family_id,t.account_id,t.profile_id,t.binding_id,t.binding_kind],
    foreignColumns: [accessBindings.family_id,accessBindings.account_id,accessBindings.profile_id,accessBindings.id,accessBindings.kind] }),
  check(`${name}_adult_kind`, sql`${t.binding_kind} = 'adult_membership'`),
];

export const adultProtections = rpg.table('adult_protections', {
  ...identityRetention(), ...mutable(), ...familyBinding(), credential_revision: integer('credential_revision').notNull(),
  status: keyText('status').notNull(), kdf_id: keyText('kdf_id').notNull(), pin_salt: keyText('pin_salt').notNull(),
  pin_verifier: keyText('pin_verifier').notNull(), pepper_key_id: keyText('pepper_key_id').notNull(),
  recovery_ack_at: instant('recovery_ack_at'), revoked_at: instant('revoked_at'),
}, t => [
  ...mutableConstraints('adult_protections', t), ...bindingConstraints('adult_protections', t),
  unique('adult_protections_binding_uq').on(t.binding_id), unique('adult_protections_scope_uq').on(t.family_id,t.binding_id,t.id),
  check('adult_protections_verifier', sql`${t.credential_revision} > 0 AND ${t.kdf_id} = 'argon2id_v19_19m_t2_p1'
    AND ${t.pin_salt} ~ '^[a-f0-9]{32}$' AND ${t.pin_verifier} ~ '^[a-f0-9]{64}$' AND ${t.pepper_key_id} ~ '^[a-z][a-z0-9_]*$'`),
  check('adult_protections_state', sql`(${t.status} = 'pending' AND ${t.recovery_ack_at} IS NULL AND ${t.revoked_at} IS NULL)
    OR (${t.status} = 'active' AND ${t.recovery_ack_at} IS NOT NULL AND ${t.revoked_at} IS NULL)
    OR (${t.status} = 'revoked' AND ${t.revoked_at} IS NOT NULL)`),
  optionalTime('adult_protections_ack_time', t.recovery_ack_at,t.created_at,t.updated_at),
  optionalTime('adult_protections_revoke_time', t.revoked_at,t.created_at,t.updated_at),
]);

export const adultRecoveryCredentials = rpg.table('adult_recovery_credentials', {
  ...identityRetention(), ...mutable(), family_id: uuid('family_id').notNull(), binding_id: uuid('binding_id').notNull(),
  protection_id: uuid('protection_id').notNull(), credential_revision: integer('credential_revision').notNull(),
  verifier: keyText('verifier').notNull(), verifier_version: integer('verifier_version').notNull(),
  acknowledged_at: instant('acknowledged_at'), revoked_at: instant('revoked_at'),
}, t => [
  ...mutableConstraints('adult_recovery_credentials', t),
  foreignKey({ name: 'adult_recovery_credentials_scope_fk', columns: [t.family_id,t.binding_id,t.protection_id],
    foreignColumns: [adultProtections.family_id,adultProtections.binding_id,adultProtections.id] }),
  uniqueIndex('adult_recovery_credentials_current_uq').on(t.protection_id).where(sql`${t.revoked_at} IS NULL`),
  unique('adult_recovery_credentials_verifier_uq').on(t.verifier),
  check('adult_recovery_credentials_version', sql`${t.credential_revision} > 0 AND ${t.verifier_version} = 1 AND ${t.verifier} ~ '^[a-f0-9]{64}$'`),
  optionalTime('adult_recovery_credentials_ack_time',t.acknowledged_at,t.created_at,t.updated_at),
  optionalTime('adult_recovery_credentials_revoke_time',t.revoked_at,t.created_at,t.updated_at),
]);

export const adultSetups = rpg.table('adult_setups', {
  ...identityRetention(), ...mutable(), ...familyBinding(), binding_revision: integer('binding_revision').notNull(),
  external_identity_id: uuid('external_identity_id').notNull(), launch_id: uuid('launch_id').notNull(),
  token_verifier: keyText('token_verifier').notNull(), verifier_version: integer('verifier_version').notNull(),
  policy_revision: integer('policy_revision').notNull(), state: keyText('state').notNull(),
  protection_id: uuid('protection_id'), expires_at: instant('expires_at').notNull(), revoked_at: instant('revoked_at'),
}, t => [
  ...mutableConstraints('adult_setups', t), ...bindingConstraints('adult_setups', t),
  foreignKey({ name: 'adult_setups_identity_fk', columns: [t.external_identity_id,t.account_id], foreignColumns: [externalIdentities.id,externalIdentities.account_id] }),
  foreignKey({ name: 'adult_setups_launch_fk', columns: [t.account_id,t.external_identity_id,t.launch_id], foreignColumns: [accessLaunches.account_id,accessLaunches.external_identity_id,accessLaunches.id] }),
  foreignKey({ name: 'adult_setups_protection_fk', columns: [t.family_id,t.binding_id,t.protection_id],
    foreignColumns: [adultProtections.family_id,adultProtections.binding_id,adultProtections.id] }),
  unique('adult_setups_launch_uq').on(t.launch_id), unique('adult_setups_token_uq').on(t.token_verifier),
  unique('adult_setups_family_uq').on(t.family_id,t.id),
  uniqueIndex('adult_setups_pending_uq').on(t.binding_id).where(sql`${t.state} IN ('awaiting_pin','awaiting_recovery') AND ${t.revoked_at} IS NULL`),
  check('adult_setups_values', sql`${t.binding_revision} > 0 AND ${t.policy_revision} > 0 AND ${t.verifier_version} = 1
    AND ${t.token_verifier} ~ '^[a-f0-9]{64}$' AND isfinite(${t.expires_at}) AND ${t.expires_at} > ${t.created_at}`),
  check('adult_setups_state', sql`(${t.state} = 'awaiting_pin' AND ${t.protection_id} IS NULL AND ${t.revoked_at} IS NULL)
    OR (${t.state} = 'awaiting_recovery' AND ${t.protection_id} IS NOT NULL AND ${t.revoked_at} IS NULL)
    OR (${t.state} = 'completed' AND ${t.protection_id} IS NOT NULL AND ${t.revoked_at} IS NOT NULL)
    OR (${t.state} = 'revoked' AND ${t.revoked_at} IS NOT NULL)`),
  optionalTime('adult_setups_revoke_time',t.revoked_at,t.created_at,t.updated_at),
]);

export const adultAttempts = rpg.table('adult_attempts', {
  ...identityRetention(), ...mutable(), ...familyBinding(), protection_id: uuid('protection_id'),
  credential_revision: integer('credential_revision'), policy_revision: integer('policy_revision').notNull(),
  launch_id: uuid('launch_id'), setup_id: uuid('setup_id'), session_id: uuid('session_id'),
  purpose: keyText('purpose').notNull(), intent_digest: keyText('intent_digest').notNull(),
  outcome: keyText('outcome').notNull(), finished_at: instant('finished_at'),
}, t => [
  ...mutableConstraints('adult_attempts', t), ...bindingConstraints('adult_attempts', t),
  foreignKey({ name: 'adult_attempts_protection_fk', columns: [t.family_id,t.binding_id,t.protection_id],
    foreignColumns: [adultProtections.family_id,adultProtections.binding_id,adultProtections.id] }),
  foreignKey({ name: 'adult_attempts_launch_fk', columns: [t.account_id,t.launch_id], foreignColumns: [accessLaunches.account_id,accessLaunches.id] }),
  foreignKey({ name: 'adult_attempts_setup_fk', columns: [t.family_id,t.setup_id], foreignColumns: [adultSetups.family_id,adultSetups.id] }),
  foreignKey({ name: 'adult_attempts_session_fk', columns: [t.family_id,t.session_id], foreignColumns: [sessionContexts.family_id,sessionContexts.id] }),
  unique('adult_attempts_family_uq').on(t.family_id,t.id),
  check('adult_attempts_source', sql`num_nonnulls(${t.launch_id},${t.setup_id},${t.session_id}) = 1
    AND ((${t.purpose} IN ('prepare_setup','recovery_ack') AND ${t.setup_id} IS NOT NULL)
    OR (${t.purpose} = 'login' AND ${t.launch_id} IS NOT NULL)
    OR (${t.purpose} IN ('switch','fresh') AND ${t.session_id} IS NOT NULL))`),
  check('adult_attempts_values', sql`${t.policy_revision} > 0 AND ${t.intent_digest} ~ '^[a-f0-9]{64}$'
    AND ((${t.protection_id} IS NULL AND ${t.credential_revision} IS NULL) OR (${t.protection_id} IS NOT NULL AND ${t.credential_revision} > 0)) IS TRUE`),
  check('adult_attempts_outcome', sql`(${t.outcome} = 'pending' AND ${t.finished_at} IS NULL)
    OR (${t.outcome} IN ('accepted','denied','stale','unavailable') AND ${t.finished_at} IS NOT NULL)`),
  optionalTime('adult_attempts_finished_time',t.finished_at,t.created_at,t.updated_at),
  index('adult_attempts_binding_time_idx').on(t.binding_id,t.created_at),
  index('adult_attempts_launch_idx').on(t.launch_id), index('adult_attempts_setup_idx').on(t.setup_id), index('adult_attempts_session_idx').on(t.session_id),
]);

export const adultActionProofs = rpg.table('adult_action_proofs', {
  ...identityRetention(), ...mutable(), ...familyBinding(), protection_id: uuid('protection_id').notNull(),
  credential_revision: integer('credential_revision').notNull(), policy_revision: integer('policy_revision').notNull(),
  session_id: uuid('session_id').notNull(), session_revision: integer('session_revision').notNull(),
  source_verifier_id: uuid('source_verifier_id').notNull(), source_verifier_revision: integer('source_verifier_revision').notNull(),
  attempt_id: uuid('attempt_id').notNull(), operation_id: uuid('operation_id').notNull(),
  action: keyText('action').notNull(), target_session_id: uuid('target_session_id'), target_binding_id: uuid('target_binding_id'),
  expected_revision: integer('expected_revision').notNull(), token_verifier: keyText('token_verifier').notNull(), verifier_version: integer('verifier_version').notNull(),
  expires_at: instant('expires_at').notNull(), consumed_at: instant('consumed_at'),
}, t => [
  ...mutableConstraints('adult_action_proofs', t), ...bindingConstraints('adult_action_proofs', t),
  foreignKey({ name: 'adult_action_proofs_protection_fk', columns: [t.family_id,t.binding_id,t.protection_id],
    foreignColumns: [adultProtections.family_id,adultProtections.binding_id,adultProtections.id] }),
  foreignKey({ name: 'adult_action_proofs_session_fk', columns: [t.family_id,t.session_id], foreignColumns: [sessionContexts.family_id,sessionContexts.id] }),
  foreignKey({ name: 'adult_action_proofs_verifier_fk', columns: [t.family_id,t.session_id,t.source_verifier_id], foreignColumns: [sessionTokenVerifiers.family_id,sessionTokenVerifiers.session_id,sessionTokenVerifiers.id] }),
  foreignKey({ name: 'adult_action_proofs_attempt_fk', columns: [t.family_id,t.attempt_id], foreignColumns: [adultAttempts.family_id,adultAttempts.id] }),
  foreignKey({ name: 'adult_action_proofs_target_session_fk', columns: [t.family_id,t.target_session_id], foreignColumns: [sessionContexts.family_id,sessionContexts.id] }),
  foreignKey({ name: 'adult_action_proofs_target_binding_fk', columns: [t.family_id,t.target_binding_id], foreignColumns: [accessBindings.family_id,accessBindings.id] }),
  unique('adult_action_proofs_token_uq').on(t.token_verifier), unique('adult_action_proofs_attempt_uq').on(t.attempt_id),
  check('adult_action_proofs_action', sql`(${t.action} = 'revoke_session' AND ${t.target_session_id} IS NOT NULL AND ${t.target_binding_id} IS NULL)
    OR (${t.action} = 'revoke_binding' AND ${t.target_binding_id} IS NOT NULL AND ${t.target_session_id} IS NULL)`),
  check('adult_action_proofs_values', sql`${t.credential_revision} > 0 AND ${t.policy_revision} > 0 AND ${t.session_revision} > 0
    AND ${t.source_verifier_revision} > 0 AND ${t.expected_revision} > 0 AND ${t.verifier_version} = 1
    AND ${t.token_verifier} ~ '^[a-f0-9]{64}$' AND isfinite(${t.expires_at}) AND ${t.expires_at} > ${t.created_at}`),
  optionalTime('adult_action_proofs_consumed_time',t.consumed_at,t.created_at,t.updated_at),
]);

export const accessOperations = rpg.table('access_operations', {
  ...identityRetention(), family_id: uuid('family_id').notNull(), actor_binding_id: uuid('actor_binding_id').notNull(),
  target_binding_id: uuid('target_binding_id').notNull(), action: keyText('action').notNull(),
  request_digest: keyText('request_digest').notNull(),
}, t => [
  ...commonConstraints('access_operations', t),
  unique('access_operations_family_uq').on(t.family_id,t.id),
  foreignKey({ name: 'access_operations_actor_fk', columns: [t.family_id,t.actor_binding_id], foreignColumns: [accessBindings.family_id,accessBindings.id] }),
  foreignKey({ name: 'access_operations_target_fk', columns: [t.family_id,t.target_binding_id], foreignColumns: [accessBindings.family_id,accessBindings.id] }),
  check('access_operations_values', sql`${t.action} IN ('revoke_session','revoke_binding') AND ${t.request_digest} ~ '^[a-f0-9]{64}$'`),
  index('access_operations_pair_time_idx').on(t.family_id,t.actor_binding_id,t.target_binding_id,t.created_at),
]);

export const accessAuditEvents = rpg.table('access_audit_events', {
  ...identityRetention(), ...familyBinding(), action: keyText('action').notNull(), outcome: keyText('outcome').notNull(),
  policy_revision: integer('policy_revision').notNull(), attempt_id: uuid('attempt_id'), operation_id: uuid('operation_id'),
}, t => [
  ...commonConstraints('access_audit_events', t), ...bindingConstraints('access_audit_events', t),
  foreignKey({ name: 'access_audit_events_attempt_fk', columns: [t.family_id,t.attempt_id], foreignColumns: [adultAttempts.family_id,adultAttempts.id] }),
  foreignKey({ name: 'access_audit_events_operation_fk', columns: [t.family_id,t.operation_id], foreignColumns: [accessOperations.family_id,accessOperations.id] }),
  check('access_audit_events_values', sql`${t.policy_revision} > 0 AND ${t.action} IN ('begin_setup','prepare_setup','rotate_recovery','recovery_ack','login','switch','fresh','revoke_session','revoke_binding')
    AND ${t.outcome} IN ('accepted','denied','stale','unavailable')`),
]);

export const adultProtectionTables = [familySecurityPolicy, launchConsumptions, adultProtections, adultRecoveryCredentials,
  adultSetups, adultAttempts, adultActionProofs, accessOperations, accessAuditEvents] as const;
export const targetSchema = { ...familySchema, familySecurityPolicy, launchConsumptions, adultProtections, adultRecoveryCredentials,
  adultSetups, adultAttempts, adultActionProofs, accessOperations, accessAuditEvents };

// Additive candidate keys on immutable G03-C/D tables. Keep their historical schema
// snapshots unchanged; migration 0005 installs these indexes before the generated FKs.
export const adultScopeIndexes = [
  'CREATE UNIQUE INDEX "access_bindings_family_id_uq" ON "rpg"."access_bindings" ("family_id", "id");',
  'CREATE UNIQUE INDEX "session_token_verifiers_scope_uq" ON "rpg"."session_token_verifiers" ("family_id", "session_id", "id");',
  'CREATE UNIQUE INDEX "access_launches_source_uq" ON "rpg"."access_launches" ("account_id", "external_identity_id", "id");',
  'CREATE UNIQUE INDEX "access_launches_account_uq" ON "rpg"."access_launches" ("account_id", "id");',
] as const;
