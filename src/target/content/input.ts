import { constants } from 'node:fs';
import { lstat, open, readdir, realpath } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { checkedLimits, ContentInputError, parseContentJson, type InputLimits } from './json';
import { pathGroups, validatePackage, validateRecord, type LocalizationInput } from './schemas';

export function validateSourcePath(file: string): void {
  if (file.length > 512 || !file.split('/').every(segment => /^[A-Za-z0-9_-][A-Za-z0-9_.-]*$/.test(segment))) {
    throw new ContentInputError('INVALID_PATH', file);
  }
}
/** Caller supplies a stable local snapshot. Concurrent hostile filesystem writers are unsupported. */
export async function readContentPackage(config: { root: string; ownedNamespaces: readonly string[]; limits: InputLimits }) {
  const limits = checkedLimits(config.limits);
  const ownedNamespaces = new Set(config.ownedNamespaces);
  if (!ownedNamespaces.size || [...ownedNamespaces].some(ns => !/^[a-z][a-z0-9_]*$/.test(ns))) throw new ContentInputError('INVALID_NAMESPACE_POLICY', '');
  let root: string;
  try {
    if ((await lstat(config.root)).isSymbolicLink()) throw new Error();
    root = await realpath(config.root);
    if (!(await lstat(root)).isDirectory()) throw new Error();
  } catch { throw new ContentInputError('INVALID_SOURCE_ROOT', ''); }
  let totalBytes = 0;
  const hashes: { path: string; raw_digest: string; byte_size: number }[] = [];
  async function read(file: string) {
    validateSourcePath(file);
    let current = root;
    try {
      for (const segment of file.split('/')) {
        // Exact directory entry names also work on case-insensitive macOS volumes.
        const entries = await readdir(current);
        if (!entries.includes(segment)) throw new ContentInputError('PATH_CASE_OR_MISSING', file);
        current = path.join(current, segment);
        if ((await lstat(current)).isSymbolicLink()) throw new ContentInputError('SYMLINK_FORBIDDEN', file);
      }
      const resolved = await realpath(current);
      if (!resolved.startsWith(root + path.sep)) throw new ContentInputError('FILE_OUTSIDE_ROOT', file);
      const handle = await open(resolved, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
      try {
        const before = await handle.stat();
        if (!before.isFile() || before.nlink !== 1) throw new ContentInputError('REGULAR_FILE_REQUIRED', file);
        if (before.size > limits.maxFileBytes) throw new ContentInputError('FILE_TOO_LARGE', file);
        const buffer = Buffer.alloc(Math.min(limits.maxFileBytes, limits.maxTotalBytes - totalBytes) + 1);
        let used = 0;
        while (used < buffer.length) {
          const read = await handle.read(buffer, used, buffer.length - used, used);
          if (!read.bytesRead) break;
          used += read.bytesRead;
        }
        const after = await handle.stat();
        if (before.size !== after.size || before.mtimeMs !== after.mtimeMs || used !== after.size) throw new ContentInputError('SOURCE_CHANGED_OR_LIMIT', file);
        totalBytes += used;
        if (totalBytes > limits.maxTotalBytes) throw new ContentInputError('TOTAL_BYTE_LIMIT', file);
        const bytes = buffer.subarray(0, used);
        const result = parseContentJson(bytes, file, limits);
        hashes.push({ path: file, raw_digest: createHash('sha256').update(bytes).digest('hex'), byte_size: used });
        return result;
      } finally { await handle.close(); }
    } catch (error) {
      if (error instanceof ContentInputError) throw error;
      throw new ContentInputError('SOURCE_UNAVAILABLE', file);
    }
  }
  const manifest = validatePackage(await read('package.json'), 'package.json');
  const namespace = manifest.package_id.split(':')[0];
  if (!ownedNamespaces.has(namespace)) throw new ContentInputError('NAMESPACE_NOT_OWNED', 'package.json', '/package_id');
  const paths = new Set(['package.json']);
  const planned: { file: string; group: typeof pathGroups[number] }[] = [];
  // Validate every path before opening any record file.
  for (const group of pathGroups) for (const file of manifest[group]) {
    validateSourcePath(file);
    const key = file.toLowerCase();
    if (paths.has(key)) throw new ContentInputError('PATH_COLLISION', 'package.json', `/${group}`);
    paths.add(key); planned.push({ file, group });
  }
  if (planned.length + 1 > limits.maxFiles) throw new ContentInputError('FILE_COUNT_LIMIT', 'package.json');
  const records: { path: string; value: LocalizationInput }[] = [];
  const identities = new Set<string>();
  for (const { file, group } of planned) {
    const record = validateRecord(await read(file), file);
    if (group !== 'localization_paths') throw new ContentInputError('WRONG_RECORD_GROUP', file);
    if (record.bundle_id.split(':')[0] !== namespace) throw new ContentInputError('NAMESPACE_NOT_OWNED', file, '/bundle_id');
    const identity = JSON.stringify([record.bundle_id, record.revision, record.locale]);
    if (identities.has(identity)) throw new ContentInputError('REVISION_REWRITE', file);
    identities.add(identity);
    records.push({ path: file, value: record });
  }
  return { schema_version: 1 as const, stage: 'structural_validation' as const, limits,
    package: manifest, records, inputs: hashes, total_bytes: totalBytes };
}
