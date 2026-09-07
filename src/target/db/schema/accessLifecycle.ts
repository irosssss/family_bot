import { sql } from 'drizzle-orm';
import { check, foreignKey, integer, unique, uuid, index } from 'drizzle-orm/pg-core';
import { rpg, identityRetention, mutable, mutableConstraints, commonConstraints, keyText, instant, optionalTime, families, accounts, memberProfiles } from './foundation';
import { accessLaunches, externalIdentities } from './access';
import { accessBindings } from './familyAccess';
import { adultProtections, adultRecoveryCredentials, targetSchema as adultSchema } from './adultProtection';

// Additive candidate key on the immutable historical binding table.
export const lifecycleScopeIndexes=[
  'CREATE UNIQUE INDEX "access_bindings_family_profile_id_uq" ON "rpg"."access_bindings" ("family_id", "profile_id", "id");',
  'CREATE UNIQUE INDEX "adult_recovery_credentials_scope_id_uq" ON "rpg"."adult_recovery_credentials" ("family_id", "binding_id", "id");',
];

export const lifecycleRequests = rpg.table('lifecycle_requests', {
  ...identityRetention(), ...mutable(), family_id:uuid('family_id').notNull(),
  kind:keyText('kind').notNull(), state:keyText('state').notNull(), policy_revision:integer('policy_revision').notNull(),
  request_digest:keyText('request_digest').notNull(), expires_at:instant('expires_at').notNull(), closed_at:instant('closed_at'),
  target_binding_id:uuid('target_binding_id'), target_revision:integer('target_revision'), target_profile_id:uuid('target_profile_id'), target_profile_revision:integer('target_profile_revision'),
  protection_id:uuid('protection_id'), protection_revision:integer('protection_revision'),
  issuer_binding_id:uuid('issuer_binding_id'), issuer_revision:integer('issuer_revision'), issuer_protection_revision:integer('issuer_protection_revision'),
  invite_verifier:keyText('invite_verifier'), candidate_verifier:keyText('candidate_verifier'),
  candidate_account_id:uuid('candidate_account_id'), candidate_identity_id:uuid('candidate_identity_id'), candidate_launch_id:uuid('candidate_launch_id'),
  basis:keyText('basis'), basis_credential_id:uuid('basis_credential_id'), approver_binding_id:uuid('approver_binding_id'), approver_revision:integer('approver_revision'),
  approver_protection_revision:integer('approver_protection_revision'), approved_at:instant('approved_at'),
  result_binding_id:uuid('result_binding_id'),
}, t => [
  ...mutableConstraints('lifecycle_requests',t), unique('lifecycle_requests_family_uq').on(t.family_id,t.id),
  unique('lifecycle_requests_invite_uq').on(t.invite_verifier), unique('lifecycle_requests_candidate_uq').on(t.candidate_verifier),
  unique('lifecycle_requests_launch_uq').on(t.candidate_launch_id),
  unique('lifecycle_requests_result_uq').on(t.result_binding_id),
  foreignKey({name:'lifecycle_requests_family_fk',columns:[t.family_id],foreignColumns:[families.id]}),
  foreignKey({name:'lifecycle_requests_target_fk',columns:[t.family_id,t.target_profile_id,t.target_binding_id],foreignColumns:[accessBindings.family_id,accessBindings.profile_id,accessBindings.id]}),
  foreignKey({name:'lifecycle_requests_profile_fk',columns:[t.family_id,t.target_profile_id],foreignColumns:[memberProfiles.family_id,memberProfiles.id]}),
  foreignKey({name:'lifecycle_requests_protection_fk',columns:[t.family_id,t.target_binding_id,t.protection_id],foreignColumns:[adultProtections.family_id,adultProtections.binding_id,adultProtections.id]}),
  foreignKey({name:'lifecycle_requests_code_fk',columns:[t.family_id,t.target_binding_id,t.basis_credential_id],foreignColumns:[adultRecoveryCredentials.family_id,adultRecoveryCredentials.binding_id,adultRecoveryCredentials.id]}),
  foreignKey({name:'lifecycle_requests_issuer_fk',columns:[t.family_id,t.issuer_binding_id],foreignColumns:[accessBindings.family_id,accessBindings.id]}),
  foreignKey({name:'lifecycle_requests_approver_fk',columns:[t.family_id,t.approver_binding_id],foreignColumns:[accessBindings.family_id,accessBindings.id]}),
  foreignKey({name:'lifecycle_requests_result_fk',columns:[t.family_id,t.result_binding_id],foreignColumns:[accessBindings.family_id,accessBindings.id]}),
  foreignKey({name:'lifecycle_requests_candidate_fk',columns:[t.candidate_identity_id,t.candidate_account_id],foreignColumns:[externalIdentities.id,externalIdentities.account_id]}),
  foreignKey({name:'lifecycle_requests_launch_fk',columns:[t.candidate_account_id,t.candidate_identity_id,t.candidate_launch_id],foreignColumns:[accessLaunches.account_id,accessLaunches.external_identity_id,accessLaunches.id]}),
  check('lifecycle_requests_values',sql`${t.kind} IN ('recovery','invite_child','invite_adult','exclusion') AND ${t.policy_revision}>0
    AND ${t.request_digest} ~ '^[a-f0-9]{64}$' AND isfinite(${t.expires_at}) AND ${t.expires_at}>${t.created_at}`),
  check('lifecycle_requests_digests',sql`(${t.invite_verifier} IS NULL OR ${t.invite_verifier} ~ '^[a-f0-9]{64}$')
    AND (${t.candidate_verifier} IS NULL OR ${t.candidate_verifier} ~ '^[a-f0-9]{64}$')`),
  check('lifecycle_requests_secret_kind',sql`(${t.kind} IN ('invite_child','invite_adult')) = (${t.invite_verifier} IS NOT NULL)
    AND (${t.kind}<>'recovery' OR ${t.candidate_account_id} IS NOT NULL)
    AND (${t.kind}<>'exclusion' OR ${t.candidate_account_id} IS NULL)`),
  check('lifecycle_requests_result',sql`(${t.result_binding_id} IS NOT NULL) = (${t.state}='consumed' AND ${t.kind}<>'exclusion')
    AND (${t.state}<>'consumed' OR ${t.kind}='exclusion' OR ${t.basis} IS NOT NULL)`),
  check('lifecycle_requests_candidate',sql`num_nonnulls(${t.candidate_verifier},${t.candidate_account_id},${t.candidate_identity_id},${t.candidate_launch_id}) IN (0,4)`),
  check('lifecycle_requests_target',sql`((${t.kind} IN ('recovery','exclusion') AND ${t.target_binding_id} IS NOT NULL AND ${t.target_revision}>0 AND ${t.target_profile_id} IS NOT NULL)
    OR (${t.kind}='invite_child' AND ${t.target_binding_id} IS NULL AND ${t.target_revision} IS NULL AND ${t.target_profile_id} IS NOT NULL)
    OR (${t.kind}='invite_adult' AND ${t.target_binding_id} IS NULL AND ${t.target_revision} IS NULL AND ${t.target_profile_id} IS NULL)) IS TRUE`),
  check('lifecycle_requests_profile_revision',sql`((${t.target_profile_id} IS NULL AND ${t.target_profile_revision} IS NULL)
    OR (${t.target_profile_id} IS NOT NULL AND ${t.target_profile_revision}>0)) IS TRUE`),
  check('lifecycle_requests_protection',sql`((${t.kind}='recovery' AND ${t.protection_id} IS NOT NULL AND ${t.protection_revision}>0)
    OR (${t.kind}<>'recovery' AND ${t.protection_id} IS NULL AND ${t.protection_revision} IS NULL)) IS TRUE`),
  check('lifecycle_requests_issuer',sql`((${t.kind}='recovery' AND ${t.issuer_binding_id} IS NULL AND ${t.issuer_revision} IS NULL AND ${t.issuer_protection_revision} IS NULL)
    OR (${t.kind}<>'recovery' AND ${t.issuer_binding_id} IS NOT NULL AND ${t.issuer_revision}>0 AND ${t.issuer_protection_revision}>0)) IS TRUE`),
  check('lifecycle_requests_basis',sql`((${t.basis} IS NULL AND ${t.approver_binding_id} IS NULL AND ${t.approver_revision} IS NULL AND ${t.approver_protection_revision} IS NULL AND ${t.approved_at} IS NULL)
    OR (${t.basis}='code' AND ${t.kind}='recovery' AND ${t.approver_binding_id} IS NULL AND ${t.approver_revision} IS NULL AND ${t.approver_protection_revision} IS NULL AND ${t.approved_at} IS NOT NULL)
    OR (${t.basis}='adult' AND ${t.approver_binding_id} IS NOT NULL AND ${t.approver_revision}>0 AND ${t.approver_protection_revision}>0 AND ${t.approved_at} IS NOT NULL)) IS TRUE`),
  check('lifecycle_requests_code_basis',sql`(${t.basis_credential_id} IS NOT NULL) = (${t.basis} IS NOT NULL AND ${t.basis}='code')`),
  check('lifecycle_requests_state',sql`((${t.state}='issued' AND ${t.kind}<>'recovery' AND ${t.candidate_account_id} IS NULL AND ${t.basis} IS NULL AND ${t.closed_at} IS NULL)
    OR (${t.state}='claimed' AND ${t.candidate_account_id} IS NOT NULL AND ${t.basis} IS NULL AND ${t.closed_at} IS NULL)
    OR (${t.state}='approved' AND ${t.basis} IS NOT NULL AND ${t.closed_at} IS NULL)
    OR (${t.state} IN ('consumed','revoked') AND ${t.closed_at} IS NOT NULL)) IS TRUE`),
  optionalTime('lifecycle_requests_closed',t.closed_at,t.created_at,t.updated_at),
  optionalTime('lifecycle_requests_approved',t.approved_at,t.created_at,t.updated_at),
  index('lifecycle_requests_scope_idx').on(t.family_id,t.target_binding_id,t.created_at),
  index('lifecycle_requests_issuer_time_idx').on(t.issuer_binding_id,t.created_at),
  index('lifecycle_requests_candidate_time_idx').on(t.family_id,t.candidate_account_id,t.created_at),
]);

export const lifecycleEvents = rpg.table('lifecycle_events', {
  ...identityRetention(), family_id:uuid('family_id').notNull(), request_id:uuid('request_id'),
  actor_binding_id:uuid('actor_binding_id'), candidate_account_id:uuid('candidate_account_id'),
  action:keyText('action').notNull(), outcome:keyText('outcome').notNull(), policy_revision:integer('policy_revision').notNull(),
  operation_id:uuid('operation_id'), request_digest:keyText('request_digest').notNull(),
},t=>[
  ...commonConstraints('lifecycle_events',t), unique('lifecycle_events_operation_uq').on(t.operation_id),
  foreignKey({name:'lifecycle_events_family_fk',columns:[t.family_id],foreignColumns:[families.id]}),
  foreignKey({name:'lifecycle_events_request_fk',columns:[t.family_id,t.request_id],foreignColumns:[lifecycleRequests.family_id,lifecycleRequests.id]}),
  foreignKey({name:'lifecycle_events_actor_fk',columns:[t.family_id,t.actor_binding_id],foreignColumns:[accessBindings.family_id,accessBindings.id]}),
  foreignKey({name:'lifecycle_events_candidate_fk',columns:[t.candidate_account_id],foreignColumns:[accounts.id]}),
  check('lifecycle_events_values',sql`${t.action} IN ('request','code','prepare','approve','consume','claim','leave','exclude','cancel','sessions') AND ${t.outcome} IN ('accepted','denied')
    AND ${t.policy_revision}>0 AND ${t.request_digest} ~ '^[a-f0-9]{64}$'`),
  check('lifecycle_events_operation_id',sql`${t.operation_id} IS NULL OR ${t.operation_id}::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'`),
  index('lifecycle_events_rate_idx').on(t.family_id,t.candidate_account_id,t.created_at),
  index('lifecycle_events_request_action_idx').on(t.request_id,t.action,t.created_at),
]);
export const lifecycleTables = [lifecycleRequests,lifecycleEvents] as const;
export const targetSchema = {...adultSchema,lifecycleRequests,lifecycleEvents};
