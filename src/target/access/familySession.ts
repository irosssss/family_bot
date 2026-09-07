import { createHash,randomBytes } from 'node:crypto';
import { and,eq,inArray,or } from 'drizzle-orm';
import type { openTargetDatabase } from '../db/database';
import { accounts,families,memberProfiles,players } from '../db/schema/foundation';
import { externalIdentities } from '../db/schema/access';
import { accessBindings,sessionContexts,sessionTokenVerifiers } from '../db/schema/familyAccess';
import { familySecurityPolicy,launchConsumptions } from '../db/schema/adultProtection';
import { familyAccessRecordToDto,parseFamilyAccessRecord } from '../contracts/familyAccess';
import { ContractError,closedObject,reject } from '../contracts/errors';
import { entityId,newEntityId,revision } from '../contracts/ids';
import { instant,key } from '../contracts/foundation';
import type { createIdentityExchangeService } from './identityExchange';
import { authorizeFamilyTarget,parseFamilyAccessRequest,type FamilyActor } from './familyAuthorization';

type Database = Awaited<ReturnType<typeof openTargetDatabase>>['db'];
export type FamilyTransaction = Parameters<Parameters<Database['transaction']>[0]>[0];
export interface FamilySessionConfig {
  readonly policyId: string; readonly policyRevision: number; readonly ownChildTtlSeconds: number;
  readonly retentionId: string; readonly retentionRevision: number; readonly now: () => number;
}
export interface FamilyProtectionHooks {
  /** Trusted server implementation only. G03-D default denies all adult/managed access. */
  readonly verifyRevision: (tx: FamilyTransaction,proof: { family_id: string; binding_id: string; profile_id: string; revision: number }) => Promise<boolean>;
  readonly confirmSensitiveAction: (tx: FamilyTransaction,proof: { actor: FamilyActor; action: 'revoke_session' | 'revoke_binding'; target_id: string;
    expected_revision: number; confirmation: unknown }) => Promise<boolean | 'replayed'>;
  readonly recordActivity?: (tx: FamilyTransaction,actor: FamilyActor) => Promise<void>;
}
const denyProtection: FamilyProtectionHooks = { verifyRevision: async () => false,confirmSensitiveAction: async () => false };
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
export const familyTokenVerifier = (bearer: string) => hash(`family_session_v1:${bearer}`);
export const familyPolicyDigest = (cfg: FamilySessionConfig) => hash(JSON.stringify([cfg.policyId,cfg.policyRevision,cfg.ownChildTtlSeconds,cfg.retentionId,cfg.retentionRevision]));
const errors = new Set(['family.access_denied','family.session_invalid','family.binding_unavailable','family.context_changed',
  'family.protection_required','family.entropy_unavailable','family.adult_lifecycle_required','access.launch_invalid','access.policy_mismatch',
  'adult.proof_invalid','adult.policy_mismatch','adult.retry_later','adult.operation_conflict']);

export function createFamilySessionService(db: Database, exchange: ReturnType<typeof createIdentityExchangeService>,
  input: FamilySessionConfig, hooks: FamilyProtectionHooks = denyProtection, entropy: (size: number) => Uint8Array = randomBytes) {
  let cfg: FamilySessionConfig;
  try {
    const row = closedObject(input,['policyId','policyRevision','ownChildTtlSeconds','retentionId','retentionRevision','now']);
    key(row.policyId); revision(row.policyRevision); key(row.retentionId); revision(row.retentionRevision);
    if (typeof row.now !== 'function' || !Number.isSafeInteger(row.ownChildTtlSeconds)
      || (row.ownChildTtlSeconds as number) < 1 || (row.ownChildTtlSeconds as number) > 86400
      || typeof hooks.verifyRevision !== 'function' || typeof hooks.confirmSensitiveAction !== 'function' || typeof entropy !== 'function') reject('family.config_invalid');
    cfg = Object.freeze({ ...row }) as unknown as FamilySessionConfig;
  } catch { return reject('family.config_invalid'); }
  const verifyProtection = hooks.verifyRevision, confirmSensitive = hooks.confirmSensitiveAction, recordActivity = hooks.recordActivity;
  const policyDigest = familyPolicyDigest(cfg);
  const now = () => {
    const ms = cfg.now(); if (!Number.isSafeInteger(ms) || ms < 0) reject('family.clock_invalid');
    return instant(new Date(ms).toISOString());
  };
  const base = (familyId: string,time: string) => ({ id: newEntityId(),schema_version: 1,created_at: time,updated_at: time,state_revision: 1,
    family_id: familyId,retention_policy_id: cfg.retentionId,retention_policy_revision: cfg.retentionRevision });
  async function safe<T>(work: () => Promise<T>) {
    try { return await work(); }
    catch (error) { return Object.freeze({ ok: false as const,error_key: error instanceof ContractError && errors.has(error.key) ? error.key : 'family.access_unavailable' }); }
  }
  async function lockFamily(tx: FamilyTransaction,familyId: string) {
    // Always lock policy before family. Old factories also reject a policy cutover.
    const [head] = await tx.select().from(familySecurityPolicy).where(eq(familySecurityPolicy.scope,'family_access')).for('share');
    if (head && (head.family_policy_digest !== policyDigest || now() < new Date(head.updated_at).toISOString())) reject('adult.policy_mismatch');
    const [family] = await tx.select().from(families).where(eq(families.id,familyId)).for('update');
    if (!family || family.status !== 'active' || now() < new Date(family.updated_at).toISOString()) reject('family.access_denied');
  }
  async function validBinding(tx: FamilyTransaction,bindingId: string,familyId: string) {
    const [stored] = await tx.select().from(accessBindings).where(and(eq(accessBindings.id,bindingId),eq(accessBindings.family_id,familyId))).for('share');
    if (!stored) reject('family.binding_unavailable');
    const binding = familyAccessRecordToDto('binding',stored);
    const [profile] = await tx.select().from(memberProfiles).where(and(eq(memberProfiles.family_id,familyId),eq(memberProfiles.id,binding.profile_id))).for('share');
    if (binding.status !== 'active' || !profile || profile.status !== 'active' || profile.family_role !== binding.profile_role
      || now() < binding.updated_at) reject('family.binding_unavailable');
    return binding;
  }
  async function validSource(tx: FamilyTransaction,accountId: string,identityId: string) {
    const [identity] = await tx.select().from(externalIdentities).where(and(eq(externalIdentities.id,identityId),eq(externalIdentities.account_id,accountId))).for('share');
    const [account] = await tx.select().from(accounts).where(eq(accounts.id,accountId)).for('share');
    if (!identity || identity.revoked_at !== null || !account || account.status !== 'active') reject('family.session_invalid');
  }
  async function validateContext(tx: FamilyTransaction,id: string,familyId: string,asParent = false,allowExpiredAdultGrant = false) {
    const [stored] = await tx.select().from(sessionContexts).where(and(eq(sessionContexts.id,id),eq(sessionContexts.family_id,familyId))).for('share');
    if (!stored) reject('family.session_invalid');
    const context = familyAccessRecordToDto('session',stored), time = now();
    if (context.revoked_at !== null || time >= context.expires_at || time < context.updated_at || context.policy_digest !== policyDigest
      || context.policy_id !== cfg.policyId || context.policy_revision !== cfg.policyRevision) reject('family.session_invalid');
    const binding = await validBinding(tx,context.binding_id,familyId);
    if (binding.state_revision !== context.binding_revision) reject('family.session_invalid');
    await validSource(tx,context.account_id,context.external_identity_id);
    if (context.mode === 'adult') {
      if (!await verifyProtection(tx,{ family_id: familyId,binding_id: binding.id,profile_id: binding.profile_id,revision: context.protection_revision! })) reject('family.protection_required');
      if (!asParent && !allowExpiredAdultGrant && (time >= context.adult_grant_expires_at! || time >= context.adult_idle_expires_at!)) reject('family.protection_required');
    } else if (asParent) reject('family.session_invalid');
    return { context,binding };
  }
  async function resolveLocked(tx: FamilyTransaction,bearer: unknown,allowExpiredAdultGrant = false): Promise<FamilyActor> {
    if (typeof bearer !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(bearer) || Buffer.from(bearer,'base64url').toString('base64url') !== bearer) reject('family.session_invalid');
    // Unlocked lookup is only a lock-routing hint; all authority is reloaded after family lock.
    const [hint] = await tx.select({ family_id: sessionTokenVerifiers.family_id }).from(sessionTokenVerifiers).where(eq(sessionTokenVerifiers.token_verifier,familyTokenVerifier(bearer)));
    if (!hint) reject('family.session_invalid');
    await lockFamily(tx,hint.family_id);
    const [stored] = await tx.select().from(sessionTokenVerifiers).where(and(eq(sessionTokenVerifiers.family_id,hint.family_id),eq(sessionTokenVerifiers.token_verifier,familyTokenVerifier(bearer)))).for('share');
    if (!stored) reject('family.session_invalid');
    const token = familyAccessRecordToDto('verifier',stored);
    if (token.retired_at !== null || now() < token.updated_at) reject('family.session_invalid');
    const { context,binding } = await validateContext(tx,token.session_id,hint.family_id,false,allowExpiredAdultGrant);
    if (context.mode === 'managed_child') {
      const parent = await validateContext(tx,context.parent_session_id!,hint.family_id,true);
      if (parent.context.account_id !== context.account_id || parent.binding.id !== binding.manager_binding_id
        || context.expires_at > parent.context.expires_at || context.created_at < parent.context.created_at) reject('family.session_invalid');
      // Parent bearer and short adult grant may be retired/expired; lineage must stay active.
    }
    let playerId: string | null = null;
    if (context.mode !== 'adult') {
      const [player] = await tx.select({ id: players.id }).from(players).where(and(eq(players.family_id,hint.family_id),eq(players.profile_id,context.profile_id)));
      if (!player) reject('family.session_invalid'); playerId = player.id;
    }
    return Object.freeze({ account_id: context.account_id,family_id: hint.family_id,profile_id: context.profile_id,player_id: playerId,
      session_id: context.id,session_revision: context.state_revision,binding_id: context.binding_id,
      verifier_id: token.id,verifier_revision: token.state_revision,mode: context.mode as FamilyActor['mode'] });
  }

  async function issueOwnChild(launchBearer: unknown,input: unknown) {
    return safe(() => db.transaction(async tx => {
      const req = closedObject(input,['family_id','binding_id']); const familyId = entityId(req.family_id),bindingId = entityId(req.binding_id);
      await lockFamily(tx,familyId);
      const launch = await exchange.lockLaunch(tx,launchBearer);
      const binding = await validBinding(tx,bindingId,familyId);
      if (binding.kind !== 'own_child' || binding.account_id !== launch.account_id) reject('family.access_denied');
      const [player] = await tx.select({ id: players.id }).from(players).where(and(eq(players.family_id,familyId),eq(players.profile_id,binding.profile_id)));
      if (!player) reject('family.binding_unavailable');
      const time = now(); if (time >= launch.expires_at) reject('access.launch_invalid');
      const bytes = entropy(32);
      if (!(bytes instanceof Uint8Array) || bytes.byteLength !== 32) reject('family.entropy_unavailable');
      const bearer = Buffer.from(bytes).toString('base64url');
      const context = parseFamilyAccessRecord('session',{ ...base(familyId,time),account_id: launch.account_id,external_identity_id: launch.external_identity_id,
        profile_id: binding.profile_id,binding_id: binding.id,binding_kind: binding.kind,binding_revision: binding.state_revision,mode: 'own_child',
        parent_session_id: null,parent_mode: null,parent_binding_id: null,parent_binding_kind: null,origin_launch_id: launch.launch_id,
        expires_at: new Date(Date.parse(time) + cfg.ownChildTtlSeconds * 1000).toISOString(),revoked_at: null,
        adult_verified_at: null,adult_grant_expires_at: null,adult_idle_expires_at: null,protection_revision: null,
        policy_id: cfg.policyId,policy_revision: cfg.policyRevision,policy_digest: policyDigest });
      const token = parseFamilyAccessRecord('verifier',{ ...base(familyId,time),session_id: context.id,token_verifier: familyTokenVerifier(bearer),verifier_version: 1,retired_at: null });
      await tx.insert(launchConsumptions).values({ id:newEntityId(),schema_version:1,created_at:time,launch_id:launch.launch_id,purpose:'own_child',
        retention_policy_id:cfg.retentionId,retention_policy_revision:cfg.retentionRevision });
      await tx.insert(sessionContexts).values(context); await tx.insert(sessionTokenVerifiers).values(token);
      const result = { ok: true as const,session: Object.freeze({ id: context.id,family_id: familyId,profile_id: binding.profile_id,expires_at: context.expires_at }) };
      Object.defineProperty(result,'bearer',{ value: bearer,enumerable: false });
      return Object.freeze(result) as typeof result & { readonly bearer: string };
    }));
  }
  async function resolveSession(bearer: unknown) { return safe(() => db.transaction(async tx => Object.freeze({ ok: true as const,actor: await resolveLocked(tx,bearer) }))); }
  async function withFamilyAccess<T>(bearer: unknown,input: unknown,work: (tx: FamilyTransaction,actor: FamilyActor) => Promise<T>) {
    return safe(() => db.transaction(async tx => {
      const req = parseFamilyAccessRequest(input),actor = await resolveLocked(tx,bearer);
      authorizeFamilyTarget(actor,req);
      if (req.profile_id !== null) {
        const [target] = await tx.select({ id: memberProfiles.id }).from(memberProfiles)
          .where(and(eq(memberProfiles.id,req.profile_id),eq(memberProfiles.family_id,actor.family_id),eq(memberProfiles.status,'active'))).for('share');
        if (!target) reject('family.access_denied');
      }
      // Trusted handler runs inside the lock/transaction; a cached actor never authorizes a later command.
      const value = await work(tx,actor);
      if (recordActivity) await recordActivity(tx,actor);
      return Object.freeze({ ok: true as const,value });
    }));
  }
  async function revokeContexts(tx: FamilyTransaction,familyId: string,ids: string[]) {
    if (!ids.length) return;
    const descendants = await tx.select({ id: sessionContexts.id }).from(sessionContexts)
      .where(and(eq(sessionContexts.family_id,familyId),or(inArray(sessionContexts.id,ids),inArray(sessionContexts.parent_session_id,ids))));
    const allIds = descendants.map(r => r.id),time = now(); if (!allIds.length) return;
    const contexts = await tx.select().from(sessionContexts).where(and(eq(sessionContexts.family_id,familyId),inArray(sessionContexts.id,allIds)));
    for (const row of contexts) if (row.revoked_at === null) {
      const value = familyAccessRecordToDto('session',row); if (time < value.updated_at) reject('family.context_changed');
      await tx.update(sessionContexts).set({ revoked_at: time,updated_at: time,state_revision: value.state_revision + 1 }).where(eq(sessionContexts.id,value.id));
    }
    const tokens = await tx.select().from(sessionTokenVerifiers).where(and(eq(sessionTokenVerifiers.family_id,familyId),inArray(sessionTokenVerifiers.session_id,allIds)));
    for (const row of tokens) if (row.retired_at === null) {
      const value = familyAccessRecordToDto('verifier',row); if (time < value.updated_at) reject('family.context_changed');
      await tx.update(sessionTokenVerifiers).set({ retired_at: time,updated_at: time,state_revision: value.state_revision + 1 }).where(eq(sessionTokenVerifiers.id,value.id));
    }
  }
  async function sensitive(tx: FamilyTransaction,actor: FamilyActor,action: 'revoke_session' | 'revoke_binding',targetId: string,expected: number,confirmation: unknown) {
    if (actor.mode !== 'adult') reject('family.protection_required');
    const decision = await confirmSensitive(tx,{ actor,action,target_id: targetId,expected_revision:expected,confirmation });
    if (!decision) reject('family.protection_required');
    return decision;
  }
  async function revokeSession(bearer: unknown,input: unknown,confirmation?: unknown) {
    return safe(() => db.transaction(async tx => {
      const req = closedObject(input,['session_id','expected_revision']); const id = entityId(req.session_id),expected = revision(req.expected_revision);
      const actor = await resolveLocked(tx,bearer);
      const [target] = await tx.select().from(sessionContexts).where(and(eq(sessionContexts.family_id,actor.family_id),eq(sessionContexts.id,id)));
      if (!target) reject('family.access_denied');
      if (id !== actor.session_id && await sensitive(tx,actor,'revoke_session',id,expected,confirmation) === 'replayed') return Object.freeze({ ok:true as const,replayed:true });
      if (target.state_revision !== expected) reject('family.context_changed');
      await revokeContexts(tx,actor.family_id,[id]); return Object.freeze({ ok: true as const });
    }));
  }
  async function revokeBinding(bearer: unknown,input: unknown,confirmation?: unknown) {
    return safe(() => db.transaction(async tx => {
      const req = closedObject(input,['binding_id','expected_revision']); const id = entityId(req.binding_id),expected = revision(req.expected_revision);
      const actor = await resolveLocked(tx,bearer);
      const [target] = await tx.select().from(accessBindings).where(and(eq(accessBindings.family_id,actor.family_id),eq(accessBindings.id,id)));
      if (!target) reject('family.access_denied');
      if (target.kind === 'adult_membership') reject('family.adult_lifecycle_required');
      if (await sensitive(tx,actor,'revoke_binding',id,expected,confirmation) === 'replayed') return Object.freeze({ ok:true as const,replayed:true });
      if (target.state_revision !== expected) reject('family.context_changed');
      const time = now(); if (time < new Date(target.updated_at).toISOString()) reject('family.context_changed');
      const sessions = await tx.select({ id: sessionContexts.id }).from(sessionContexts).where(and(eq(sessionContexts.family_id,actor.family_id),eq(sessionContexts.binding_id,id)));
      await revokeContexts(tx,actor.family_id,sessions.map(s => s.id));
      await tx.update(accessBindings).set({ status: 'revoked',revoked_at: time,updated_at: time,state_revision: expected + 1 }).where(eq(accessBindings.id,id));
      return Object.freeze({ ok: true as const });
    }));
  }
  async function retireOwnBearer(bearer: unknown,expectedRevision: number) {
    return safe(() => db.transaction(async tx => {
      const actor = await resolveLocked(tx,bearer); if (revision(expectedRevision) !== actor.verifier_revision) reject('family.context_changed');
      const time = now();
      await tx.update(sessionTokenVerifiers).set({ retired_at: time,updated_at: time,state_revision: actor.verifier_revision + 1 }).where(eq(sessionTokenVerifiers.id,actor.verifier_id));
      return Object.freeze({ ok: true as const });
    }));
  }
  // Transaction composition only, never expose this object as transport handlers.
  const internal = Object.freeze({ lockFamily,resolveLocked,validBinding,validSource,revokeContexts });
  return Object.freeze({ issueOwnChild,resolveSession,withFamilyAccess,revokeSession,revokeBinding,retireOwnBearer,internal });
}
