import { and, eq, sql } from 'drizzle-orm';
import type { openTargetDatabase } from '../db/database';
import { entityId, newEntityId } from '../contracts/ids';
import { activationChanges, activationHeads, activationSnapshots, localizationRevisions, packageReleases, publicationOperations,
  releaseActivations, releaseArtifacts, releaseDependencies, releaseLocalizations, snapshotPackages } from '../db/schema/contentRelease';
import { assertCompilerResult } from './artifactAuthority';
import type { compileFrozenContent } from './compiler';
import { COMPATIBILITY_PROFILE, packageRef, schemaRegistry, validateCompiled, type PackageRef } from './compilerContracts';
import { canonicalJson, compareText, freezeJson, hashJson } from './canonical';
import { ContentInputError } from './json';
import type { ArtifactStore } from './localStorage';

type Database = Awaited<ReturnType<typeof openTargetDatabase>>['db'];
type Candidate = ReturnType<typeof compileFrozenContent>;
type Manifest = Candidate['manifest'];
export interface ExactRelease extends PackageRef { manifest_digest: string }
export type LocalReleaseAction = 'review' | 'publish' | 'activate';
export interface LocalReleasePolicy {
  mode: 'synthetic_local_only';
  /** Trusted operator registry, injected by the host. Never filled from content or a family session. */
  authorize(actor: string, action: LocalReleaseAction): boolean | Promise<boolean>;
  now?: () => number;
  approvalLifetimeMs?: number;
}
export interface LocalApproval { readonly approval_id: string; readonly build_fingerprint: string; readonly expires_at: string }
function fail(code: string): never { throw new ContentInputError(code, ''); }
const compatibility = { registry_id: COMPATIBILITY_PROFILE.registry_id, revision: COMPATIBILITY_PROFILE.revision };
const runtimeSchemas = schemaRegistry.filter(ref => ref.contract_id === COMPATIBILITY_PROFILE.runtime_schema);
const digestPattern = /^[a-f0-9]{64}$/;
const same = (a: unknown, b: unknown) => canonicalJson(a) === canonicalJson(b);
const releaseWhere = (ref: PackageRef) => and(eq(packageReleases.package_id,ref.package_id),eq(packageReleases.package_version,ref.package_version));
function refs(input: readonly ExactRelease[]): ExactRelease[] {
  if (!Array.isArray(input) || input.length > 64) fail('ACTIVATION_SET_INVALID');
  const result = input.map(value => {
    if (!value || Object.keys(value).sort().join(',') !== 'manifest_digest,package_id,package_version') fail('ACTIVATION_SET_INVALID');
    const ref = packageRef({ package_id:value.package_id,package_version:value.package_version });
    if (!ref.package_id.startsWith('fixture:') || !digestPattern.test(value.manifest_digest)) fail('LOCAL_RELEASE_SCOPE_REQUIRED');
    return {...ref,manifest_digest:value.manifest_digest};
  }).sort((a,b)=>compareText(a.package_id,b.package_id));
  if (new Set(result.map(ref=>ref.package_id)).size!==result.length) fail('ACTIVE_VERSION_CONFLICT');
  return result;
}
function supported(manifest: Manifest) {
  validateCompiled('manifest',manifest);
  if (!same(manifest.compatibility_contract,compatibility) || !same(manifest.runtime_schema_refs,runtimeSchemas)
    || !same(manifest.required_capabilities,['plain_text_localization'])) fail('UNSUPPORTED_RELEASE_CONTRACT');
}

/** Local fixture adapter only. No HTTP endpoint, production approvals, family data, or SQL supplied by content. */
export function createLocalReleaseService(db: Database, store: ArtifactStore, policy: LocalReleasePolicy) {
  const now = policy.now ?? Date.now, lifetime = policy.approvalLifetimeMs ?? 600000;
  if (policy.mode!=='synthetic_local_only' || !Number.isSafeInteger(lifetime) || lifetime<1 || lifetime>3600000) fail('LOCAL_RELEASE_POLICY_INVALID');
  const authorize = policy.authorize;
  const approvals = new WeakMap<LocalApproval,{ candidate:Candidate; reviewer:string; issued:number; expires:number }>();
  function tick() { const value=now(); if(!Number.isSafeInteger(value)||value<0||value>8640000000000000)fail('RELEASE_CLOCK_INVALID'); return value; }
  async function allowed(actor:string,action:LocalReleaseAction) {
    if(typeof actor!=='string'||!/^fixture:operator\/[a-z][a-z0-9_]{0,63}$/.test(actor)||!await authorize(actor,action)) fail('RELEASE_FORBIDDEN');
  }
  async function approval(candidate:Candidate,token:LocalApproval) {
    assertCompilerResult(candidate);
    const evidence=approvals.get(token);
    if(!evidence||evidence.candidate!==candidate)fail('APPROVAL_MISMATCH');
    const time=tick();
    if(time<evidence.issued||time>=evidence.expires)fail('APPROVAL_EXPIRED');
    await allowed(evidence.reviewer,'review');
    return { schema_version:1,mode:'synthetic_local_only',approval_id:token.approval_id,reviewer_ref:evidence.reviewer,
      build_fingerprint:candidate.build_fingerprint,manifest_digest:candidate.manifest_digest,
      issued_at:new Date(evidence.issued).toISOString(),expires_at:token.expires_at };
  }
  async function review(candidate:Candidate,reviewer:string):Promise<LocalApproval> {
    assertCompilerResult(candidate); await allowed(reviewer,'review');
    refs(candidate.packages.map(pkg=>({...pkg.package_ref,manifest_digest:pkg.manifest_digest})));
    const issued=tick(),expires=issued+lifetime;
    const token=Object.freeze({approval_id:newEntityId(),build_fingerprint:candidate.build_fingerprint,expires_at:new Date(expires).toISOString()});
    approvals.set(token,{candidate,reviewer,issued,expires}); return token;
  }
  async function publish(candidate:Candidate,token:LocalApproval,actor:string,operationId:string) {
    entityId(operationId); await allowed(actor,'publish');
    assertCompilerResult(candidate);
    const exact=refs(candidate.packages.map(pkg=>({...pkg.package_ref,manifest_digest:pkg.manifest_digest})));
    const requestDigest=hashJson({actor,build_fingerprint:candidate.build_fingerprint,packages:exact});
    const receipt = (previous: typeof publicationOperations.$inferSelect) => {
      if(previous.request_digest!==requestDigest)fail('OPERATION_CONFLICT');
      return freezeJson({status:'published',production_ready:false,operation_id:operationId,packages:exact});
    };
    // A committed receipt is immutable. Replaying it is not a new publication and needs no live approval or storage.
    const [completed]=await db.select().from(publicationOperations).where(eq(publicationOperations.operation_id,operationId));
    if(completed)return receipt(completed);
    await approval(candidate,token);
    // Immutable blobs are durable and readable before any DB registration. Failure leaves only unreferenced files.
    for(const artifact of candidate.artifacts) await store.put(artifact);
    for(const artifact of candidate.artifacts) await store.verify(artifact);
    return db.transaction(async tx=>{
      // One global publication lock also serializes immutable revision checks across disjoint package graphs.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(70401,1)`);
      await allowed(actor,'publish');
      const [previous]=await tx.select().from(publicationOperations).where(eq(publicationOperations.operation_id,operationId));
      if(previous)return receipt(previous);
      const evidence=await approval(candidate,token);
      const manifests=new Map<string,Manifest>();
      const missing:ExactRelease[]=[];
      for(const ref of exact) {
        const artifact=candidate.artifacts.find(item=>item.storage_key===`manifests/${ref.manifest_digest}.json`)!;
        const manifest=JSON.parse(artifact.bytes) as Manifest; supported(manifest);
        if(!same(manifest.package,{package_id:ref.package_id,package_version:ref.package_version})||hashJson(manifest)!==ref.manifest_digest)fail('MANIFEST_MISMATCH');
        manifests.set(ref.package_id,manifest);
        const [existing]=await tx.select().from(packageReleases).where(releaseWhere(ref));
        if(existing&&existing.manifest_digest!==ref.manifest_digest)fail('RELEASE_VERSION_CONFLICT');
        if(!existing)missing.push(ref);
      }
      const created_at=new Date(tick()).toISOString();
      await tx.insert(publicationOperations).values({operation_id:operationId,request_digest:requestDigest,
        build_fingerprint:candidate.build_fingerprint,actor_ref:actor,approval:evidence,created_at});
      for(const ref of missing) await tx.insert(packageReleases).values({...ref,schema_version:1,manifest:manifests.get(ref.package_id)!,operation_id:operationId,created_at});
      for(const ref of missing) {
        const manifest=manifests.get(ref.package_id)!;
        for(const dependency of manifest.dependencies) {
          if(!exact.some(item=>same(item,{...dependency.package_ref,manifest_digest:dependency.manifest_digest})))fail('DEPENDENCY_NOT_PUBLISHED');
          await tx.insert(releaseDependencies).values({...ref,dependency_id:dependency.package_ref.package_id,dependency_version:dependency.package_ref.package_version,dependency_digest:dependency.manifest_digest});
        }
        const artifactKeys=[`manifests/${ref.manifest_digest}.json`,...manifest.localizations.map(item=>item.storage_key)];
        for(const key of new Set(artifactKeys)) {
          const artifact=candidate.artifacts.find(item=>item.storage_key===key)!;
          await tx.insert(releaseArtifacts).values({...ref,storage_key:key,digest:artifact.digest,byte_size:artifact.byte_size});
        }
        const pkg=candidate.packages.find(item=>item.package_ref.package_id===ref.package_id)!;
        for(const record of manifest.localizations) {
          const semantic=pkg.lock.records.find(item=>same(item.ref,record.ref)&&same(item.supplier,pkg.package_ref))!;
          const [old]=await tx.select().from(localizationRevisions).where(and(eq(localizationRevisions.bundle_id,record.ref.bundle_id),eq(localizationRevisions.revision,record.ref.revision),eq(localizationRevisions.locale,record.ref.locale)));
          if(old&&(old.semantic_digest!==semantic.semantic_digest||old.public_digest!==record.public_projection_digest))fail('REVISION_REWRITE');
          if(!old)await tx.insert(localizationRevisions).values({...record.ref,semantic_digest:semantic.semantic_digest,public_digest:record.public_projection_digest});
          await tx.insert(releaseLocalizations).values({...ref,...record.ref});
        }
      }
      return freezeJson({status:'published',production_ready:false,operation_id:operationId,packages:exact});
    });
  }
  async function activate(input:{packages:readonly ExactRelease[];expected_revision:number;operation_id:string;reason:'initial'|'update'|'restore'},actor:string) {
    entityId(input.operation_id); await allowed(actor,'activate');
    if(!Number.isInteger(input.expected_revision)||input.expected_revision<0||input.expected_revision>=2147483647
      ||!['initial','update','restore'].includes(input.reason)||Object.keys(input).sort().join(',')!=='expected_revision,operation_id,packages,reason')fail('ACTIVATION_INPUT_INVALID');
    const exact=refs(input.packages),operationId=input.operation_id,expected=input.expected_revision,reason=input.reason;
    const descriptor={schema_version:1,scope_key:'global',packages:exact,compatibility_ref:compatibility};
    const requestDigest=hashJson({actor,expected_revision:expected,reason,descriptor});
    return db.transaction(async tx=>{
      const [head]=await tx.select().from(activationHeads).where(eq(activationHeads.scope_key,'global')).for('update');
      if(!head)fail('ACTIVATION_HEAD_MISSING');
      await allowed(actor,'activate');
      const [previous]=await tx.select().from(activationChanges).where(eq(activationChanges.operation_id,operationId));
      if(previous) {
        if(previous.request_digest!==requestDigest)fail('OPERATION_CONFLICT');
        return {status:'activated',production_ready:false,snapshot_id:previous.next_snapshot_id,state_revision:previous.state_revision};
      }
      if(head.state_revision!==expected)fail('ACTIVATION_REVISION_CONFLICT');
      for(const ref of exact) {
        const [release]=await tx.select().from(packageReleases).where(releaseWhere(ref));
        if(!release||release.manifest_digest!==ref.manifest_digest)fail('RELEASE_NOT_PUBLISHED');
        const manifest=release.manifest as Manifest; supported(manifest);
        if(hashJson(manifest)!==ref.manifest_digest)fail('MANIFEST_MISMATCH');
        const [evidence]=await tx.select().from(publicationOperations).where(eq(publicationOperations.operation_id,release.operation_id));
        if(!evidence||evidence.approval.mode!=='synthetic_local_only'||evidence.approval.build_fingerprint!==evidence.build_fingerprint)fail('RELEASE_NOT_APPROVED');
        for(const dependency of manifest.dependencies) {
          if(!exact.some(item=>same(item,{...dependency.package_ref,manifest_digest:dependency.manifest_digest})))fail('ACTIVATION_DEPENDENCY_MISSING');
        }
        const artifacts=await tx.select().from(releaseArtifacts).where(and(eq(releaseArtifacts.package_id,ref.package_id),eq(releaseArtifacts.package_version,ref.package_version)));
        const expectedArtifacts=[{storage_key:`manifests/${ref.manifest_digest}.json`,digest:ref.manifest_digest,byte_size:Buffer.byteLength(canonicalJson(manifest))},
          ...manifest.localizations.map(item=>({storage_key:item.storage_key,digest:item.public_projection_digest,byte_size:item.byte_size}))];
        for(const artifact of expectedArtifacts) {
          if(!artifacts.some(item=>item.storage_key===artifact.storage_key&&item.digest===artifact.digest&&item.byte_size===artifact.byte_size))fail('RELEASE_FILES_INCOMPLETE');
          await store.verify(artifact);
        }
      }
      const snapshotId=newEntityId(),time=new Date(tick()).toISOString(),revision=head.state_revision+1;
      await tx.insert(activationSnapshots).values({snapshot_id:snapshotId,scope_key:'global',schema_version:1,descriptor,
        snapshot_digest:hashJson(descriptor),operation_id:operationId,created_at:time});
      for(const ref of exact)await tx.insert(snapshotPackages).values({...ref,snapshot_id:snapshotId});
      await tx.insert(activationChanges).values({operation_id:operationId,request_digest:requestDigest,previous_snapshot_id:head.snapshot_id,
        next_snapshot_id:snapshotId,state_revision:revision,reason,actor_ref:actor,activated_at:time});
      await tx.delete(releaseActivations).where(eq(releaseActivations.scope_key,'global'));
      for(const ref of exact)await tx.insert(releaseActivations).values({...ref,scope_key:'global',snapshot_id:snapshotId});
      await tx.update(activationHeads).set({snapshot_id:snapshotId,state_revision:revision}).where(eq(activationHeads.scope_key,'global'));
      return {status:'activated',production_ready:false,snapshot_id:snapshotId,state_revision:revision};
    });
  }
  // Call inside an existing family transaction AFTER its family lock; never start another connection here.
  async function readHead(tx: Parameters<Parameters<Database['transaction']>[0]>[0]) {
    const [head]=await tx.select().from(activationHeads).where(eq(activationHeads.scope_key,'global')).for('share');
    if(!head)fail('ACTIVATION_HEAD_MISSING');
    const packages=head.snapshot_id?await tx.select({package_id:snapshotPackages.package_id,package_version:snapshotPackages.package_version,manifest_digest:snapshotPackages.manifest_digest})
      .from(snapshotPackages).where(eq(snapshotPackages.snapshot_id,head.snapshot_id)).orderBy(snapshotPackages.package_id):[];
    return {snapshot_id:head.snapshot_id,state_revision:head.state_revision,packages};
  }
  return {review,publish,activate,readHead};
}
