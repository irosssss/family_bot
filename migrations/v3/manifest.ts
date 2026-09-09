/** Immutable ordered migration identities; SQL changes require a new migration. */
export const V3_MIGRATION_MANIFEST = Object.freeze([
  Object.freeze({
    version: 1,
    name: '0001_foundation',
    file: new URL('./0001_foundation.sql', import.meta.url),
    sha256: '7434c5021732d36d4c519f51f12f5dac614d33fbd97e8f6147da434987166232',
  }),
  Object.freeze({
    version: 2,
    name: '0002_game_cycle',
    file: new URL('./0002_game_cycle.sql', import.meta.url),
    sha256: '674fbf6b7cf1b27efe780d3b69ebba15ffdb3c0322c049815fa52247c3f645ef',
  }),
  Object.freeze({
    version: 3,
    name: '0003_identity',
    file: new URL('./0003_identity.sql', import.meta.url),
    sha256: 'ded4337c26b50c327cebbf90b53f6f3b380eef1cd9ae54851a72d7a113f6731e',
  }),
]);
