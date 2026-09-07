import { sql } from 'drizzle-orm';
import { boolean, check, customType, foreignKey, index, integer, jsonb, pgSchema, primaryKey, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';

export const rpg = pgSchema('rpg');
export const keyText = customType<{ data: string; driverData: string }>({ dataType: () => 'text COLLATE "C"' });
export const instant = (name: string) => timestamp(name, { withTimezone: true, precision: 3, mode: 'string' });
export const keyCheck = (name: string, column: AnyPgColumn) => check(name, sql`${column} ~ '^[a-z][a-z0-9_]*$'`);
export const uuidCheck = (name: string, column: AnyPgColumn) => check(name,
  sql`${column}::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'`);

export const retentionPolicyRevisions = rpg.table('retention_policy_revisions', {
  policy_id: keyText('policy_id').notNull(), revision: integer('revision').notNull(),
  purpose: keyText('purpose').notNull(), category: keyText('category').notNull(), trigger: keyText('trigger').notNull(),
  schema_version: integer('schema_version').notNull(),
  policy_payload: jsonb('policy_payload').$type<{ contract_id: string; schema_version: number; value: unknown }>().notNull(),
}, t => [
  primaryKey({ name: 'retention_policy_revisions_pk', columns: [t.policy_id, t.revision] }),
  keyCheck('retention_policy_id_key', t.policy_id), keyCheck('retention_purpose_key', t.purpose),
  keyCheck('retention_category_key', t.category), keyCheck('retention_trigger_key', t.trigger),
  check('retention_revision_positive', sql`${t.revision} > 0`),
  check('retention_schema_supported', sql`${t.schema_version} = 1`),
  // Actual value schema is selected by the explicit application registry; no production policy seeded here.
  check('retention_payload_envelope', sql`(jsonb_typeof(${t.policy_payload}) = 'object'
    AND ${t.policy_payload} ?& ARRAY['contract_id','schema_version','value']
    AND ${t.policy_payload} - ARRAY['contract_id','schema_version','value'] = '{}'::jsonb
    AND jsonb_typeof(${t.policy_payload}->'contract_id') = 'string'
    AND ${t.policy_payload}->>'contract_id' ~ '^[a-z][a-z0-9_]*$'
    AND jsonb_typeof(${t.policy_payload}->'schema_version') = 'number'
    AND ${t.policy_payload}->>'schema_version' ~ '^[1-9][0-9]{0,9}$'
    AND (${t.policy_payload}->>'schema_version')::numeric <= 2147483647
    AND jsonb_typeof(${t.policy_payload}->'value') = 'object') IS TRUE`),
]);

export const identityRetention = () => ({
  id: uuid('id').primaryKey(), schema_version: integer('schema_version').notNull(), created_at: instant('created_at').notNull(),
  retention_policy_id: keyText('retention_policy_id').notNull(), retention_policy_revision: integer('retention_policy_revision').notNull(),
});
export const mutable = () => ({ state_revision: integer('state_revision').notNull(), updated_at: instant('updated_at').notNull() });
type IdentityColumns = { [K in keyof ReturnType<typeof identityRetention>]: AnyPgColumn };
type MutableColumns = { [K in keyof ReturnType<typeof mutable>]: AnyPgColumn };
export const commonConstraints = (name: string, t: IdentityColumns) => [
  uuidCheck(`${name}_id_v7`, t.id), check(`${name}_schema_supported`, sql`${t.schema_version} = 1`),
  check(`${name}_created_finite`, sql`isfinite(${t.created_at})`),
  foreignKey({ name: `${name}_retention_fk`, columns: [t.retention_policy_id, t.retention_policy_revision],
    foreignColumns: [retentionPolicyRevisions.policy_id, retentionPolicyRevisions.revision] }).onDelete('no action').onUpdate('no action'),
];
export const mutableConstraints = (name: string, t: IdentityColumns & MutableColumns) => [
  ...commonConstraints(name, t), check(`${name}_state_revision_positive`, sql`${t.state_revision} > 0`),
  check(`${name}_updated_valid`, sql`isfinite(${t.updated_at}) AND ${t.updated_at} >= ${t.created_at}`),
];
export const optionalTime = (name: string, column: AnyPgColumn, created: AnyPgColumn, updated: AnyPgColumn) =>
  check(name, sql`${column} IS NULL OR (isfinite(${column}) AND ${column} >= ${created} AND ${column} <= ${updated})`);

export const accounts = rpg.table('accounts', {
  ...identityRetention(), ...mutable(), status: text('status', { enum: ['active', 'disabled', 'erasure_pending'] }).notNull(),
  disabled_at: instant('disabled_at'),
}, t => [
  ...mutableConstraints('accounts', t),
  check('accounts_status_valid', sql`${t.status} IN ('active','disabled','erasure_pending')`),
  check('accounts_disabled_state', sql`(${t.status} <> 'active' OR ${t.disabled_at} IS NULL)
    AND (${t.status} <> 'disabled' OR ${t.disabled_at} IS NOT NULL)`),
  optionalTime('accounts_disabled_time', t.disabled_at, t.created_at, t.updated_at),
]);

export const families = rpg.table('families', {
  ...identityRetention(), ...mutable(), display_name: text('display_name').notNull(),
  status: text('status', { enum: ['active', 'archived'] }).notNull(), zone_id: text('zone_id').notNull(),
  calendar_revision: integer('calendar_revision').notNull(), membership_revision: integer('membership_revision').notNull(),
  recurrence_paused: boolean('recurrence_paused').notNull(), recurrence_paused_at: instant('recurrence_paused_at'),
  archived_at: instant('archived_at'), last_resumed_at: instant('last_resumed_at'),
}, t => [
  ...mutableConstraints('families', t),
  check('families_status_valid', sql`${t.status} IN ('active','archived')`),
  check('families_revisions_positive', sql`${t.calendar_revision} > 0 AND ${t.membership_revision} > 0`),
  check('families_paused_state', sql`${t.recurrence_paused} = (${t.recurrence_paused_at} IS NOT NULL)`),
  check('families_archived_state', sql`${t.status} <> 'archived' OR ${t.archived_at} IS NOT NULL`),
  optionalTime('families_paused_time', t.recurrence_paused_at, t.created_at, t.updated_at),
  optionalTime('families_archived_time', t.archived_at, t.created_at, t.updated_at),
  optionalTime('families_resumed_time', t.last_resumed_at, t.created_at, t.updated_at),
]);

export const memberProfiles = rpg.table('member_profiles', {
  ...identityRetention(), ...mutable(), family_id: uuid('family_id').notNull(), display_name: text('display_name').notNull(),
  family_role: text('family_role', { enum: ['parent', 'child'] }).notNull(),
  status: text('status', { enum: ['active', 'archived', 'left'] }).notNull(),
  archived_at: instant('archived_at'), left_at: instant('left_at'),
}, t => [
  ...mutableConstraints('member_profiles', t),
  foreignKey({ name: 'member_profiles_family_fk', columns: [t.family_id], foreignColumns: [families.id] }).onDelete('no action').onUpdate('no action'),
  unique('member_profiles_family_id_uq').on(t.family_id, t.id),
  unique('member_profiles_family_id_role_uq').on(t.family_id, t.id, t.family_role),
  check('member_profiles_role_valid', sql`${t.family_role} IN ('parent','child')`),
  check('member_profiles_status_valid', sql`${t.status} IN ('active','archived','left')`),
  check('member_profiles_status_times', sql`(${t.status} = 'archived') = (${t.archived_at} IS NOT NULL)
    AND (${t.status} = 'left') = (${t.left_at} IS NOT NULL)`),
  optionalTime('member_profiles_archived_time', t.archived_at, t.created_at, t.updated_at),
  optionalTime('member_profiles_left_time', t.left_at, t.created_at, t.updated_at),
  index('member_profiles_home_idx').on(t.family_id, t.status, t.id),
]);

// Stable child subtype. No duplicate account, avatar, balance or XP state.
export const players = rpg.table('players', {
  ...identityRetention(), family_id: uuid('family_id').notNull(), profile_id: uuid('profile_id').notNull(),
  role: text('role', { enum: ['child'] }).notNull(),
}, t => [
  ...commonConstraints('players', t), check('players_child_only', sql`${t.role} = 'child'`),
  unique('players_family_id_uq').on(t.family_id, t.id),
  unique('players_family_profile_uq').on(t.family_id, t.profile_id),
  foreignKey({ name: 'players_child_profile_fk', columns: [t.family_id, t.profile_id, t.role],
    foreignColumns: [memberProfiles.family_id, memberProfiles.id, memberProfiles.family_role] }).onDelete('no action').onUpdate('no action'),
]);

export const foundationTables = [retentionPolicyRevisions, accounts, families, memberProfiles, players] as const;

// Explicit order: module namespace enumeration differs between native ESM and test transforms.
export const foundationSchema = { rpg, accounts, families, memberProfiles, players, retentionPolicyRevisions };
