import { constants } from 'node:fs';
import { lstat, mkdir, mkdtemp, open, realpath, link, unlink } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { hashBytes } from './canonical';
import { ContentInputError } from './json';
import type { OutputArtifact } from './compiler';

export interface ArtifactStore {
  put(artifact: OutputArtifact): Promise<void>;
  verify(artifact: Pick<OutputArtifact, 'storage_key' | 'digest' | 'byte_size'>): Promise<void>;
}
const fail = (code: string): never => { throw new ContentInputError(code, ''); };
const keyPattern = /^(manifests|localizations)\/([a-f0-9]{64})\.json$/;
const maximumBytes = 16 * 1024 * 1024;

/** Trusted private local directory; the owner must exclude hostile concurrent filesystem writers. */
export async function openLocalArtifactStore(directory: string): Promise<ArtifactStore> {
  const root = path.resolve(directory);
  async function directories() {
    if (await realpath(root) !== root) fail('STORAGE_PATH_INVALID');
    for (const name of ['', 'manifests', 'localizations']) {
      const info = await lstat(path.join(root, name));
      if (!info.isDirectory() || info.isSymbolicLink()) fail('STORAGE_PATH_INVALID');
    }
  }
  await directories();
  function target(artifact: Pick<OutputArtifact, 'storage_key' | 'digest' | 'byte_size'>) {
    const match = keyPattern.exec(artifact.storage_key);
    if (!match || match[2] !== artifact.digest || !Number.isSafeInteger(artifact.byte_size)
      || artifact.byte_size < 1 || artifact.byte_size > maximumBytes) fail('STORAGE_ARTIFACT_INVALID');
    return path.join(root, artifact.storage_key);
  }
  async function verify(artifact: Pick<OutputArtifact, 'storage_key' | 'digest' | 'byte_size'>) {
    const filename = target(artifact);
    await directories();
    const file = await open(filename, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    try {
      const info = await file.stat();
      if (!info.isFile() || info.nlink !== 1 || info.size !== artifact.byte_size) fail('STORAGE_BYTES_MISMATCH');
      const bytes = Buffer.alloc(artifact.byte_size + 1);
      let offset = 0;
      while (offset < bytes.length) {
        const { bytesRead } = await file.read(bytes, offset, bytes.length - offset, offset);
        if (!bytesRead) break;
        offset += bytesRead;
      }
      if (offset !== artifact.byte_size || hashBytes(bytes.subarray(0, offset)) !== artifact.digest) fail('STORAGE_BYTES_MISMATCH');
    } finally { await file.close(); }
  }
  return {
    verify,
    async put(artifact) {
      const filename = target(artifact);
      if (typeof artifact.bytes !== 'string' || Buffer.byteLength(artifact.bytes) !== artifact.byte_size
        || hashBytes(artifact.bytes) !== artifact.digest) fail('STORAGE_ARTIFACT_INVALID');
      await directories();
      const temporary = path.join(root, `.staged-${randomUUID()}`);
      const file = await open(temporary, 'wx', 0o600);
      try { await file.writeFile(artifact.bytes, 'utf8'); await file.sync(); }
      finally { await file.close(); }
      try {
        try { await link(temporary, filename); }
        catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
      } finally { await unlink(temporary); }
      await verify(artifact);
      const folder = await open(path.dirname(filename), constants.O_RDONLY);
      try { await folder.sync(); } finally { await folder.close(); }
    },
  };
}

export async function createLocalArtifactStore(parent: string) {
  const root = await mkdtemp(path.join(await realpath(parent), 'content-store-'));
  await mkdir(path.join(root, 'manifests'), { mode: 0o700 });
  await mkdir(path.join(root, 'localizations'), { mode: 0o700 });
  return { root, store: await openLocalArtifactStore(root) };
}
