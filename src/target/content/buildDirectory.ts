import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import type { compileFrozenContent } from './compiler';
import { assertCompilerResult } from './artifactAuthority';
import { canonicalJson } from './canonical';
import { ContentInputError } from './json';
import { newEntityId } from '../contracts/ids';

/** Writes a local candidate, never a release or activation. Existing destinations are refused. */
export async function writeContentCandidate(build: ReturnType<typeof compileFrozenContent>, directory: string) {
  assertCompilerResult(build);
  try { await mkdir(directory); }
  catch { throw new ContentInputError('OUTPUT_DIRECTORY_UNAVAILABLE', ''); }
  try {
    await mkdir(path.join(directory, 'runtime'));
    await mkdir(path.join(directory, 'private'), { mode: 0o700 });
    for (const artifact of build.artifacts) {
      // Paths originate only from the compiler, whose result is frozen and provenance-checked above.
      const file = path.join(directory, 'runtime', artifact.storage_key);
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, artifact.bytes, { flag: 'wx' });
    }
    await writeFile(path.join(directory, 'private', 'lock.json'), canonicalJson(build.lock), { flag: 'wx', mode: 0o600 });
    await writeFile(path.join(directory, 'private', 'dependency-locks.json'), canonicalJson(build.packages), { flag: 'wx', mode: 0o600 });
    await writeFile(path.join(directory, 'private', 'report.json'), canonicalJson(build.report), { flag: 'wx', mode: 0o600 });
    const candidate = { schema_version: 1, candidate_id: newEntityId(), planned_package_ref: build.root_package,
      build_fingerprint: build.build_fingerprint, manifest_digest: build.manifest_digest, lock_digest: build.lock_digest,
      status: 'local_candidate', created_at: new Date().toISOString(), previous_candidate_id: null, production_ready: false };
    // Completion record is last. Failed writes never receive this marker; no active pointer exists here.
    await writeFile(path.join(directory, 'private', 'candidate.json'), canonicalJson(candidate), { flag: 'wx', mode: 0o600 });
    return candidate;
  } catch { throw new ContentInputError('CANDIDATE_WRITE_FAILED', ''); }
}
