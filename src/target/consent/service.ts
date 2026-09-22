import {and,desc,eq,sql} from 'drizzle-orm';
import type {openTargetDatabase} from '../db/database';
import {consentEvents} from '../db/schema/consent';
import {closedObject,reject} from '../contracts/errors';
import {entityId,newEntityId} from '../contracts/ids';
type Db=Awaited<ReturnType<typeof openTargetDatabase>>['db'];
type Tx=Parameters<Parameters<Db['transaction']>[0]>[0];
interface Scope {familyId:string;subjectId:string;purpose:'service'|'analytics'}
interface Authority {actorAccountId:string;reference:string;retentionPolicyId:string;retentionPolicyRevision:number}
/** No HTTP route: authorization must resolve live identity/representation inside tx.
 * No accepting caller-supplied actor IDs, checkbox booleans, or document text as evidence.
 */
export function createConsentService(db:Db,dependencies:{now:()=>Date;authorize:(tx:Tx,scope:Scope,decision:'grant'|'withdraw')=>Promise<Authority>;currentDocument:(tx:Tx,purpose:Scope['purpose'])=>Promise<string>}){
 function scopeOf(input:unknown):Scope{const s=closedObject(input,['familyId','subjectId','purpose']);if(s.purpose!=='service'&&s.purpose!=='analytics')reject('consent.purpose_invalid');return {familyId:entityId(s.familyId),subjectId:entityId(s.subjectId),purpose:s.purpose as Scope['purpose']};}
 const where=(s:Scope)=>and(eq(consentEvents.family_id,s.familyId),eq(consentEvents.subject_profile_id,s.subjectId),eq(consentEvents.purpose,s.purpose));
 async function latest(tx:Tx,s:Scope){return (await tx.select().from(consentEvents).where(where(s)).orderBy(desc(consentEvents.scope_revision)).limit(1))[0];}
 return {
  async record(scopeInput:unknown,decision:'grant'|'withdraw',expectedRevision:number,presentedDocumentDigest?:string){
   const scope=scopeOf(scopeInput);if(!['grant','withdraw'].includes(decision)||!Number.isSafeInteger(expectedRevision)||expectedRevision<0||expectedRevision>=2147483647)reject('consent.input_invalid');
   return db.transaction(async tx=>{
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${scope.familyId+':'+scope.subjectId+':'+scope.purpose},0))`);
    const authority=await dependencies.authorize(tx,scope,decision);
    const head=await latest(tx,scope);if((head?.scope_revision??0)!==expectedRevision)reject('consent.context_changed');
    const digest=decision==='withdraw'&&head?head.document_digest:await dependencies.currentDocument(tx,scope.purpose);if(!/^[a-f0-9]{64}$/.test(digest))reject('consent.document_unavailable');
    if(decision==='grant'&&presentedDocumentDigest!==digest)reject('consent.document_changed');
    const now=dependencies.now();if(!Number.isFinite(now.getTime())||(head&&now.getTime()<Date.parse(head.created_at)))reject('consent.clock_invalid');
    const id=newEntityId();await tx.insert(consentEvents).values({id,schema_version:1,created_at:now.toISOString(),retention_policy_id:authority.retentionPolicyId,retention_policy_revision:authority.retentionPolicyRevision,family_id:scope.familyId,subject_profile_id:scope.subjectId,actor_account_id:entityId(authority.actorAccountId),purpose:scope.purpose,document_digest:digest,decision,scope_revision:expectedRevision+1,authority_reference:authority.reference});
    return {id,revision:expectedRevision+1,decision};
   });
  },
  /** Internal read in the caller's authorization transaction, never a public endpoint. */
  async isCurrent(tx:Tx,scopeInput:unknown){const scope=scopeOf(scopeInput);await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${scope.familyId+':'+scope.subjectId+':'+scope.purpose},0))`);const head=await latest(tx,scope);if(!head||head.decision!=='grant')return false;return head.document_digest===await dependencies.currentDocument(tx,scope.purpose);},
 };
}
