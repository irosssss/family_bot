import { createContentSchemaValidator } from './schemaValidator';
import { ContentInputError, SYNTHETIC_INPUT_LIMITS, type InputLimits, checkedLimits } from './json';
import { freezeJson, hashJson } from './canonical';
import { packageInputSchema, localizationInputSchema } from './schemas';

export interface PackageRef { package_id: string; package_version: string }
export interface BuildLimits {
  id: string; revision: number; input: InputLimits; maxPackages: number; maxDependencyDepth: number;
  maxRecords: number; maxTotalInputBytes: number; maxOutputBytes: number;
}
export const SYNTHETIC_BUILD_LIMITS: Readonly<BuildLimits> = freezeJson({ id: 'synthetic_content_build', revision: 1,
  input: SYNTHETIC_INPUT_LIMITS, maxPackages: 32, maxDependencyDepth: 16,
  maxRecords: 1024, maxTotalInputBytes: 4194304, maxOutputBytes: 4194304 });
export function checkedBuildLimits(input: BuildLimits): Readonly<BuildLimits> {
  const ceilings = { revision: 2147483647, maxPackages: 64, maxDependencyDepth: 32,
    maxRecords: 4096, maxTotalInputBytes: 16777216, maxOutputBytes: 16777216 };
  if (!input || typeof input.id !== 'string' || !/^[a-z][a-z0-9_]{0,63}$/.test(input.id)
    || Object.keys(input).length !== 8) throw new ContentInputError('INVALID_BUILD_LIMITS', '');
  for (const [key, max] of Object.entries(ceilings)) {
    const value = input[key as keyof typeof ceilings];
    if (!Number.isSafeInteger(value) || value < 1 || value > max) throw new ContentInputError('INVALID_BUILD_LIMITS', '');
  }
  return freezeJson({ ...input, input: checkedLimits(input.input) });
}
export const COMPATIBILITY_PROFILE = freezeJson({ registry_id: 'fixture:registry/plain_text_compatibility', revision: 1,
  schema_version: 1, required_capabilities: ['plain_text_localization'], runtime_schema: 'urn:family-rpg:schema:localization-runtime:1',
  mode: 'local_candidate_only', supports_arguments: false });

const string = { type: 'string', minLength: 1 };
const revision = { type: 'integer', minimum: 1, maximum: 2147483647 };
const digest = { type: 'string', pattern: '^[a-f0-9]{64}$' };
const object = (properties: Record<string, unknown>) => ({ type: 'object', additionalProperties: false, required: Object.keys(properties), properties });
const array = (items: unknown) => ({ type: 'array', items });
const schema = (id: string, properties: Record<string, unknown>) => freezeJson({ $schema: 'https://json-schema.org/draft/2020-12/schema', $id: `urn:family-rpg:schema:${id}:1`, ...object(properties) });
export const packageRefSchema = object({ package_id: { ...string, pattern: '^[a-z][a-z0-9_]*:package/[a-z][a-z0-9_]*$' },
  package_version: { ...string, maxLength: 64, pattern: '^(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)$' } });
const registryRef = object({ registry_id: string, revision });
const schemaRef = object({ contract_id: string, schema_version: revision, schema_digest: digest });
const localizationRef = object({ bundle_id: string, revision, locale: string });
export const runtimeLocalizationSchema = schema('localization-runtime', {
  schema_version: { const: 1 }, bundle_id: string, revision, locale: string,
  fallback_locale: { anyOf: [string, { type: 'null' }] }, entries: array(object({ key: string, message: string, syntax: { const: 'plain_text' } })),
});
export const lockSchema = schema('local-content-lock', {
  schema_version: { const: 1 }, root_package: packageRefSchema,
  packages: array(object({ package_ref: packageRefSchema, semantic_digest: digest,
    manifest_digest: { anyOf: [digest, { type: 'null' }] } })),
  records: array(object({ kind: { const: 'localization_bundle' }, ref: localizationRef, semantic_digest: digest, supplier: packageRefSchema })),
  binary_inputs: { type: 'array', maxItems: 0 }, schema_refs: array(schemaRef),
  toolchain: object({ compiler: { const: 'family_content_plain_text' }, compiler_version: { const: '1.0.0' },
    exporter_version: { const: '1.0.0' }, canonicalization: { const: 'rfc8785' }, hash_scope_version: { const: 1 },
    ajv_version: { const: '8.20.0' }, node_version: string, unicode_version: string, icu_version: string,
    configuration_digest: digest }), optional_resolutions: { type: 'array', maxItems: 0 },
});
export const manifestSchema = schema('local-content-manifest', {
  schema_version: { const: 1 }, package: packageRefSchema, lock_digest: digest,
  runtime_schema_refs: array(schemaRef), required_capabilities: { type: 'array', items: { const: 'plain_text_localization' }, uniqueItems: true },
  compatibility_contract: registryRef, dependencies: array(object({ package_ref: packageRefSchema, manifest_digest: digest })),
  records: { type: 'array', maxItems: 0 }, assets: { type: 'array', maxItems: 0 },
  localizations: array(object({ ref: localizationRef, public_projection_digest: digest, storage_key: string,
    byte_size: { type: 'integer', minimum: 1 }, digest_scope: { const: 'jcs_sha256' } })),
  attribution: { type: 'array', maxItems: 0 }, migration_refs: { type: 'array', maxItems: 0 },
});
const ajv = createContentSchemaValidator();
const validateRef = ajv.compile<PackageRef>(packageRefSchema);
const validators = { lock: ajv.compile(lockSchema), manifest: ajv.compile(manifestSchema), runtime: ajv.compile(runtimeLocalizationSchema) };
export function packageRef(input: unknown): PackageRef {
  if (!validateRef(input)) throw new ContentInputError('INVALID_PACKAGE_REF', '');
  return { package_id: input.package_id, package_version: input.package_version };
}
export function validateCompiled(kind: keyof typeof validators, value: unknown): void {
  const validate = validators[kind];
  if (!validate(value)) throw new ContentInputError('COMPILER_CONTRACT_FAILED', '', validate.errors?.[0].instancePath);
}
export const schemaRegistry = freezeJson([packageInputSchema, localizationInputSchema, runtimeLocalizationSchema, lockSchema, manifestSchema]
  .map(value => ({ contract_id: value.$id, schema_version: 1, schema_digest: hashJson(value) }))
  .sort((a, b) => a.contract_id < b.contract_id ? -1 : a.contract_id > b.contract_id ? 1 : 0));
freezeJson(packageInputSchema); freezeJson(localizationInputSchema);
