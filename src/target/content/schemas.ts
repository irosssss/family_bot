import { createContentSchemaValidator } from './schemaValidator';
import { ContentInputError, pointerKey } from './json';

const string = { type: 'string', minLength: 1 };
const key = { ...string, pattern: '^[a-z][a-z0-9_]*$' };
const textKey = { ...string, pattern: '^[a-z][a-z0-9_]*(\\.[a-z][a-z0-9_]*)+$' };
const localizationId = { ...string, pattern: '^[a-z][a-z0-9_]*:localization/[a-z][a-z0-9_]*$' };
const packageId = { ...string, pattern: '^[a-z][a-z0-9_]*:package/[a-z][a-z0-9_]*$' };
const version = { ...string, maxLength: 64, pattern: '^(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)$' };
const revision = { type: 'integer', minimum: 1, maximum: 2147483647 };
const object = (properties: Record<string, unknown>) => ({ type: 'object', additionalProperties: false, required: Object.keys(properties), properties });
const list = (items: unknown) => ({ type: 'array', uniqueItems: true, items });
const schema = (id: string, properties: Record<string, unknown>) => ({
  $schema: 'https://json-schema.org/draft/2020-12/schema', $id: `urn:family-rpg:schema:${id}:1`, ...object(properties),
});
export const pathGroups = ['definition_paths', 'asset_paths', 'registry_paths', 'localization_paths', 'offer_paths', 'credit_paths', 'rights_paths'] as const;
export interface PackageInput {
  schema_version: 1; package_id: string; package_version: string; name_key: string;
  purpose: 'core' | 'season' | 'city' | 'mode' | 'expansion';
  definition_paths: string[]; asset_paths: string[]; registry_paths: string[]; localization_paths: string[];
  offer_paths: string[]; credit_paths: string[]; rights_paths: string[];
  depends_on: { package_id: string; package_version: string }[]; required_capabilities: string[];
}
export interface LocalizationInput {
  record_type: 'localization_bundle'; schema_version: 1; bundle_id: string; revision: number;
  locale: string; fallback_locale: string | null;
  entries: { key: string; message: string; syntax: 'plain_text'; status: 'draft' | 'reviewed' }[];
}
export const packageInputSchema = schema('package-input', {
  schema_version: { const: 1 }, package_id: packageId, package_version: version, name_key: textKey,
  purpose: { enum: ['core', 'season', 'city', 'mode', 'expansion'] },
  ...Object.fromEntries(pathGroups.map(group => [group, list(string)])),
  depends_on: list(object({ package_id: packageId, package_version: version })), required_capabilities: list(key),
});
// Explicit minimal syntax. ICU/arguments need their own registered handler and tests.
export const localizationInputSchema = schema('localization-input', {
  record_type: { const: 'localization_bundle' }, schema_version: { const: 1 }, bundle_id: localizationId, revision,
  locale: string, fallback_locale: { anyOf: [string, { type: 'null' }] },
  entries: list(object({ key: textKey, message: { ...string, pattern: '^[^<>\\u0000-\\u0008\\u000b\\u000c\\u000e-\\u001f]*$' },
    syntax: { const: 'plain_text' }, status: { enum: ['draft', 'reviewed'] } })),
});
const ajv = createContentSchemaValidator();
const packageValidator = ajv.compile<PackageInput>(packageInputSchema);
const localizationValidator = ajv.compile<LocalizationInput>(localizationInputSchema);
export function validatePackage(input: unknown, file: string): PackageInput {
  if (!packageValidator(input)) {
    const error = packageValidator.errors![0];
    throw new ContentInputError('INVALID_FIELD', file, error.instancePath + (error.keyword === 'additionalProperties' ? `/${pointerKey(error.params.additionalProperty)}` : ''));
  }
  return input;
}
export function validateRecord(input: unknown, file: string): LocalizationInput {
  if (!input || typeof input !== 'object' || !('record_type' in input) || input.record_type !== 'localization_bundle') throw new ContentInputError('UNKNOWN_CONTRACT', file);
  if (!('schema_version' in input) || input.schema_version !== 1) throw new ContentInputError('UNSUPPORTED_SCHEMA', file, '/schema_version');
  if (!localizationValidator(input)) throw new ContentInputError('INVALID_FIELD', file, localizationValidator.errors![0].instancePath);
  const keys = new Set<string>();
  for (const [i, entry] of input.entries.entries()) {
    if (keys.has(entry.key)) throw new ContentInputError('DUPLICATE_TEXT_KEY', file, `/entries/${i}/key`);
    // Pictographs alone omit flags/modifiers and keycaps; ordinary digits, # and * remain valid text.
    if (/[\p{Extended_Pictographic}\p{Emoji_Presentation}]|[#*0-9]\uFE0F?\u20E3/u.test(entry.message)) throw new ContentInputError('INVALID_MESSAGE', file, `/entries/${i}/message`);
    keys.add(entry.key);
  }
  for (const field of ['locale', 'fallback_locale'] as const) {
    if (input[field] === null) continue;
    try { if (Intl.getCanonicalLocales(input[field])[0] !== input[field]) throw new Error(); }
    catch { throw new ContentInputError('INVALID_LOCALE', file, `/${field}`); }
  }
  if (input.fallback_locale === input.locale) throw new ContentInputError('FALLBACK_CYCLE', file, '/fallback_locale');
  return input;
}
