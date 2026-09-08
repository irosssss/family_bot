import { readContentPackage } from '../../src/target/content/input';
import { ContentInputError, SYNTHETIC_INPUT_LIMITS } from '../../src/target/content/json';
import { pathToFileURL } from 'node:url';

// Intentionally synthetic-only: production budgets, namespace authority and publication are separate.
async function main() {
  const [root, namespace, ...extra] = process.argv.slice(2);
  if (!root || !namespace || extra.length) throw new ContentInputError('USAGE_ROOT_NAMESPACE', '');
  const result = await readContentPackage({ root, ownedNamespaces: [namespace], limits: SYNTHETIC_INPUT_LIMITS });
  console.log(JSON.stringify({ ok: true, stage: result.stage, package_id: result.package.package_id,
    package_version: result.package.package_version, records: result.records.length,
    inputs: result.inputs, limits: result.limits.id, production_ready: false }, null, 2));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) void main().catch(error => {
  const known = error instanceof ContentInputError;
  console.log(JSON.stringify({ ok: false, code: known ? error.code : 'VALIDATOR_UNAVAILABLE',
    file: known ? error.file : '', pointer: known ? error.pointer : '' }));
  process.exitCode = 1;
});
