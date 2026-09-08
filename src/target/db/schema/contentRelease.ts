import { sql } from 'drizzle-orm';
import { check, foreignKey, integer, jsonb, pgSchema, primaryKey, unique, uuid } from 'drizzle-orm/pg-core';
import { keyText, instant, uuidCheck } from './foundation';
import { targetSchema as accessSchema } from './accessLifecycle';

export const content = pgSchema('content');
const ref = () => ({ package_id: keyText('package_id').notNull(), package_version: keyText('package_version').notNull(), manifest_digest: keyText('manifest_digest').notNull() });
export const publicationOperations = content.table('publication_operations', {
  operation_id: uuid('operation_id').primaryKey(), request_digest: keyText('request_digest').notNull(),
  build_fingerprint: keyText('build_fingerprint').notNull(), actor_ref: keyText('actor_ref').notNull(),
  approval: jsonb('approval').$type<Record<string, unknown>>().notNull(), created_at: instant('created_at').notNull(),
}, t => [uuidCheck('publication_operation_v7', t.operation_id),
  check('publication_values', sql`${t.request_digest} ~ '^[a-f0-9]{64}$' AND ${t.build_fingerprint} ~ '^[a-f0-9]{64}$'
    AND ${t.actor_ref} ~ '^fixture:operator/[a-z][a-z0-9_]{0,63}$' AND jsonb_typeof(${t.approval})='object' AND isfinite(${t.created_at})`)]);

export const packageReleases = content.table('package_releases', {
  ...ref(), schema_version: integer('schema_version').notNull(), manifest: jsonb('manifest').$type<Record<string, unknown>>().notNull(),
  operation_id: uuid('operation_id').notNull(), created_at: instant('created_at').notNull(),
}, t => [primaryKey({ columns: [t.package_id, t.package_version] }), unique('package_releases_exact_uq').on(t.package_id,t.package_version,t.manifest_digest),
  foreignKey({ columns: [t.operation_id], foreignColumns: [publicationOperations.operation_id] }),
  check('package_release_values', sql`${t.package_id} ~ '^fixture:package/[a-z][a-z0-9_]*$'
    AND length(${t.package_version})<=64 AND ${t.package_version} ~ '^(0|[1-9][0-9]*)[.](0|[1-9][0-9]*)[.](0|[1-9][0-9]*)$'
    AND ${t.manifest_digest} ~ '^[a-f0-9]{64}$' AND ${t.schema_version}=1 AND jsonb_typeof(${t.manifest})='object' AND isfinite(${t.created_at})`)]);

export const releaseDependencies = content.table('release_dependencies', {
  ...ref(), dependency_id: keyText('dependency_id').notNull(), dependency_version: keyText('dependency_version').notNull(), dependency_digest: keyText('dependency_digest').notNull(),
}, t => [primaryKey({ columns: [t.package_id,t.package_version,t.dependency_id] }),
  foreignKey({ name: 'release_dependencies_source_fk', columns: [t.package_id,t.package_version,t.manifest_digest], foreignColumns: [packageReleases.package_id,packageReleases.package_version,packageReleases.manifest_digest] }),
  foreignKey({ name: 'release_dependencies_target_fk', columns: [t.dependency_id,t.dependency_version,t.dependency_digest], foreignColumns: [packageReleases.package_id,packageReleases.package_version,packageReleases.manifest_digest] })]);

export const releaseArtifacts = content.table('release_artifacts', {
  ...ref(), storage_key: keyText('storage_key').notNull(), digest: keyText('digest').notNull(), byte_size: integer('byte_size').notNull(),
}, t => [primaryKey({ columns: [t.package_id,t.package_version,t.storage_key] }),
  foreignKey({ name: 'release_artifacts_release_fk', columns: [t.package_id,t.package_version,t.manifest_digest], foreignColumns: [packageReleases.package_id,packageReleases.package_version,packageReleases.manifest_digest] }),
  check('release_artifacts_values', sql`${t.digest} ~ '^[a-f0-9]{64}$' AND ${t.byte_size} BETWEEN 1 AND 16777216
    AND ${t.storage_key} IN ('manifests/' || ${t.digest} || '.json','localizations/' || ${t.digest} || '.json')`)]);

export const activationSnapshots = content.table('activation_snapshots', {
  snapshot_id: uuid('snapshot_id').primaryKey(), scope_key: keyText('scope_key').notNull(), schema_version: integer('schema_version').notNull(),
  snapshot_digest: keyText('snapshot_digest').notNull(), descriptor: jsonb('descriptor').$type<Record<string, unknown>>().notNull(),
  operation_id: uuid('operation_id').notNull(), created_at: instant('created_at').notNull(),
}, t => [uuidCheck('activation_snapshot_v7', t.snapshot_id), uuidCheck('activation_snapshot_operation_v7', t.operation_id),
  unique('activation_snapshot_operation_uq').on(t.operation_id), unique('activation_snapshot_scope_uq').on(t.scope_key,t.snapshot_id),
  check('activation_snapshot_values', sql`${t.scope_key}='global' AND ${t.schema_version}=1 AND ${t.snapshot_digest} ~ '^[a-f0-9]{64}$'
    AND jsonb_typeof(${t.descriptor})='object' AND isfinite(${t.created_at})`)]);

export const snapshotPackages = content.table('snapshot_packages', {
  snapshot_id: uuid('snapshot_id').notNull(), ...ref(),
}, t => [primaryKey({ columns: [t.snapshot_id,t.package_id] }),
  unique('snapshot_packages_exact_uq').on(t.snapshot_id,t.package_id,t.package_version,t.manifest_digest),
  foreignKey({ columns: [t.snapshot_id], foreignColumns: [activationSnapshots.snapshot_id] }),
  foreignKey({ name: 'snapshot_packages_release_fk', columns: [t.package_id,t.package_version,t.manifest_digest], foreignColumns: [packageReleases.package_id,packageReleases.package_version,packageReleases.manifest_digest] })]);

export const activationHeads = content.table('activation_heads', {
  scope_key: keyText('scope_key').primaryKey(), snapshot_id: uuid('snapshot_id'), state_revision: integer('state_revision').notNull(),
}, t => [foreignKey({ name: 'activation_head_scope_fk', columns: [t.scope_key,t.snapshot_id], foreignColumns: [activationSnapshots.scope_key,activationSnapshots.snapshot_id] }),
  check('activation_head_values', sql`${t.scope_key}='global' AND ((${t.snapshot_id} IS NULL AND ${t.state_revision}=0) OR (${t.snapshot_id} IS NOT NULL AND ${t.state_revision}>0))`)]);

export const activationChanges = content.table('activation_changes', {
  operation_id: uuid('operation_id').primaryKey(), request_digest: keyText('request_digest').notNull(), previous_snapshot_id: uuid('previous_snapshot_id'),
  next_snapshot_id: uuid('next_snapshot_id').notNull(), state_revision: integer('state_revision').notNull(),
  reason: keyText('reason').notNull(), actor_ref: keyText('actor_ref').notNull(), activated_at: instant('activated_at').notNull(),
}, t => [uuidCheck('activation_change_operation_v7',t.operation_id),
  foreignKey({ columns: [t.previous_snapshot_id], foreignColumns: [activationSnapshots.snapshot_id] }),
  foreignKey({ columns: [t.next_snapshot_id], foreignColumns: [activationSnapshots.snapshot_id] }), unique('activation_change_next_uq').on(t.next_snapshot_id),
  check('activation_change_values',sql`${t.request_digest} ~ '^[a-f0-9]{64}$' AND ${t.state_revision}>0
    AND ${t.reason} IN ('initial','update','restore') AND ${t.actor_ref} ~ '^fixture:operator/[a-z][a-z0-9_]{0,63}$' AND isfinite(${t.activated_at})`)]);

export const releaseActivations = content.table('release_activations', {
  scope_key: keyText('scope_key').notNull(), snapshot_id: uuid('snapshot_id').notNull(), ...ref(),
}, t => [primaryKey({ columns: [t.scope_key,t.package_id] }),
  foreignKey({ name: 'release_activations_scope_fk', columns: [t.scope_key,t.snapshot_id], foreignColumns: [activationSnapshots.scope_key,activationSnapshots.snapshot_id] }),
  foreignKey({ name: 'release_activations_package_fk', columns: [t.snapshot_id,t.package_id,t.package_version,t.manifest_digest], foreignColumns: [snapshotPackages.snapshot_id,snapshotPackages.package_id,snapshotPackages.package_version,snapshotPackages.manifest_digest] })]);

export const localizationRevisions = content.table('localization_revisions', {
  bundle_id: keyText('bundle_id').notNull(), revision: integer('revision').notNull(), locale: keyText('locale').notNull(),
  semantic_digest: keyText('semantic_digest').notNull(), public_digest: keyText('public_digest').notNull(),
}, t => [primaryKey({ columns: [t.bundle_id,t.revision,t.locale] }),
  check('localization_revision_values',sql`${t.bundle_id} ~ '^fixture:localization/[a-z][a-z0-9_]*$' AND ${t.revision}>0
    AND length(${t.locale}) BETWEEN 2 AND 64 AND ${t.semantic_digest} ~ '^[a-f0-9]{64}$' AND ${t.public_digest} ~ '^[a-f0-9]{64}$'`)]);
export const releaseLocalizations = content.table('release_localizations', {
  ...ref(), bundle_id: keyText('bundle_id').notNull(), revision: integer('revision').notNull(), locale: keyText('locale').notNull(),
}, t => [primaryKey({ columns: [t.package_id,t.package_version,t.bundle_id,t.revision,t.locale] }),
  foreignKey({ name: 'release_localizations_release_fk',columns: [t.package_id,t.package_version,t.manifest_digest], foreignColumns: [packageReleases.package_id,packageReleases.package_version,packageReleases.manifest_digest] }),
  foreignKey({ name: 'release_localizations_record_fk',columns: [t.bundle_id,t.revision,t.locale], foreignColumns: [localizationRevisions.bundle_id,localizationRevisions.revision,localizationRevisions.locale] })]);
export const contentTables = { publicationOperations,packageReleases,releaseDependencies,releaseArtifacts,activationSnapshots,snapshotPackages,activationHeads,activationChanges,releaseActivations,localizationRevisions,releaseLocalizations };
export const targetSchema = { ...accessSchema, content, ...contentTables };
export const contentReleaseGuards = `
CREATE FUNCTION content.reject_release_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'content history is immutable' USING ERRCODE = '23514'; END;
$$;
${['publication_operations','package_releases','release_dependencies','release_artifacts','activation_snapshots','snapshot_packages','activation_changes','localization_revisions','release_localizations']
  .map(name => `CREATE TRIGGER ${name}_immutable BEFORE UPDATE OR DELETE ON content.${name} FOR EACH ROW EXECUTE FUNCTION content.reject_release_mutation();`).join('\n')}
INSERT INTO content.activation_heads (scope_key,snapshot_id,state_revision) VALUES ('global',NULL,0);
`;
