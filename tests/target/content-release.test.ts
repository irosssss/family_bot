import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm, symlink, link, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { createLocalArtifactStore, openLocalArtifactStore } from '../../src/target/content/localStorage';
import { hashBytes } from '../../src/target/content/canonical';

describe('local immutable release storage (G04-C)',()=>{
  const cleanup:string[]=[];
  afterEach(async()=>{for(const root of cleanup.splice(0))await rm(root,{recursive:true,force:true});});
  async function fixture() {
    const parent=await mkdtemp(path.join(tmpdir(),'g04-c-storage-'));cleanup.push(parent);
    const {root,store}=await createLocalArtifactStore(parent),bytes='{"schema_version":1}';
    const digest=hashBytes(bytes),artifact={bytes,digest,storage_key:`manifests/${digest}.json`,byte_size:Buffer.byteLength(bytes)};
    return {parent,root,store,artifact};
  }
  it('persists exact bytes and verifies after reopening, including idempotent put',async()=>{
    const {root,store,artifact}=await fixture();await store.put(artifact);await store.put(artifact);
    await (await openLocalArtifactStore(root)).verify(artifact);
    expect(await readFile(path.join(root,artifact.storage_key),'utf8')).toBe(artifact.bytes);
  });
  it('never overwrites a conflicting existing object',async()=>{
    const {root,store,artifact}=await fixture();await store.put(artifact);
    await writeFile(path.join(root,artifact.storage_key),'x'.repeat(artifact.byte_size));
    await expect(store.put(artifact)).rejects.toThrow('STORAGE_BYTES_MISMATCH');
    expect(await readFile(path.join(root,artifact.storage_key),'utf8')).toBe('x'.repeat(artifact.byte_size));
  });
  it.each(['../other.json','manifests/../../other.json','Manifests/digest.json','localizations/no.json'])('rejects untrusted key %s',async(key)=>{
    const {store,artifact}=await fixture();await expect(store.put({...artifact,storage_key:key})).rejects.toThrow('STORAGE_ARTIFACT_INVALID');
  });
  it('rejects wrong size and digest before writing',async()=>{
    const {store,artifact}=await fixture();
    await expect(store.put({...artifact,byte_size:artifact.byte_size+1})).rejects.toThrow('STORAGE_ARTIFACT_INVALID');
    await expect(store.put({...artifact,bytes:'other'})).rejects.toThrow('STORAGE_ARTIFACT_INVALID');
    await expect(store.verify({...artifact,byte_size:16777217})).rejects.toThrow('STORAGE_ARTIFACT_INVALID');
  });
  it('rejects symlink files and hardlink aliases',async()=>{
    const {root,parent,store,artifact}=await fixture();const outside=path.join(parent,'outside.json');await writeFile(outside,artifact.bytes);
    const filename=path.join(root,artifact.storage_key);await symlink(outside,filename);
    await expect(store.verify(artifact)).rejects.toThrow();await unlink(filename);await link(outside,filename);
    await expect(store.verify(artifact)).rejects.toThrow('STORAGE_BYTES_MISMATCH');
  });
  it('rejects a symlink storage root and replaced subdirectory',async()=>{
    const {root,parent,store,artifact}=await fixture();const alias=path.join(parent,'alias');await symlink(root,alias);
    await expect(openLocalArtifactStore(alias)).rejects.toThrow('STORAGE_PATH_INVALID');
    await rm(path.join(root,'manifests'),{recursive:true});await symlink(parent,path.join(root,'manifests'));
    await expect(store.put(artifact)).rejects.toThrow('STORAGE_PATH_INVALID');
  });
  it('parallel identical writes leave one complete readable object',async()=>{
    const {store,artifact}=await fixture();await Promise.allSettled([store.put(artifact),store.put(artifact)]);
    await store.verify(artifact);await store.put(artifact);
  });
});
