import { randomBytes } from 'node:crypto';
import { and, eq, gte, isNull, or, sql } from 'drizzle-orm';
import type { openTargetDatabase } from '../db/database';
import { accessBindings, sessionContexts, sessionTokenVerifiers } from '../db/schema/familyAccess';
import { adultProtections, adultRecoveryCredentials, adultSetups, adultAttempts, adultActionProofs,
  launchConsumptions, accessOperations, accessAuditEvents } from '../db/schema/adultProtection';
import { players } from '../db/schema/foundation';
import { lifecycleRequests } from '../db/schema/accessLifecycle';
import { parseAdultRecord, adultRecordToDto, type AdultRecords } from '../contracts/adultProtection';
import { familyAccessRecordToDto, parseFamilyAccessRecord, type FamilyAccessRecords } from '../contracts/familyAccess';
import { closedObject, ContractError, reject } from '../contracts/errors';
import { entityId, revision } from '../contracts/ids';
import { createFamilySessionService, familyPolicyDigest, familyTokenVerifier, type FamilyTransaction, type FamilyProtectionHooks } from './familySession';
import type { FamilyActor } from './familyAuthorization';
import type { createIdentityExchangeService } from './identityExchange';
import { createAdultPolicy, parseAdultConfig, type AdultSecurityConfig } from './adultPolicy';
import { createPinKdf, pinKdfId, parsePin, newBearer, newRecoveryCode, recoveryVerifier, secretDigest, equalDigest, isBearer, withSecret } from './adultCrypto';

type Database = Awaited<ReturnType<typeof openTargetDatabase>>['db'];
type Binding = FamilyAccessRecords['binding'];
type Protection = AdultRecords['protection'];
type Setup = AdultRecords['setup'];
type Source = {
  binding: Binding; protection: Protection | null; identityId: string;
  launchId: string | null; setup: Setup | null; actor: FamilyActor | null;
  targetBinding?: Binding;
};
type SourceResolver = (tx: FamilyTransaction) => Promise<Source>;
type Reservation = { attempt: AdultRecords['attempt']; source: Source; fingerprint: string };
type Failure = Readonly<{ ok: false; error_key: string }>;
const errorKeys = new Set(['adult.pin_invalid','adult.recovery_invalid','adult.access_denied','adult.setup_invalid','adult.context_changed',
  'adult.policy_mismatch','adult.policy_conflict','adult.retry_later','adult.busy','adult.entropy_unavailable','adult.proof_invalid',
  'adult.operation_conflict','family.session_invalid','family.binding_unavailable','family.access_denied','family.protection_required',
  'family.adult_lifecycle_required','access.launch_invalid','access.policy_mismatch']);

export interface AdultDependencies {
  readonly entropy?: (size: number) => Uint8Array;
  /** Trusted test seam for fault injection; never accept a verifier implementation from a request. */
  readonly derivePin?: (pin: unknown, salt: string) => Promise<string>;
}

export function createAdultAccessService(db: Database, exchange: ReturnType<typeof createIdentityExchangeService>,
  input: AdultSecurityConfig, pepper: Uint8Array, dependencies: AdultDependencies = {}) {
  const cfg = parseAdultConfig(input), policy = createAdultPolicy(db,cfg,pepper), kdf = createPinKdf(pepper);
  const derivePin = dependencies.derivePin ?? kdf.derive, entropy = dependencies.entropy ?? randomBytes;
  const { now,base,mutable } = policy;
  const plus = (time: string, seconds: number) => new Date(Date.parse(time)+seconds*1000).toISOString();
  const bindingFields = (binding: Binding) => ({ family_id:binding.family_id,account_id:binding.account_id,
    profile_id:binding.profile_id,binding_id:binding.id,binding_kind:binding.kind });
  const intentDigest = (input: readonly unknown[]) => secretDigest('adult_intent_v1',JSON.stringify(input));
  const operationDigest = (action: string,target: string,expected: number) => intentDigest([action,target,expected]);
  const failure = (error: unknown): Failure => Object.freeze({ ok:false,error_key:error instanceof ContractError && errorKeys.has(error.key) ? error.key : 'adult.access_unavailable' });
  async function safe<T>(work: () => Promise<T>): Promise<T | Failure> { try { return await work(); } catch (error) { return failure(error); } }

  async function protectionFor(tx: FamilyTransaction,binding: Binding,active: boolean) {
    const [row] = await tx.select().from(adultProtections).where(and(eq(adultProtections.binding_id,binding.id),eq(adultProtections.family_id,binding.family_id))).for('share');
    const result = row ? adultRecordToDto('protection',row) : null;
    if (result && now() < result.updated_at) reject('adult.context_changed');
    if (active && (!result || result.status !== 'active' || result.pepper_key_id !== cfg.pepperKeyId)) reject('adult.access_denied');
    return result;
  }
  async function audit(tx: FamilyTransaction,binding: Binding,action: string,outcome: string,attemptId: string | null = null,operationId: string | null = null) {
    await tx.insert(accessAuditEvents).values(parseAdultRecord('audit',{ ...base(),...bindingFields(binding),action,outcome,
      policy_revision:cfg.family.policyRevision,attempt_id:attemptId,operation_id:operationId }));
  }
  async function verifyRevision(tx: FamilyTransaction,proof: Parameters<FamilyProtectionHooks['verifyRevision']>[1]) {
    await policy.assertActive(tx);
    const [row] = await tx.select().from(adultProtections).where(and(eq(adultProtections.family_id,proof.family_id),
      eq(adultProtections.binding_id,proof.binding_id),eq(adultProtections.profile_id,proof.profile_id))).for('share');
    if (!row) return false;
    const protection = adultRecordToDto('protection',row);
    return protection.status === 'active' && protection.credential_revision === proof.revision
      && protection.pepper_key_id === cfg.pepperKeyId && now() >= protection.updated_at;
  }
  async function recordActivity(tx: FamilyTransaction,actor: FamilyActor) {
    if (actor.mode !== 'adult') return;
    const [row] = await tx.select().from(sessionContexts).where(eq(sessionContexts.id,actor.session_id));
    if (!row || row.revoked_at !== null) return;
    const context = familyAccessRecordToDto('session',row),time = now();
    const idle = [plus(time,cfg.adultIdleSeconds),context.adult_grant_expires_at!].sort()[0];
    if (idle > context.adult_idle_expires_at!) await tx.update(sessionContexts).set({ adult_idle_expires_at:idle,
      updated_at:time,state_revision:context.state_revision+1 }).where(eq(sessionContexts.id,context.id));
  }
  const family = createFamilySessionService(db,exchange,cfg.family,{ verifyRevision,confirmSensitiveAction,recordActivity },entropy);

  async function setupSource(tx: FamilyTransaction,bearer: unknown,expected?: number,requiredState?: string): Promise<Source> {
    if (!isBearer(bearer)) reject('adult.setup_invalid');
    const digest = secretDigest('adult_setup_v1',bearer);
    const [hint] = await tx.select({ family_id:adultSetups.family_id }).from(adultSetups).where(eq(adultSetups.token_verifier,digest));
    if (!hint) reject('adult.setup_invalid');
    await family.internal.lockFamily(tx,hint.family_id);
    const [row] = await tx.select().from(adultSetups).where(eq(adultSetups.token_verifier,digest)).for('share');
    if (!row) reject('adult.setup_invalid');
    const setup = adultRecordToDto('setup',row),time = now();
    if (setup.revoked_at !== null || time >= setup.expires_at || time < setup.updated_at
      || setup.policy_revision !== cfg.family.policyRevision) reject('adult.setup_invalid');
    if (expected !== undefined && expected !== setup.state_revision || requiredState && requiredState !== setup.state) reject('adult.context_changed');
    const binding = await family.internal.validBinding(tx,setup.binding_id,setup.family_id);
    if (binding.kind !== 'adult_membership' || binding.state_revision !== setup.binding_revision) reject('adult.access_denied');
    await family.internal.validSource(tx,binding.account_id,setup.external_identity_id);
    return { binding,protection:await protectionFor(tx,binding,false),identityId:setup.external_identity_id,launchId:null,setup,actor:null };
  }
  async function launchSource(tx: FamilyTransaction,bearer: unknown,familyId: string,bindingId: string): Promise<Source> {
    await family.internal.lockFamily(tx,familyId);
    const launch = await exchange.lockLaunch(tx,bearer);
    const binding = await family.internal.validBinding(tx,bindingId,familyId);
    if (binding.kind !== 'adult_membership' || binding.account_id !== launch.account_id || now() >= launch.expires_at) reject('adult.access_denied');
    return { binding,protection:await protectionFor(tx,binding,true),identityId:launch.external_identity_id,launchId:launch.launch_id,setup:null,actor:null };
  }
  async function sessionSource(tx: FamilyTransaction,bearer: unknown): Promise<Source> {
    const actor = await family.internal.resolveLocked(tx,bearer,true);
    if (actor.mode === 'own_child') reject('adult.access_denied');
    const current = await family.internal.validBinding(tx,actor.binding_id,actor.family_id);
    const binding = actor.mode === 'adult' ? current : await family.internal.validBinding(tx,current.manager_binding_id!,actor.family_id);
    const [context] = await tx.select().from(sessionContexts).where(eq(sessionContexts.id,actor.session_id));
    return { binding,protection:await protectionFor(tx,binding,true),identityId:context.external_identity_id,launchId:null,setup:null,actor };
  }
  const sourceFingerprint = (source: Source) => intentDigest([source.binding.id,source.binding.state_revision,source.binding.account_id,source.identityId,
    source.protection?.id,source.protection?.state_revision,source.protection?.credential_revision,source.launchId,
    source.setup?.id,source.setup?.state_revision,source.actor?.session_id,source.actor?.session_revision,source.actor?.verifier_id,source.actor?.verifier_revision,
    source.targetBinding?.id,source.targetBinding?.state_revision,source.targetBinding?.profile_id]);

  async function reserve(resolver: SourceResolver,purpose: string,intent: string): Promise<Reservation> {
    return db.transaction(async tx => {
      await policy.assertActive(tx);
      const source = await resolver(tx),time = now();
      const cutoff = plus(time,-cfg.dailyWindowSeconds);
      const rows = await tx.select().from(adultAttempts).where(and(eq(adultAttempts.binding_id,source.binding.id),
        or(gte(adultAttempts.created_at,cutoff),gte(adultAttempts.finished_at,cutoff))));
      const attempts = rows.map(row => adultRecordToDto('attempt',row));
      if (attempts.some(a => a.updated_at > time)) reject('adult.context_changed');
      const group = ['login','switch','fresh'].includes(purpose) ? ['login','switch','fresh'] : [purpose];
      const failures = attempts.filter(a => group.includes(a.purpose) && ['pending','denied'].includes(a.outcome))
        .map(a => a.finished_at ?? a.created_at).filter(t => t > cutoff).sort().reverse();
      if (failures.length >= cfg.failedDailyMax) reject('adult.retry_later');
      if (failures.length >= cfg.failedShortMax && Date.parse(failures[0])-Date.parse(failures[cfg.failedShortMax-1]) <= cfg.shortWindowSeconds*1000
        && time < plus(failures[0],cfg.pauseSeconds)) reject('adult.retry_later');
      const recentSource = attempts.filter(a => a.created_at > plus(time,-cfg.sourceWindowSeconds)
        && (source.launchId !== null ? a.launch_id === source.launchId : source.setup !== null ? a.setup_id === source.setup.id : a.session_id === source.actor?.session_id));
      if (recentSource.length >= cfg.sourceAttemptMax) reject('adult.retry_later');
      const attempt = parseAdultRecord('attempt',{ ...mutable(time),...bindingFields(source.binding),protection_id:source.protection?.id ?? null,
        credential_revision:source.protection?.credential_revision ?? null,policy_revision:cfg.family.policyRevision,
        launch_id:source.launchId,setup_id:source.setup?.id ?? null,session_id:source.actor?.session_id ?? null,
        purpose,intent_digest:intent,outcome:'pending',finished_at:null });
      await tx.insert(adultAttempts).values(attempt);
      return { attempt,source,fingerprint:sourceFingerprint(source) };
    });
  }
  async function finish(tx: FamilyTransaction,reservation: Reservation,outcome: string) {
    const [stored] = await tx.select().from(adultAttempts).where(eq(adultAttempts.id,reservation.attempt.id)).for('update');
    if (!stored || stored.outcome !== 'pending') reject('adult.context_changed');
    const time = now();
    const row = parseAdultRecord('attempt',{ ...adultRecordToDto('attempt',stored),outcome,finished_at:time,updated_at:time,state_revision:stored.state_revision+1 });
    await tx.update(adultAttempts).set(row).where(eq(adultAttempts.id,row.id));
    await audit(tx,reservation.source.binding,row.purpose,outcome,row.id);
  }
  async function failed(reservation: Reservation,outcome: 'denied' | 'stale' | 'unavailable') {
    // Maintenance only: it may finish a pending attempt after a policy/source revocation.
    await db.transaction(async tx => {
      const [row] = await tx.select().from(adultAttempts).where(eq(adultAttempts.id,reservation.attempt.id)).for('update');
      if (row?.outcome === 'pending') await finish(tx,reservation,outcome);
    });
  }
  async function revalidate(tx: FamilyTransaction,reservation: Reservation,resolver: SourceResolver) {
    await policy.assertActive(tx);
    const source = await resolver(tx);
    if (sourceFingerprint(source) !== reservation.fingerprint) reject('adult.context_changed');
    const [attempt] = await tx.select().from(adultAttempts).where(eq(adultAttempts.id,reservation.attempt.id)).for('update');
    if (!attempt || attempt.outcome !== 'pending' || attempt.intent_digest !== reservation.attempt.intent_digest
      || now() < new Date(attempt.updated_at).toISOString()) reject('adult.context_changed');
    return source;
  }
  async function limitedKdf(pin: string,salt: string) {
    // Dedicated short transaction: no family/credential locks during native KDF work.
    return db.transaction(async tx => {
      for (let slot = 0; slot < 2; slot++) {
        const result = await tx.execute(sql`SELECT pg_try_advisory_xact_lock(473032, ${slot}) AS acquired`);
        if (result[0]?.acquired === true) return derivePin(pin,salt);
      }
      return reject('adult.busy');
    });
  }
  async function checkedPin(reservation: Reservation,pin: string) {
    if (!reservation.source.protection) reject('adult.access_denied');
    const calculated = await limitedKdf(pin,reservation.source.protection.pin_salt);
    if (!equalDigest(calculated,reservation.source.protection.pin_verifier)) {
      await failed(reservation,'denied'); return false;
    }
    return true;
  }
  async function guardedReservation<T>(reservation: Reservation,work: () => Promise<T>) {
    try { return await work(); }
    catch (error) {
      await failed(reservation,error instanceof ContractError && error.key === 'adult.busy' ? 'unavailable' : 'stale');
      throw error;
    }
  }
  async function consume(tx: FamilyTransaction,launchId: string,purpose: string) {
    await tx.insert(launchConsumptions).values(parseAdultRecord('consumption',{ ...base(),launch_id:launchId,purpose }));
  }
  async function currentRecovery(tx: FamilyTransaction,protection: Protection) {
    const [row] = await tx.select().from(adultRecoveryCredentials).where(and(eq(adultRecoveryCredentials.protection_id,protection.id),isNull(adultRecoveryCredentials.revoked_at))).for('share');
    if (!row) reject('adult.setup_invalid');
    const credential = adultRecordToDto('recovery',row);
    if (credential.credential_revision !== protection.credential_revision || now() < credential.updated_at) reject('adult.context_changed');
    return credential;
  }
  async function rotateRecovery(tx: FamilyTransaction,protection: Protection) {
    const time = now();
    const existing = await tx.select().from(adultRecoveryCredentials).where(and(eq(adultRecoveryCredentials.protection_id,protection.id),isNull(adultRecoveryCredentials.revoked_at)));
    for (const row of existing) await tx.update(adultRecoveryCredentials).set({ revoked_at:time,updated_at:time,state_revision:row.state_revision+1 }).where(eq(adultRecoveryCredentials.id,row.id));
    const code = newRecoveryCode(entropy);
    const credential = parseAdultRecord('recovery',{ ...mutable(time),family_id:protection.family_id,binding_id:protection.binding_id,
      protection_id:protection.id,credential_revision:protection.credential_revision,verifier:recoveryVerifier(code),verifier_version:1,acknowledged_at:null,revoked_at:null });
    await tx.insert(adultRecoveryCredentials).values(credential);
    return { code,locator:credential.id };
  }

  async function beginSetup(launchBearer: unknown,input: unknown) {
    return safe(() => db.transaction(async tx => {
      const req = closedObject(input,['family_id','binding_id']);
      const familyId = entityId(req.family_id),bindingId = entityId(req.binding_id);
      await policy.assertActive(tx); await family.internal.lockFamily(tx,familyId);
      const launch = await exchange.lockLaunch(tx,launchBearer);
      const binding = await family.internal.validBinding(tx,bindingId,familyId);
      if (binding.kind !== 'adult_membership' || binding.account_id !== launch.account_id || now() >= launch.expires_at) reject('adult.access_denied');
      const protection = await protectionFor(tx,binding,false);
      if (protection && protection.status !== 'pending') reject('adult.access_denied');
      const [recovered] = await tx.select({id:lifecycleRequests.id}).from(lifecycleRequests).where(and(eq(lifecycleRequests.result_binding_id,binding.id),eq(lifecycleRequests.kind,'recovery')));
      if (recovered) reject('adult.access_denied');
      const time = now();
      const recent = await tx.select({ id:adultSetups.id }).from(adultSetups).where(and(eq(adultSetups.binding_id,bindingId),gte(adultSetups.created_at,plus(time,-cfg.sourceWindowSeconds))));
      if (recent.length >= cfg.sourceAttemptMax) reject('adult.retry_later');
      const old = await tx.select().from(adultSetups).where(and(eq(adultSetups.binding_id,bindingId),isNull(adultSetups.revoked_at)));
      for (const row of old) await tx.update(adultSetups).set({ state:'revoked',revoked_at:time,updated_at:time,state_revision:row.state_revision+1 }).where(eq(adultSetups.id,row.id));
      const bearer = newBearer(entropy);
      const setup = parseAdultRecord('setup',{ ...mutable(time),...bindingFields(binding),binding_revision:binding.state_revision,
        external_identity_id:launch.external_identity_id,launch_id:launch.launch_id,token_verifier:secretDigest('adult_setup_v1',bearer),verifier_version:1,
        policy_revision:cfg.family.policyRevision,state:'awaiting_pin',protection_id:null,expires_at:plus(time,cfg.setupSeconds),revoked_at:null });
      await consume(tx,launch.launch_id,'adult_setup'); await tx.insert(adultSetups).values(setup); await audit(tx,binding,'begin_setup','accepted');
      return withSecret({ ok:true as const,setup:{ id:setup.id,revision:setup.state_revision,state:setup.state,expires_at:setup.expires_at } },'bearer',bearer);
    }));
  }
  async function getSetup(bearer: unknown) {
    return safe(() => db.transaction(async tx => {
      await policy.assertActive(tx); const { setup } = await setupSource(tx,bearer);
      return Object.freeze({ ok:true as const,setup:{ id:setup!.id,binding_id:setup!.binding_id,family_id:setup!.family_id,revision:setup!.state_revision,state:setup!.state,expires_at:setup!.expires_at } });
    }));
  }
  async function prepareSetup(bearer: unknown,input: unknown) {
    return safe(async () => {
      const req = closedObject(input,['pin','pin_confirmation','expected_revision']);
      const pin = parsePin(req.pin),confirm = parsePin(req.pin_confirmation),expected = revision(req.expected_revision);
      if (pin !== confirm) reject('adult.pin_invalid');
      const resolver: SourceResolver = tx => setupSource(tx,bearer,expected,'awaiting_pin');
      const reservation = await reserve(resolver,'prepare_setup',intentDigest(['prepare_setup',expected]));
      return guardedReservation(reservation,async () => {
        const salt = entropy(16); if (!(salt instanceof Uint8Array) || salt.byteLength !== 16) reject('adult.entropy_unavailable');
        const saltHex = Buffer.from(salt).toString('hex'),verifier = await limitedKdf(pin,saltHex);
        return db.transaction(async tx => {
          const source = await revalidate(tx,reservation,resolver),time = now();
          if (source.protection && source.protection.status !== 'pending') reject('adult.access_denied');
          const protection = parseAdultRecord('protection',{ ...(source.protection ?? { ...mutable(time),...bindingFields(source.binding) }),
            updated_at:time,state_revision:(source.protection?.state_revision ?? 0)+1,credential_revision:(source.protection?.credential_revision ?? 0)+1,
            status:'pending',kdf_id:pinKdfId,pin_salt:saltHex,pin_verifier:verifier,pepper_key_id:cfg.pepperKeyId,recovery_ack_at:null,revoked_at:null });
          if (source.protection) await tx.update(adultProtections).set(protection).where(eq(adultProtections.id,protection.id));
          else await tx.insert(adultProtections).values(protection);
          const recovery = await rotateRecovery(tx,protection);
          await tx.update(adultSetups).set({ state:'awaiting_recovery',protection_id:protection.id,updated_at:time,state_revision:source.setup!.state_revision+1 }).where(eq(adultSetups.id,source.setup!.id));
          await finish(tx,reservation,'accepted');
          return withSecret({ ok:true as const,setup_revision:source.setup!.state_revision+1,recovery_locator:recovery.locator },'recovery_code',recovery.code);
        });
      });
    });
  }
  async function rotatePendingRecovery(bearer: unknown,input: unknown) {
    return safe(() => db.transaction(async tx => {
      const req = closedObject(input,['expected_revision']),expected = revision(req.expected_revision);
      await policy.assertActive(tx); const source = await setupSource(tx,bearer,expected,'awaiting_recovery');
      if (!source.protection || source.protection.status !== 'pending') reject('adult.setup_invalid');
      const prior = await tx.select({ id:adultRecoveryCredentials.id }).from(adultRecoveryCredentials).where(eq(adultRecoveryCredentials.protection_id,source.protection.id));
      if (prior.length >= cfg.sourceAttemptMax) reject('adult.retry_later');
      const recovery = await rotateRecovery(tx,source.protection),time = now();
      await tx.update(adultSetups).set({ updated_at:time,state_revision:expected+1 }).where(eq(adultSetups.id,source.setup!.id));
      await audit(tx,source.binding,'rotate_recovery','accepted');
      return withSecret({ ok:true as const,setup_revision:expected+1,recovery_locator:recovery.locator },'recovery_code',recovery.code);
    }));
  }
  async function acknowledgeRecovery(bearer: unknown,input: unknown) {
    return safe(async () => {
      const req = closedObject(input,['recovery_code','expected_revision']),expected = revision(req.expected_revision);
      const verifier = recoveryVerifier(req.recovery_code);
      const resolver: SourceResolver = tx => setupSource(tx,bearer,expected,'awaiting_recovery');
      const reservation = await reserve(resolver,'recovery_ack',intentDigest(['recovery_ack',expected]));
      return guardedReservation(reservation,() => db.transaction(async tx => {
        const source = await revalidate(tx,reservation,resolver),protection = source.protection;
        if (!protection || protection.status !== 'pending') reject('adult.setup_invalid');
        const credential = await currentRecovery(tx,protection),time = now();
        if (!equalDigest(credential.verifier,verifier)) { await finish(tx,reservation,'denied'); return failure(new ContractError('adult.recovery_invalid')); }
        await tx.update(adultRecoveryCredentials).set({ acknowledged_at:time,updated_at:time,state_revision:credential.state_revision+1 }).where(eq(adultRecoveryCredentials.id,credential.id));
        await tx.update(adultProtections).set({ status:'active',recovery_ack_at:time,updated_at:time,state_revision:protection.state_revision+1 }).where(eq(adultProtections.id,protection.id));
        await tx.update(adultSetups).set({ state:'completed',revoked_at:time,updated_at:time,state_revision:expected+1 }).where(eq(adultSetups.id,source.setup!.id));
        await finish(tx,reservation,'accepted'); return Object.freeze({ ok:true as const });
      }));
    });
  }

  async function createContext(tx: FamilyTransaction,source: Source,binding: Binding,parent: FamilyAccessRecords['session'] | null,originLaunchId: string | null) {
    const time = now(),adult = binding.kind === 'adult_membership';
    const expires = parent?.expires_at ?? plus(time,cfg.family.ownChildTtlSeconds);
    const context = parseFamilyAccessRecord('session',{ ...mutable(time),family_id:binding.family_id,account_id:binding.account_id,
      external_identity_id:source.identityId,profile_id:binding.profile_id,binding_id:binding.id,binding_kind:binding.kind,
      binding_revision:binding.state_revision,mode:adult ? 'adult' : 'managed_child',parent_session_id:parent?.id ?? null,
      parent_mode:parent?.mode ?? null,parent_binding_id:parent?.binding_id ?? null,parent_binding_kind:parent?.binding_kind ?? null,
      origin_launch_id:originLaunchId,expires_at:expires,revoked_at:null,adult_verified_at:adult ? time : null,
      adult_grant_expires_at:adult ? plus(time,cfg.adultGrantSeconds) : null,adult_idle_expires_at:adult ? plus(time,cfg.adultIdleSeconds) : null,
      protection_revision:adult ? source.protection!.credential_revision : null,policy_id:cfg.family.policyId,policy_revision:cfg.family.policyRevision,
      policy_digest:familyPolicyDigest(cfg.family) });
    await tx.insert(sessionContexts).values(context); return context;
  }
  async function issueToken(tx: FamilyTransaction,context: FamilyAccessRecords['session']) {
    const bearer = newBearer(entropy);
    await tx.insert(sessionTokenVerifiers).values(parseFamilyAccessRecord('verifier',{ ...mutable(),family_id:context.family_id,
      session_id:context.id,token_verifier:familyTokenVerifier(bearer),verifier_version:1,retired_at:null }));
    return withSecret({ ok:true as const,session:{ id:context.id,family_id:context.family_id,profile_id:context.profile_id,mode:context.mode,expires_at:context.expires_at } },'bearer',bearer);
  }
  async function login(launchBearer: unknown,input: unknown) {
    return safe(async () => {
      const req = closedObject(input,['family_id','binding_id','pin']);
      const familyId = entityId(req.family_id),bindingId = entityId(req.binding_id),pin = parsePin(req.pin);
      const resolver: SourceResolver = tx => launchSource(tx,launchBearer,familyId,bindingId);
      const reservation = await reserve(resolver,'login',intentDigest(['login',familyId,bindingId]));
      return guardedReservation(reservation,async () => {
        if (!await checkedPin(reservation,pin)) return failure(new ContractError('adult.access_denied'));
        return db.transaction(async tx => {
          const source = await revalidate(tx,reservation,resolver);
          await consume(tx,source.launchId!,'adult_login');
          const context = await createContext(tx,source,source.binding,null,source.launchId);
          const result = await issueToken(tx,context); await finish(tx,reservation,'accepted'); return result;
        });
      });
    });
  }
  async function switchMode(bearer: unknown,input: unknown) {
    return safe(async () => {
      const req = closedObject(input,['pin','target_mode','target_binding_id','expected_session_revision']);
      const pin = parsePin(req.pin),target = entityId(req.target_binding_id),expected = revision(req.expected_session_revision);
      if (req.target_mode !== 'adult' && req.target_mode !== 'managed_child') reject('adult.access_denied');
      const targetMode = req.target_mode;
      const resolver: SourceResolver = async tx => {
        const source = await sessionSource(tx,bearer);
        if (source.actor!.session_revision !== expected) reject('adult.context_changed');
        const binding = await family.internal.validBinding(tx,target,source.binding.family_id);
        if (targetMode === 'adult' ? binding.id !== source.binding.id : binding.kind !== 'managed_child'
          || binding.account_id !== source.binding.account_id || binding.manager_binding_id !== source.binding.id) reject('adult.access_denied');
        if (targetMode === 'managed_child') {
          const [player] = await tx.select({ id:players.id }).from(players).where(and(eq(players.family_id,binding.family_id),eq(players.profile_id,binding.profile_id))).for('share');
          if (!player) reject('adult.access_denied');
        }
        return { ...source,targetBinding:binding };
      };
      const reservation = await reserve(resolver,'switch',intentDigest(['switch',targetMode,target,expected]));
      return guardedReservation(reservation,async () => {
        if (!await checkedPin(reservation,pin)) return failure(new ContractError('adult.access_denied'));
        return db.transaction(async tx => {
          const source = await revalidate(tx,reservation,resolver),time = now();
          const parent = await createContext(tx,source,source.binding,null,null);
          const targetBinding = await family.internal.validBinding(tx,target,source.binding.family_id);
          const context = targetMode === 'adult' ? parent : await createContext(tx,source,targetBinding,parent,null);
          await tx.update(sessionTokenVerifiers).set({ retired_at:time,updated_at:time,state_revision:source.actor!.verifier_revision+1 }).where(eq(sessionTokenVerifiers.id,source.actor!.verifier_id));
          if (source.actor!.mode === 'managed_child') await family.internal.revokeContexts(tx,source.binding.family_id,[source.actor!.session_id]);
          const result = await issueToken(tx,context); await finish(tx,reservation,'accepted'); return result;
        });
      });
    });
  }

  async function targetBindingFor(tx: FamilyTransaction,familyId: string,action: string,target: string) {
    let bindingId = target;
    if (action === 'revoke_session') {
      const [context] = await tx.select().from(sessionContexts).where(and(eq(sessionContexts.family_id,familyId),eq(sessionContexts.id,target)));
      if (!context) reject('adult.access_denied'); bindingId = context.binding_id;
    }
    const [binding] = await tx.select().from(accessBindings).where(and(eq(accessBindings.family_id,familyId),eq(accessBindings.id,bindingId)));
    if (!binding || action === 'revoke_binding' && binding.kind === 'adult_membership') reject('adult.access_denied');
    return familyAccessRecordToDto('binding',binding);
  }
  async function confirmAction(bearer: unknown,input: unknown) {
    return safe(async () => {
      const req = closedObject(input,['pin','action','target_id','expected_revision','operation_id']);
      const pin = parsePin(req.pin),target = entityId(req.target_id),expected = revision(req.expected_revision),operationId = entityId(req.operation_id);
      if (req.action !== 'revoke_session' && req.action !== 'revoke_binding') reject('adult.access_denied');
      const action = req.action;
      const resolver: SourceResolver = async tx => {
        const source = await sessionSource(tx,bearer);
        if (source.actor!.mode !== 'adult') reject('adult.access_denied');
        await targetBindingFor(tx,source.binding.family_id,action,target); return source;
      };
      const reservation = await reserve(resolver,'fresh',intentDigest([action,target,expected,operationId]));
      return guardedReservation(reservation,async () => {
        if (!await checkedPin(reservation,pin)) return failure(new ContractError('adult.access_denied'));
        return db.transaction(async tx => {
          const source = await revalidate(tx,reservation,resolver),actor = source.actor!,time = now();
          const [row] = await tx.select().from(sessionContexts).where(eq(sessionContexts.id,actor.session_id));
          const context = familyAccessRecordToDto('session',row),grant = [plus(time,cfg.adultGrantSeconds),context.expires_at].sort()[0];
          const idle = [plus(time,cfg.adultIdleSeconds),grant].sort()[0];
          await tx.update(sessionContexts).set({ adult_verified_at:time,adult_grant_expires_at:grant,adult_idle_expires_at:idle,
            updated_at:time,state_revision:context.state_revision+1 }).where(eq(sessionContexts.id,context.id));
          const proofBearer = newBearer(entropy),expires = [plus(time,cfg.freshSeconds),idle].sort()[0];
          const proof = parseAdultRecord('proof',{ ...mutable(time),...bindingFields(source.binding),protection_id:source.protection!.id,
            credential_revision:source.protection!.credential_revision,policy_revision:cfg.family.policyRevision,
            session_id:actor.session_id,session_revision:context.state_revision+1,source_verifier_id:actor.verifier_id,source_verifier_revision:actor.verifier_revision,
            attempt_id:reservation.attempt.id,operation_id:operationId,action,target_session_id:action === 'revoke_session' ? target : null,
            target_binding_id:action === 'revoke_binding' ? target : null,expected_revision:expected,
            token_verifier:secretDigest('adult_action_v1',proofBearer),verifier_version:1,expires_at:expires,consumed_at:null });
          await tx.insert(adultActionProofs).values(proof); await finish(tx,reservation,'accepted');
          return withSecret({ ok:true as const,expires_at:expires,operation_id:operationId },'proof_bearer',proofBearer);
        });
      });
    });
  }
  async function confirmSensitiveAction(tx: FamilyTransaction,request: Parameters<FamilyProtectionHooks['confirmSensitiveAction']>[1]): Promise<boolean | 'replayed'> {
    const { actor,action,target_id:target,expected_revision:expected } = request;
    await policy.assertActive(tx);
    const confirmation = closedObject(request.confirmation,['proof_bearer','operation_id']);
    const operationId = entityId(confirmation.operation_id),digest = operationDigest(action,target,expected);
    const [completed] = await tx.select().from(accessOperations).where(eq(accessOperations.id,operationId));
    if (completed) {
      if (completed.family_id !== actor.family_id || completed.actor_binding_id !== actor.binding_id || completed.request_digest !== digest) reject('adult.operation_conflict');
      return 'replayed';
    }
    if (!isBearer(confirmation.proof_bearer)) reject('adult.proof_invalid');
    const [stored] = await tx.select().from(adultActionProofs).where(eq(adultActionProofs.token_verifier,secretDigest('adult_action_v1',confirmation.proof_bearer))).for('update');
    if (!stored) reject('adult.proof_invalid');
    const proof = adultRecordToDto('proof',stored),time = now();
    if (proof.family_id !== actor.family_id || proof.binding_id !== actor.binding_id || proof.session_id !== actor.session_id
      || proof.session_revision !== actor.session_revision || proof.source_verifier_id !== actor.verifier_id || proof.source_verifier_revision !== actor.verifier_revision
      || proof.action !== action || (proof.target_session_id ?? proof.target_binding_id) !== target || proof.expected_revision !== expected
      || proof.operation_id !== operationId || proof.policy_revision !== cfg.family.policyRevision || proof.consumed_at !== null
      || time >= proof.expires_at || time < proof.updated_at) reject('adult.proof_invalid');
    if (!await verifyRevision(tx,{ family_id:actor.family_id,binding_id:actor.binding_id,profile_id:actor.profile_id,revision:proof.credential_revision })) reject('adult.proof_invalid');
    const targetBinding = await targetBindingFor(tx,actor.family_id,action,target);
    const quotaTarget = targetBinding.manager_binding_id ?? targetBinding.id;
    const prior = await tx.select({ id:accessOperations.id }).from(accessOperations).where(and(eq(accessOperations.family_id,actor.family_id),
      eq(accessOperations.actor_binding_id,actor.binding_id),eq(accessOperations.target_binding_id,quotaTarget),gte(accessOperations.created_at,plus(time,-cfg.revokePairSeconds))));
    if (prior.length) reject('adult.retry_later');
    await tx.update(adultActionProofs).set({ consumed_at:time,updated_at:time,state_revision:proof.state_revision+1 }).where(eq(adultActionProofs.id,proof.id));
    await tx.insert(accessOperations).values(parseAdultRecord('operation',{ ...base(time),id:operationId,family_id:actor.family_id,
      actor_binding_id:actor.binding_id,target_binding_id:quotaTarget,action,request_digest:digest }));
    const binding = await family.internal.validBinding(tx,actor.binding_id,actor.family_id);
    await audit(tx,binding,action,'accepted',null,operationId); return true;
  }

  const sessions = Object.freeze({ issueOwnChild:family.issueOwnChild,resolveSession:family.resolveSession,withFamilyAccess:family.withFamilyAccess,
    revokeSession:family.revokeSession,revokeBinding:family.revokeBinding,retireOwnBearer:family.retireOwnBearer });
  // Server composition only. The callback is executable application code, never request data.
  async function withFreshPin<T>(bearer:unknown,pinInput:unknown,intent:readonly unknown[],work:(tx:FamilyTransaction,source:Source)=>Promise<T>) {
    const pin=parsePin(pinInput);
    const resolver:SourceResolver=async tx=>{const source=await sessionSource(tx,bearer); if(source.actor!.mode!=='adult') reject('adult.access_denied'); return source;};
    const reservation=await reserve(resolver,'fresh',intentDigest(intent));
    return guardedReservation(reservation,async()=>{
      if(!await checkedPin(reservation,pin)) reject('adult.access_denied');
      return db.transaction(async tx=>{const source=await revalidate(tx,reservation,resolver);
        const result=await work(tx,source); await finish(tx,reservation,'accepted'); return result;});
    });
  }
  const internal=Object.freeze({family:family.internal,policy,cfg,now,base,mutable,limitedKdf,withFreshPin,rotateRecovery,protectionFor,entropy});
  return Object.freeze({ activatePolicy:(expected: number) => safe(() => policy.activate(expected)),beginSetup,getSetup,prepareSetup,
    rotatePendingRecovery,acknowledgeRecovery,login,switchMode,confirmAction,sessions,internal });
}
