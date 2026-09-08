import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { generateDrizzleJson, generateMigration } from 'drizzle-kit/api';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createTargetClient, assertTargetDatabase } from '../../src/target/db/client';
import { openTargetDatabase } from '../../src/target/db/database';
import { readTargetConfig } from '../../src/target/config';
import { runTargetMigrations } from '../../src/target/db/migrator';
import { assertOwnedContainer } from '../../scripts/target/test-environment';
import { newEntityId } from '../../src/target/contracts/ids';
import { compileFrozenContent, freezeContentSources } from '../../src/target/content/compiler';
import { SYNTHETIC_BUILD_LIMITS } from '../../src/target/content/compilerContracts';
import { createLocalReleaseService, type LocalReleaseAction } from '../../src/target/content/localRelease';
import { createLocalArtifactStore, type ArtifactStore } from '../../src/target/content/localStorage';
import { targetSchema as accessSchema } from '../../src/target/db/schema/accessLifecycle';
import { content, targetSchema, contentReleaseGuards, packageReleases, publicationOperations, activationHeads, activationSnapshots,
  activationChanges, releaseActivations, snapshotPackages, releaseDependencies, releaseArtifacts, localizationRevisions } from '../../src/target/db/schema/contentRelease';

describe.skipIf(process.env.RPG_TARGET_PG_TESTS!=='1')('local publication and activation in owned PostgreSQL (G04-C)',()=>{
  let config:ReturnType<typeof readTargetConfig>,raw:ReturnType<typeof createTargetClient>;
  let database:Awaited<ReturnType<typeof openTargetDatabase>>,other:typeof database;
  let parent:string,storeRoot:string,store:ArtifactStore,service:ReturnType<typeof createLocalReleaseService>;
  let candidate:ReturnType<typeof compileFrozenContent>,tick:number,denied:Set<LocalReleaseAction>;
  const actor='fixture:operator/publisher',reviewer='fixture:operator/reviewer';
  const make=(db=database.db,storage=store)=>createLocalReleaseService(db,storage,{mode:'synthetic_local_only',now:()=>tick,
    authorize:(who,action)=>!denied.has(action)&&(action==='review'?who===reviewer:who===actor)});
  async function build(root=path.resolve('tests/fixtures/content/g04-b'),version='1.0.0') {
    return compileFrozenContent(await freezeContentSources({rootPackage:{package_id:'fixture:package/root_texts',package_version:version},
      sources:['root','base'].map(name=>({root:path.join(root,name),ownedNamespaces:['fixture']})),limits:SYNTHETIC_BUILD_LIMITS,requiredLocales:['ru']}));
  }
  beforeAll(async()=>{
    config=readTargetConfig(process.env);await assertOwnedContainer({id:process.env.RPG_TARGET_CONTAINER_ID??'',runId:config.runId});
    raw=createTargetClient(config);await assertTargetDatabase(raw,config);database=await openTargetDatabase(config);other=await openTargetDatabase(config);
    candidate=await build();
  });
  beforeEach(async()=>{
    tick=Date.parse('2026-09-08T00:00:00Z');denied=new Set();await runTargetMigrations(raw,config,'migrations/target');
    parent=await mkdtemp(path.join(tmpdir(),'g04-c-pg-'));const created=await createLocalArtifactStore(parent);storeRoot=created.root;store=created.store;service=make();
  });
  afterEach(async()=>{await assertTargetDatabase(raw,config);await raw`DROP SCHEMA IF EXISTS content CASCADE`;await raw`DROP SCHEMA IF EXISTS rpg CASCADE`;await rm(parent,{recursive:true,force:true});});
  afterAll(async()=>{await other?.close();await database?.close();await raw?.end({timeout:5});});
  const exact=(value=candidate)=>value.packages.map(pkg=>({...pkg.package_ref,manifest_digest:pkg.manifest_digest}));
  const input=(expected=0,packages=exact())=>({packages,expected_revision:expected,operation_id:newEntityId(),reason:'update' as const});
  async function publish(value=candidate,svc=service,op=newEntityId()) {const approval=await svc.review(value,reviewer);return svc.publish(value,approval,actor,op);}
  const head=()=>database.db.transaction(tx=>service.readHead(tx));
  async function changed(options:{version?:boolean;revision?:boolean;message?:boolean}={}) {
    const root=path.join(parent,`sources-${newEntityId()}`);await cp('tests/fixtures/content/g04-b',root,{recursive:true});
    if(options.version) {const filename=path.join(root,'root','package.json'),value=JSON.parse(await readFile(filename,'utf8'));value.package_version='1.0.1';await writeFile(filename,JSON.stringify(value));}
    if(options.message||options.revision) {const filename=path.join(root,'root','texts.json'),value=JSON.parse(await readFile(filename,'utf8'));
      if(options.message)value.entries[0].message='Новая проверочная строка';if(options.revision)value.revision=2;await writeFile(filename,JSON.stringify(value));}
    return build(root,options.version?'1.0.1':'1.0.0');
  }
  it('registers the whole graph and normalized refs without activating it',async()=>{
    const result=await publish();expect(result.production_ready).toBe(false);expect(await head()).toEqual({snapshot_id:null,state_revision:0,packages:[]});
    expect(await database.db.select().from(packageReleases)).toHaveLength(2);
    expect(await database.db.select().from(releaseDependencies)).toHaveLength(1);
    expect(await database.db.select().from(releaseArtifacts)).toHaveLength(4);
    expect(await database.db.select().from(localizationRevisions)).toHaveLength(2);
  });
  it('replays an exact publication once, including concurrent separate connections',async()=>{
    const op=newEntityId(),another=make(other.db),token=await service.review(candidate,reviewer),otherToken=await another.review(candidate,reviewer);
    const results=await Promise.all([service.publish(candidate,token,actor,op),another.publish(candidate,otherToken,actor,op)]);
    expect(results[0]).toEqual(results[1]);expect(await database.db.select().from(publicationOperations)).toHaveLength(1);
    await publish();expect(await database.db.select().from(packageReleases)).toHaveLength(2);
  });
  it('rejects a changed request under an existing operation id',async()=>{
    const op=newEntityId();await publish(candidate,service,op);const next=await changed({version:true,revision:true,message:true});
    await expect(publish(next,service,op)).rejects.toThrow('OPERATION_CONFLICT');
    expect(await database.db.select().from(packageReleases)).toHaveLength(2);
  });
  it('replays a committed publication after approval expiry without accessing storage',async()=>{
    const op=newEntityId(),token=await service.review(candidate,reviewer);
    const receipt=await service.publish(candidate,token,actor,op);tick+=600000;denied.add('review');
    let storageCalls=0;
    const restarted=make(other.db,{put:async()=>{storageCalls++;throw new Error('storage offline');},verify:async()=>{storageCalls++;throw new Error('storage offline');}});
    expect(await restarted.publish(candidate,token,actor,op)).toEqual(receipt);
    expect(storageCalls).toBe(0);expect(await database.db.select().from(publicationOperations)).toHaveLength(1);
    const next=await changed({version:true,revision:true,message:true});
    await expect(restarted.publish(next,token,actor,op)).rejects.toThrow('OPERATION_CONFLICT');
    denied.add('publish');await expect(restarted.publish(candidate,token,actor,op)).rejects.toThrow('RELEASE_FORBIDDEN');
  });
  it('rechecks the receipt before approval when another publisher commits during staging',async()=>{
    const op=newEntityId(),another=make(other.db),otherToken=await another.review(candidate,reviewer);
    let calls=0;
    const delayed=make(database.db,{put:a=>store.put(a),verify:async a=>{
      await store.verify(a);
      if(++calls===candidate.artifacts.length){await another.publish(candidate,otherToken,actor,op);tick+=600000;}
    }});
    const token=await delayed.review(candidate,reviewer);
    expect((await delayed.publish(candidate,token,actor,op)).operation_id).toBe(op);
    expect(await database.db.select().from(publicationOperations)).toHaveLength(1);
  });
  it('rejects a different digest at an existing package version',async()=>{
    await publish();const next=await changed({message:true});await expect(publish(next)).rejects.toThrow('RELEASE_VERSION_CONFLICT');
    expect(await database.db.select().from(publicationOperations)).toHaveLength(1);
  });
  it('rejects revision rewrite across different releases and rolls back the batch',async()=>{
    await publish();const next=await changed({version:true,message:true});await expect(publish(next)).rejects.toThrow('REVISION_REWRITE');
    expect(await database.db.select().from(packageReleases)).toHaveLength(2);expect(await database.db.select().from(publicationOperations)).toHaveLength(1);
  });
  it('does not accept fabricated results, copied approvals, or approval for another frozen build',async()=>{
    const token=await service.review(candidate,reviewer);
    await expect(service.publish({...candidate},token,actor,newEntityId())).rejects.toThrow('UNTRUSTED_COMPILER_RESULT');
    await expect(service.publish(candidate,{...token},actor,newEntityId())).rejects.toThrow('APPROVAL_MISMATCH');
    await expect(service.publish(await build(),token,actor,newEntityId())).rejects.toThrow('APPROVAL_MISMATCH');
  });
  it('refuses family roles and revoked operator actions',async()=>{
    await expect(service.review(candidate,'parent')).rejects.toThrow('RELEASE_FORBIDDEN');
    const token=await service.review(candidate,reviewer);denied.add('review');
    await expect(service.publish(candidate,token,actor,newEntityId())).rejects.toThrow('RELEASE_FORBIDDEN');
    denied.clear();denied.add('publish');await expect(service.publish(candidate,token,actor,newEntityId())).rejects.toThrow('RELEASE_FORBIDDEN');
    denied.clear();await publish();denied.add('activate');await expect(service.activate(input(),actor)).rejects.toThrow('RELEASE_FORBIDDEN');
  });
  it('checks approval expiry both before staging and again before DB registration',async()=>{
    const token=await service.review(candidate,reviewer);tick+=600000;
    await expect(service.publish(candidate,token,actor,newEntityId())).rejects.toThrow('APPROVAL_EXPIRED');
    let calls=0;const slow=make(database.db,{put:a=>store.put(a),verify:async a=>{await store.verify(a);if(++calls===candidate.artifacts.length)tick+=600000;}});
    const fresh=await slow.review(candidate,reviewer);await expect(slow.publish(candidate,fresh,actor,newEntityId())).rejects.toThrow('APPROVAL_EXPIRED');
    expect(await database.db.select().from(packageReleases)).toHaveLength(0);
  });
  it('an interrupted upload leaves no published release and keeps the previous head',async()=>{
    await publish();await service.activate(input(),actor);const before=await head(),next=await changed({version:true,revision:true,message:true});
    let calls=0;const broken=make(database.db,{put:async a=>{if(++calls===2)throw new Error('fixture upload interrupted');await store.put(a);},verify:a=>store.verify(a)});
    await expect(publish(next,broken)).rejects.toThrow('fixture upload interrupted');expect(await head()).toEqual(before);
    expect(await database.db.select().from(packageReleases)).toHaveLength(2);
  });
  it('readback failure prevents DB publication',async()=>{
    const broken=make(database.db,{put:a=>store.put(a),verify:async()=>{throw new Error('fixture readback failed');}});
    await expect(publish(candidate,broken)).rejects.toThrow('fixture readback failed');expect(await database.db.select().from(publicationOperations)).toHaveLength(0);
  });
  it('a DB failure after file staging leaves orphan bytes and no partial graph',async()=>{
    await raw`CREATE FUNCTION content.test_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture db failed'; END $$`;
    await raw`CREATE TRIGGER test_fail BEFORE INSERT ON content.release_dependencies FOR EACH ROW EXECUTE FUNCTION content.test_fail()`;
    await expect(publish()).rejects.toThrow();expect(await database.db.select().from(packageReleases)).toHaveLength(0);expect(await database.db.select().from(publicationOperations)).toHaveLength(0);
    for(const artifact of candidate.artifacts)await store.verify(artifact);
    await raw`DROP TRIGGER test_fail ON content.release_dependencies`;await publish();expect(await database.db.select().from(packageReleases)).toHaveLength(2);
  });
  it('activates a full immutable snapshot and consistent per-package projection',async()=>{
    await publish();const result=await service.activate(input(),actor),current=await head();
    expect(current).toEqual({snapshot_id:result.snapshot_id,state_revision:1,packages:exact()});
    const projection=await database.db.select().from(releaseActivations);expect(projection).toHaveLength(2);expect(projection.every(row=>row.snapshot_id===result.snapshot_id)).toBe(true);
    expect(await database.db.select().from(snapshotPackages)).toHaveLength(2);
  });
  it('rejects unpublished releases, missing dependencies, and two versions of one ID',async()=>{
    await expect(service.activate(input(),actor)).rejects.toThrow('RELEASE_NOT_PUBLISHED');await publish();
    await expect(service.activate(input(0,exact().filter(ref=>ref.package_id.endsWith('/root_texts'))),actor)).rejects.toThrow('ACTIVATION_DEPENDENCY_MISSING');
    await expect(service.activate(input(0,[...exact(),{...exact()[0],package_version:'2.0.0'}]),actor)).rejects.toThrow('ACTIVE_VERSION_CONFLICT');
    expect((await head()).state_revision).toBe(0);
  });
  it('permits exactly one of two activations with the same expected revision',async()=>{
    await publish();const another=make(other.db);const results=await Promise.allSettled([service.activate(input(),actor),another.activate(input(),actor)]);
    expect(results.filter(row=>row.status==='fulfilled')).toHaveLength(1);const failed=results.find(row=>row.status==='rejected');
    expect((failed as PromiseRejectedResult).reason.message).toContain('ACTIVATION_REVISION_CONFLICT');
    expect(await database.db.select().from(activationChanges)).toHaveLength(1);expect((await head()).state_revision).toBe(1);
  });
  it('replays a lost activation response even after the head moved, without moving it back',async()=>{
    await publish();const first=input(),result=await service.activate(first,actor);await service.activate(input(1,[]),actor);
    expect(await service.activate(first,actor)).toEqual(result);expect((await head()).state_revision).toBe(2);expect((await head()).packages).toEqual([]);
    await expect(service.activate({...first,reason:'restore'},actor)).rejects.toThrow('OPERATION_CONFLICT');
    expect(await database.db.select().from(activationChanges)).toHaveLength(2);
  });
  it('a failed activation transaction preserves snapshot, history, head and projection',async()=>{
    await publish();await service.activate(input(),actor);const before=await head();
    await raw`CREATE FUNCTION content.test_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture activation failed'; END $$`;
    await raw`CREATE TRIGGER test_fail BEFORE UPDATE ON content.activation_heads FOR EACH ROW EXECUTE FUNCTION content.test_fail()`;
    await expect(service.activate(input(1,[]),actor)).rejects.toThrow();expect(await head()).toEqual(before);
    expect(await database.db.select().from(activationSnapshots)).toHaveLength(1);expect(await database.db.select().from(activationChanges)).toHaveLength(1);
    expect(await database.db.select().from(releaseActivations)).toHaveLength(2);
  });
  it('restores a whole historical set while retaining newer releases and artifacts',async()=>{
    await publish();await service.activate(input(),actor);const next=await changed({version:true,revision:true,message:true});await publish(next);await service.activate(input(1,exact(next)),actor);
    await service.activate({...input(2),reason:'restore'},actor);expect((await head()).packages).toEqual(exact());
    expect(await database.db.select().from(packageReleases)).toHaveLength(3);expect(await database.db.select().from(activationSnapshots)).toHaveLength(3);
    for(const artifact of next.artifacts)await store.verify(artifact);
  });
  it('rejects missing or corrupted published files before changing the head',async()=>{
    await publish();const artifact=candidate.artifacts[0];await writeFile(path.join(storeRoot,artifact.storage_key),'x'.repeat(artifact.byte_size));
    await expect(service.activate(input(),actor)).rejects.toThrow('STORAGE_BYTES_MISMATCH');expect((await head()).state_revision).toBe(0);
  });
  it('does not activate a stored manifest with unsupported schema refs',async()=>{
    await publish();await raw`ALTER TABLE content.package_releases DISABLE TRIGGER package_releases_immutable`;
    // Simulate a corrupt administrative migration, outside the service trust boundary.
    await database.db.update(packageReleases).set({manifest:{...candidate.manifest,runtime_schema_refs:[]}}).where(eq(packageReleases.package_id,candidate.root_package.package_id));
    await expect(service.activate(input(),actor)).rejects.toThrow('UNSUPPORTED_RELEASE_CONTRACT');expect((await head()).state_revision).toBe(0);
  });
  it('holds the SHARE head lock until the caller transaction commits',async()=>{
    await publish();let unlock!:()=>void,acquired!:()=>void;
    const held=new Promise<void>(resolve=>{acquired=resolve;}),release=new Promise<void>(resolve=>{unlock=resolve;});
    const reader=database.db.transaction(async tx=>{await service.readHead(tx);acquired();await release;});
    await held;
    try {
      await expect(other.db.transaction(async tx=>{await tx.execute(sql`SET LOCAL lock_timeout = '100ms'`);
        await tx.select().from(activationHeads).where(eq(activationHeads.scope_key,'global')).for('update');})).rejects.toThrow();
    } finally {unlock();await reader;}
    expect((await service.activate(input(),actor)).state_revision).toBe(1);
  });
  it('enforces immutable history and exact FKs at the DB seam',async()=>{
    await publish();await service.activate(input(),actor);
    await expect(raw`UPDATE content.package_releases SET schema_version=1`).rejects.toThrow('immutable');
    await expect(raw`DELETE FROM content.activation_snapshots`).rejects.toThrow('immutable');
    await expect(raw`UPDATE content.publication_operations SET actor_ref='fixture:operator/other'`).rejects.toThrow('immutable');
    await expect(raw`INSERT INTO content.snapshot_packages (snapshot_id,package_id,package_version,manifest_digest) VALUES (${newEntityId()},'fixture:package/missing','1.0.0',${'0'.repeat(64)})`).rejects.toThrow();
    await expect(raw`UPDATE content.activation_heads SET state_revision=-1`).rejects.toThrow();
  });
  it('matches generated additive Drizzle DDL and the reviewed immutable guard suffix',async()=>{
    const before=generateDrizzleJson({...accessSchema,content}),generated=await generateMigration(before,generateDrizzleJson(targetSchema,before.id));
    expect(await readFile('migrations/target/0007_content_release.sql','utf8')).toBe('-- G04-C: generated local fixture release schema; explicit immutable-history guards.\n'+generated.join('\n\n')+'\n'+contentReleaseGuards);
  });
});
