import { pathToFileURL } from 'node:url';
import { open } from 'node:fs/promises';
import { constants } from 'node:fs';
import { freezeContentSources, compileFrozenContent } from '../../src/target/content/compiler';
import { SYNTHETIC_BUILD_LIMITS } from '../../src/target/content/compilerContracts';
import { writeContentCandidate } from '../../src/target/content/buildDirectory';
import { ContentInputError, parseContentJson, SYNTHETIC_INPUT_LIMITS } from '../../src/target/content/json';

async function main() {
  const args = process.argv.slice(2);
  let expectedLock: unknown;
  const lockOption = args.indexOf('--check-lock');
  if (lockOption >= 0) {
    if (lockOption !== args.length - 2) throw new ContentInputError('INVALID_LOCK_OPTION', '');
    const lockFile = await open(args[lockOption + 1], constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    try {
      if (!(await lockFile.stat()).isFile()) throw new ContentInputError('INVALID_LOCK_FILE', '');
      const bytes = Buffer.alloc(1048577); let used = 0;
      while (used < bytes.length) { const read = await lockFile.read(bytes, used, bytes.length - used, used); if (!read.bytesRead) break; used += read.bytesRead; }
      expectedLock = parseContentJson(bytes.subarray(0, used), 'lock.json', { ...SYNTHETIC_INPUT_LIMITS, maxFileBytes: 1048576, maxNodes: 100000, maxDepth: 64 });
    } finally { await lockFile.close(); }
    args.splice(lockOption);
  }
  const [directory, packageId, packageVersion, namespace, ...sources] = args;
  if (!directory || !packageId || !packageVersion || !namespace || !sources.length) throw new ContentInputError('USAGE_OUTPUT_PACKAGE_VERSION_NAMESPACE_SOURCES', '');
  const snapshot = await freezeContentSources({ rootPackage: { package_id: packageId, package_version: packageVersion },
    sources: sources.map(root => ({ root, ownedNamespaces: [namespace] })), limits: SYNTHETIC_BUILD_LIMITS, requiredLocales: ['ru'] });
  const build = compileFrozenContent(snapshot, expectedLock);
  const candidate = await writeContentCandidate(build, directory);
  console.log(JSON.stringify({ ok: true, ...candidate, artifacts: build.artifacts.length }, null, 2));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) void main().catch(error => {
  const known = error instanceof ContentInputError;
  console.log(JSON.stringify({ ok: false, code: known ? error.code : 'COMPILER_UNAVAILABLE',
    file: known ? error.file : '', pointer: known ? error.pointer : '' }));
  process.exitCode = 1;
});
