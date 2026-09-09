/** Immutable ordered migration identities; SQL changes require a new migration. */
export const V3_MIGRATION_MANIFEST = Object.freeze([
  Object.freeze({
    version: 1,
    name: '0001_foundation',
    file: new URL('./0001_foundation.sql', import.meta.url),
    sha256: '7434c5021732d36d4c519f51f12f5dac614d33fbd97e8f6147da434987166232',
  }),
]);
