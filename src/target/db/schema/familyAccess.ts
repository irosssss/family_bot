import { sql } from 'drizzle-orm';
import { check, foreignKey, integer, unique, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { accounts, memberProfiles, rpg, keyText, instant, identityRetention, mutable, mutableConstraints, optionalTime } from './foundation';
import { accessLaunches, externalIdentities, targetSchema as identitySchema } from './access';

export const accessBindings = rpg.table('access_bindings', {
  ...identityRetention(), ...mutable(), family_id: uuid('family_id').notNull(), account_id: uuid('account_id').notNull(),
  profile_id: uuid('profile_id').notNull(), profile_role: keyText('profile_role').notNull(), kind: keyText('kind').notNull(),
  manager_binding_id: uuid('manager_binding_id'), manager_kind: keyText('manager_kind'),
  status: keyText('status').notNull(), revoked_at: instant('revoked_at'), origin_invitation_id: uuid('origin_invitation_id'),
}, t => [
  ...mutableConstraints('access_bindings', t),
  foreignKey({ name: 'access_bindings_account_fk', columns: [t.account_id], foreignColumns: [accounts.id] }).onDelete('no action').onUpdate('no action'),
  foreignKey({ name: 'access_bindings_profile_fk', columns: [t.family_id,t.profile_id,t.profile_role],
    foreignColumns: [memberProfiles.family_id,memberProfiles.id,memberProfiles.family_role] }).onDelete('no action').onUpdate('no action'),
  unique('access_bindings_scope_uq').on(t.family_id,t.account_id,t.profile_id,t.id,t.kind),
  unique('access_bindings_manager_uq').on(t.family_id,t.account_id,t.id,t.kind),
  unique('access_bindings_lineage_uq').on(t.id,t.family_id,t.account_id,t.manager_binding_id,t.manager_kind),
  foreignKey({ name: 'access_bindings_manager_fk', columns: [t.family_id,t.account_id,t.manager_binding_id,t.manager_kind],
    foreignColumns: [t.family_id,t.account_id,t.id,t.kind] }).onDelete('no action').onUpdate('no action'),
  check('access_bindings_role', sql`(${t.kind} = 'adult_membership' AND ${t.profile_role} = 'parent')
    OR (${t.kind} IN ('own_child','managed_child') AND ${t.profile_role} = 'child')`),
  check('access_bindings_manager', sql`((${t.kind} = 'managed_child' AND ${t.manager_binding_id} IS NOT NULL
    AND ${t.manager_kind} = 'adult_membership' AND ${t.manager_binding_id} <> ${t.id})
    OR (${t.kind} <> 'managed_child' AND ${t.manager_binding_id} IS NULL AND ${t.manager_kind} IS NULL)) IS TRUE`),
  check('access_bindings_status', sql`(${t.status} = 'active' AND ${t.revoked_at} IS NULL) OR (${t.status} = 'revoked' AND ${t.revoked_at} IS NOT NULL)`),
  optionalTime('access_bindings_revoked', t.revoked_at,t.created_at,t.updated_at),
  // Invitation table/verified assignment command arrive later; never accept a dangling origin.
  check('access_bindings_invitation_pending', sql`${t.origin_invitation_id} IS NULL`),
  uniqueIndex('access_bindings_own_child_uq').on(t.family_id,t.profile_id).where(sql`${t.kind} = 'own_child' AND ${t.status} = 'active'`),
  uniqueIndex('access_bindings_adult_profile_uq').on(t.family_id,t.profile_id).where(sql`${t.kind} = 'adult_membership' AND ${t.status} = 'active'`),
  uniqueIndex('access_bindings_principal_uq').on(t.family_id,t.account_id).where(sql`${t.kind} <> 'managed_child' AND ${t.status} = 'active'`),
  uniqueIndex('access_bindings_managed_uq').on(t.family_id,t.account_id,t.profile_id).where(sql`${t.kind} = 'managed_child' AND ${t.status} = 'active'`),
]);

export const sessionContexts = rpg.table('session_contexts', {
  ...identityRetention(), ...mutable(), family_id: uuid('family_id').notNull(), account_id: uuid('account_id').notNull(),
  external_identity_id: uuid('external_identity_id').notNull(), profile_id: uuid('profile_id').notNull(), binding_id: uuid('binding_id').notNull(),
  binding_kind: keyText('binding_kind').notNull(), binding_revision: integer('binding_revision').notNull(), mode: keyText('mode').notNull(),
  parent_session_id: uuid('parent_session_id'),
  parent_mode: keyText('parent_mode'), parent_binding_id: uuid('parent_binding_id'), parent_binding_kind: keyText('parent_binding_kind'),
  origin_launch_id: uuid('origin_launch_id'), expires_at: instant('expires_at').notNull(), revoked_at: instant('revoked_at'),
  adult_verified_at: instant('adult_verified_at'), adult_grant_expires_at: instant('adult_grant_expires_at'),
  adult_idle_expires_at: instant('adult_idle_expires_at'), protection_revision: integer('protection_revision'),
  policy_id: keyText('policy_id').notNull(), policy_revision: integer('policy_revision').notNull(), policy_digest: keyText('policy_digest').notNull(),
}, t => [
  ...mutableConstraints('session_contexts', t),
  foreignKey({ name: 'session_contexts_binding_fk', columns: [t.family_id,t.account_id,t.profile_id,t.binding_id,t.binding_kind],
    foreignColumns: [accessBindings.family_id,accessBindings.account_id,accessBindings.profile_id,accessBindings.id,accessBindings.kind] }).onDelete('no action').onUpdate('no action'),
  foreignKey({ name: 'session_contexts_identity_fk', columns: [t.external_identity_id,t.account_id],
    foreignColumns: [externalIdentities.id,externalIdentities.account_id] }).onDelete('no action').onUpdate('no action'),
  foreignKey({ name: 'session_contexts_launch_fk', columns: [t.origin_launch_id], foreignColumns: [accessLaunches.id] }).onDelete('no action').onUpdate('no action'),
  unique('session_contexts_launch_uq').on(t.origin_launch_id),
  unique('session_contexts_family_uq').on(t.family_id,t.id),
  unique('session_contexts_parent_uq').on(t.family_id,t.account_id,t.id,t.mode,t.binding_id,t.binding_kind),
  foreignKey({ name: 'session_contexts_parent_fk', columns: [t.family_id,t.account_id,t.parent_session_id,t.parent_mode,t.parent_binding_id,t.parent_binding_kind],
    foreignColumns: [t.family_id,t.account_id,t.id,t.mode,t.binding_id,t.binding_kind] }).onDelete('no action').onUpdate('no action'),
  foreignKey({ name: 'session_contexts_manager_fk', columns: [t.binding_id,t.family_id,t.account_id,t.parent_binding_id,t.parent_binding_kind],
    foreignColumns: [accessBindings.id,accessBindings.family_id,accessBindings.account_id,accessBindings.manager_binding_id,accessBindings.manager_kind] }).onDelete('no action').onUpdate('no action'),
  check('session_contexts_mode', sql`(${t.mode} = 'adult' AND ${t.binding_kind} = 'adult_membership')
    OR (${t.mode} = 'own_child' AND ${t.binding_kind} = 'own_child' AND ${t.origin_launch_id} IS NOT NULL)
    OR (${t.mode} = 'managed_child' AND ${t.binding_kind} = 'managed_child' AND ${t.origin_launch_id} IS NULL)`),
  check('session_contexts_parent', sql`((${t.mode} = 'managed_child' AND ${t.parent_session_id} IS NOT NULL AND ${t.parent_session_id} <> ${t.id}
    AND ${t.parent_mode} = 'adult' AND ${t.parent_binding_id} IS NOT NULL AND ${t.parent_binding_kind} = 'adult_membership')
    OR (${t.mode} <> 'managed_child' AND ${t.parent_session_id} IS NULL AND ${t.parent_mode} IS NULL
    AND ${t.parent_binding_id} IS NULL AND ${t.parent_binding_kind} IS NULL)) IS TRUE`),
  check('session_contexts_adult', sql`((${t.mode} = 'adult' AND ${t.protection_revision} > 0
    AND isfinite(${t.adult_verified_at}) AND ${t.adult_verified_at} >= ${t.created_at} AND ${t.adult_verified_at} <= ${t.updated_at}
    AND isfinite(${t.adult_grant_expires_at}) AND isfinite(${t.adult_idle_expires_at})
    AND ${t.adult_grant_expires_at} > ${t.adult_verified_at} AND ${t.adult_grant_expires_at} <= ${t.expires_at}
    AND ${t.adult_idle_expires_at} > ${t.adult_verified_at} AND ${t.adult_idle_expires_at} <= ${t.adult_grant_expires_at})
    OR (${t.mode} <> 'adult' AND ${t.protection_revision} IS NULL AND ${t.adult_verified_at} IS NULL
    AND ${t.adult_grant_expires_at} IS NULL AND ${t.adult_idle_expires_at} IS NULL)) IS TRUE`),
  check('session_contexts_expiry', sql`isfinite(${t.expires_at}) AND ${t.expires_at} > ${t.created_at}`),
  optionalTime('session_contexts_revoked',t.revoked_at,t.created_at,t.updated_at),
  check('session_contexts_policy',sql`${t.binding_revision} > 0 AND ${t.policy_revision} > 0 AND ${t.policy_id} ~ '^[a-z][a-z0-9_]*$' AND ${t.policy_digest} ~ '^[a-f0-9]{64}$'`),
]);

export const sessionTokenVerifiers = rpg.table('session_token_verifiers', {
  ...identityRetention(), ...mutable(), family_id: uuid('family_id').notNull(), session_id: uuid('session_id').notNull(),
  token_verifier: keyText('token_verifier').notNull(), verifier_version: integer('verifier_version').notNull(),
  retired_at: instant('retired_at'),
}, t => [
  ...mutableConstraints('session_token_verifiers', t),
  foreignKey({ name: 'session_token_verifiers_session_fk', columns: [t.family_id,t.session_id], foreignColumns: [sessionContexts.family_id,sessionContexts.id] }).onDelete('no action').onUpdate('no action'),
  unique('session_token_verifiers_digest_uq').on(t.token_verifier),
  uniqueIndex('session_token_verifiers_active_uq').on(t.session_id).where(sql`${t.retired_at} IS NULL`),
  check('session_token_verifiers_digest',sql`${t.token_verifier} ~ '^[a-f0-9]{64}$' AND ${t.verifier_version} = 1`),
  optionalTime('session_token_verifiers_retired',t.retired_at,t.created_at,t.updated_at),
]);

export const familyAccessTables = [accessBindings,sessionContexts,sessionTokenVerifiers] as const;
export const targetSchema = { ...identitySchema, accessBindings, sessionContexts, sessionTokenVerifiers };
