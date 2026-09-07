import { createHash, randomBytes } from 'node:crypto';
import { and, eq, lt, sql } from 'drizzle-orm';
import type { openTargetDatabase } from '../db/database';
import { accounts } from '../db/schema/foundation';
import { accessLaunches, externalIdentities, identityExchangePolicy, identityExchangeReceipts } from '../db/schema/access';
import { sessionContexts } from '../db/schema/familyAccess';
import { launchConsumptions } from '../db/schema/adultProtection';
import { ContractError, closedObject, reject } from '../contracts/errors';
import { newEntityId, revision } from '../contracts/ids';
import { instant, key } from '../contracts/foundation';
import { accessRecordToDto, parseAccessRecord } from '../contracts/access';
import { createTelegramIdentityVerifier, type TelegramVerifierConfig } from './telegram';

type Database = Awaited<ReturnType<typeof openTargetDatabase>>['db'];
interface RetentionRef { readonly id: string; readonly revision: number }
export interface IdentityExchangeConfig {
  readonly telegram: TelegramVerifierConfig;
  readonly launchTtlSeconds: number;
  readonly retention: Readonly<Record<'account' | 'identity' | 'launch' | 'receipt' | 'policy', RetentionRef>>;
}
type Failure = Readonly<{ ok: false; error_key: string }>;
export type ExchangeResult = Failure | Readonly<{ ok: true; launch: Readonly<{ id: string; account_id: string; expires_at: string }>; bearer: string }>;
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const tokenVerifier = (token: string) => digest(`access_launch_v1:${token}`);
const publicErrors = new Set(['access.identity_invalid', 'access.verifier_unavailable', 'access.policy_mismatch',
  'access.policy_conflict', 'access.deployment_mismatch', 'access.identity_replayed', 'access.identity_unavailable',
  'access.entropy_unavailable', 'access.launch_invalid', 'access.clock_unavailable']);

/** Own verified target DB only; no environment access or public HTTP handler. */
export function createIdentityExchangeService(db: Database, input: IdentityExchangeConfig,
  entropy: (size: number) => Uint8Array = randomBytes) {
  let cfg: IdentityExchangeConfig;
  try {
    const root = closedObject(input, ['telegram','launchTtlSeconds','retention']);
    if (typeof root.launchTtlSeconds !== 'number' || !Number.isSafeInteger(root.launchTtlSeconds)
      || root.launchTtlSeconds < 1 || root.launchTtlSeconds > 86400 || typeof entropy !== 'function') reject('access.exchange_config_invalid');
    const retention = closedObject(root.retention, ['account','identity','launch','receipt','policy']);
    const copied = Object.fromEntries(Object.entries(retention).map(([name, value]) => {
      const row = closedObject(value, ['id','revision']);
      return [name, Object.freeze({ id: key(row.id), revision: revision(row.revision) })];
    })) as unknown as IdentityExchangeConfig['retention'];
    // Validate before copying; descriptors/getters and unsupported fields are rejected by G03-B.
    createTelegramIdentityVerifier(root.telegram as TelegramVerifierConfig);
    const telegram = root.telegram as TelegramVerifierConfig;
    if (telegram.policy.maxAgeSeconds > 86400 || telegram.policy.futureSkewSeconds > 300) reject('access.exchange_config_invalid');
    cfg = Object.freeze({ telegram: Object.freeze({ ...telegram, policy: Object.freeze({ ...telegram.policy }) }),
      launchTtlSeconds: root.launchTtlSeconds as number, retention: Object.freeze(copied) });
  } catch { return reject('access.exchange_config_invalid'); }
  const verify = createTelegramIdentityVerifier(cfg.telegram);
  // Canonical ordering; no raw token stored. Rotation changes this digest and requires
  // a policy revision/cutover, so an old process cannot continue accepting an old key.
  const p = cfg.telegram.policy;
  const policyDigest = digest(JSON.stringify([cfg.telegram.botId, cfg.telegram.environment, digest(cfg.telegram.botToken),
    p.id, p.revision, p.maxAgeSeconds, p.futureSkewSeconds, p.maxBytes, p.maxFields, cfg.launchTtlSeconds,
    ...(['account','identity','launch','receipt','policy'] as const).map(name => [name, cfg.retention[name].id, cfg.retention[name].revision])]));
  const now = () => {
    const value = cfg.telegram.now();
    if (!Number.isSafeInteger(value) || value < 0) reject('access.clock_unavailable');
    return instant(new Date(value).toISOString());
  };
  const base = (kind: keyof IdentityExchangeConfig['retention'], time: string) => ({ id: newEntityId(), schema_version: 1 as const,
    created_at: time, retention_policy_id: cfg.retention[kind].id, retention_policy_revision: cfg.retention[kind].revision });
  const mutable = (kind: keyof IdentityExchangeConfig['retention'], time: string) => ({ ...base(kind, time), updated_at: time, state_revision: 1 });
  async function guarded<T>(work: () => Promise<T>): Promise<T | Failure> {
    try { return await work(); }
    catch (error) {
      return Object.freeze({ ok: false as const, error_key: error instanceof ContractError && publicErrors.has(error.key)
        ? error.key : 'access.exchange_unavailable' });
    }
  }
  async function activePolicy(tx: Transaction, mode: 'share' | 'update' = 'share') {
    const [head] = await tx.select().from(identityExchangePolicy).where(eq(identityExchangePolicy.scope, 'telegram')).for(mode);
    if (!head || head.policy_digest !== policyDigest || head.environment !== cfg.telegram.environment || head.bot_id !== cfg.telegram.botId) {
      return reject('access.policy_mismatch');
    }
    return accessRecordToDto('exchange_policy', head);
  }

  /** Explicit operator/test operation, never implicit startup. CAS + monotone cutoff. */
  async function activatePolicy(expectedRevision: number) {
    return guarded(() => db.transaction(async tx => {
      if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) reject('access.policy_conflict');
      await tx.execute(sql`SELECT pg_advisory_xact_lock(70303, 1)`);
      const [stored] = await tx.select().from(identityExchangePolicy).where(eq(identityExchangePolicy.scope, 'telegram')).for('update');
      const time = now();
      if (!stored) {
        if (expectedRevision !== 0) reject('access.policy_conflict');
        const row = parseAccessRecord('exchange_policy', { ...mutable('policy', time), scope: 'telegram', environment: cfg.telegram.environment,
          bot_id: cfg.telegram.botId, policy_digest: policyDigest, verification_policy_id: cfg.telegram.policy.id,
          verification_policy_revision: cfg.telegram.policy.revision, activated_at: time,
          auth_date_floor: new Date(Math.ceil(Date.parse(time) / 1000) * 1000).toISOString() });
        await tx.insert(identityExchangePolicy).values(row);
        return Object.freeze({ ok: true as const, revision: 1 });
      }
      const head = accessRecordToDto('exchange_policy', stored);
      if (head.environment !== cfg.telegram.environment || head.bot_id !== cfg.telegram.botId) reject('access.deployment_mismatch');
      if (head.state_revision !== expectedRevision || time < head.updated_at) reject('access.policy_conflict');
      if (head.policy_digest === policyDigest) return Object.freeze({ ok: true as const, revision: head.state_revision });
      if (cfg.telegram.policy.revision <= head.verification_policy_revision) reject('access.policy_conflict');
      const row = parseAccessRecord('exchange_policy', { ...head, policy_digest: policyDigest,
        verification_policy_id: cfg.telegram.policy.id, verification_policy_revision: cfg.telegram.policy.revision,
        updated_at: time, state_revision: head.state_revision + 1, activated_at: time,
        auth_date_floor: new Date(Math.ceil(Date.parse(time) / 1000) * 1000).toISOString() });
      await tx.update(identityExchangePolicy).set(row).where(eq(identityExchangePolicy.id, head.id));
      return Object.freeze({ ok: true as const, revision: row.state_revision });
    }));
  }

  async function exchangeTelegramIdentity(rawInitData: unknown): Promise<ExchangeResult> {
    const early = verify(rawInitData);
    if (!early.ok) return early;
    return guarded(() => db.transaction(async tx => {
      const head = await activePolicy(tx);
      // Serialize only this subject's first exchange. Hash collisions merely delay another subject.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`telegram:${early.identity.subject}`}, 70303))`);
      const checked = verify(rawInitData); // Recheck freshness after lock acquisition.
      if (!checked.ok) reject(checked.error_key);
      const identity = checked.identity, time = identity.verified_at;
      if (identity.authenticated_at < head.auth_date_floor || time < head.updated_at) reject('access.identity_invalid');
      const [seen] = await tx.select({ id: identityExchangeReceipts.id }).from(identityExchangeReceipts)
        .where(eq(identityExchangeReceipts.replay_fingerprint, identity.replay_fingerprint));
      if (seen) reject('access.identity_replayed');
      const [existing] = await tx.select().from(externalIdentities)
        .where(and(eq(externalIdentities.provider, 'telegram'), eq(externalIdentities.subject, identity.subject))).for('update');
      let external;
      if (existing) {
        external = accessRecordToDto('external_identity', existing);
        const [account] = await tx.select().from(accounts).where(eq(accounts.id, external.account_id)).for('share');
        if (external.revoked_at !== null || !account || account.status !== 'active') reject('access.identity_unavailable');
        if (time < external.updated_at) reject('access.identity_invalid');
        await tx.update(externalIdentities).set({ verified_at: time, updated_at: time, state_revision: external.state_revision + 1 })
          .where(eq(externalIdentities.id, external.id));
      } else {
        const account = { ...mutable('account', time), status: 'active' as const, disabled_at: null };
        await tx.insert(accounts).values(account);
        external = parseAccessRecord('external_identity', { ...mutable('identity', time), account_id: account.id,
          provider: 'telegram', subject: identity.subject, verified_at: time, revoked_at: null });
        await tx.insert(externalIdentities).values(external);
      }
      const bytes = entropy(32);
      if (!(bytes instanceof Uint8Array) || bytes.byteLength !== 32) reject('access.entropy_unavailable');
      const token = Buffer.from(bytes).toString('base64url');
      const launch = parseAccessRecord('access_launch', { ...mutable('launch', time), account_id: external.account_id,
        external_identity_id: external.id, token_verifier: tokenVerifier(token), verifier_version: 1,
        expires_at: new Date(Date.parse(time) + cfg.launchTtlSeconds * 1000).toISOString(), revoked_at: null });
      await tx.insert(accessLaunches).values(launch);
      const receipt = parseAccessRecord('exchange_receipt', { ...base('receipt', time), replay_fingerprint: identity.replay_fingerprint,
        launch_id: launch.id, verification_policy_id: cfg.telegram.policy.id, verification_policy_revision: cfg.telegram.policy.revision,
        authenticated_at: identity.authenticated_at,
        cleanup_after: new Date(Date.parse(identity.authenticated_at) + (cfg.telegram.policy.maxAgeSeconds + cfg.telegram.policy.futureSkewSeconds) * 1000).toISOString() });
      await tx.insert(identityExchangeReceipts).values(receipt);
      const result = { ok: true as const, launch: Object.freeze({ id: launch.id, account_id: launch.account_id, expires_at: launch.expires_at }) };
      // Caller must deliberately deliver bearer after commit; accidental JSON logs omit it.
      Object.defineProperty(result, 'bearer', { value: token, enumerable: false });
      return Object.freeze(result) as Extract<ExchangeResult, { ok: true }>;
    }));
  }

  /** Internal composition seam: caller owns the transaction; never accepts client identity DTOs. */
  async function lockLaunch(tx: Transaction, bearer: unknown) {
    if (typeof bearer !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(bearer)
      || Buffer.from(bearer, 'base64url').toString('base64url') !== bearer) {
      return reject('access.launch_invalid');
    }
    const head = await activePolicy(tx);
    const [candidate] = await tx.select().from(accessLaunches).where(eq(accessLaunches.token_verifier, tokenVerifier(bearer)));
    if (!candidate) reject('access.launch_invalid');
    // Same global lock order as exchange: external identity -> account -> launch.
    const [identity] = await tx.select().from(externalIdentities).where(eq(externalIdentities.id,candidate.external_identity_id)).for('share');
    const [account] = await tx.select().from(accounts).where(eq(accounts.id,candidate.account_id)).for('share');
    const [stored] = await tx.select().from(accessLaunches).where(eq(accessLaunches.id,candidate.id)).for('update');
    if (!stored || !identity || !account) reject('access.launch_invalid');
    const launch = accessRecordToDto('access_launch', stored), time = now();
    const [consumed] = await tx.select({ id: sessionContexts.id }).from(sessionContexts).where(eq(sessionContexts.origin_launch_id,launch.id));
    const [receipt] = await tx.select({ id: launchConsumptions.id }).from(launchConsumptions).where(eq(launchConsumptions.launch_id,launch.id));
    if (consumed || receipt || launch.revoked_at !== null || identity.revoked_at !== null || account.status !== 'active'
      || time >= launch.expires_at || time < launch.created_at || time < head.updated_at) reject('access.launch_invalid');
    return Object.freeze({ launch_id: launch.id, account_id: launch.account_id,
      external_identity_id: launch.external_identity_id, provider: 'telegram' as const, subject: identity.subject, expires_at: launch.expires_at });
  }
  async function resolveLaunch(bearer: unknown) {
    if (typeof bearer !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(bearer)
      || Buffer.from(bearer,'base64url').toString('base64url') !== bearer) return Object.freeze({ ok: false as const, error_key: 'access.launch_invalid' });
    return guarded(() => db.transaction(async tx => Object.freeze({ ok: true as const, context: await lockLaunch(tx,bearer) })));
  }

  /** Strictly after horizon, never <=: verifier accepts the exact freshness boundary. */
  async function cleanupReceipts() {
    return guarded(() => db.transaction(async tx => {
      const head = await activePolicy(tx, 'update'), time = now();
      if (time < head.updated_at) reject('access.policy_conflict');
      const removed = await tx.delete(identityExchangeReceipts).where(lt(identityExchangeReceipts.cleanup_after, time)).returning({ id: identityExchangeReceipts.id });
      // Persist a clock watermark before forgetting replay evidence. A later clock
      // rollback cannot make old material valid again under the unchanged policy.
      await tx.update(identityExchangePolicy).set({ updated_at: time, state_revision: head.state_revision + 1 })
        .where(eq(identityExchangePolicy.id, head.id));
      return Object.freeze({ ok: true as const, removed: removed.length });
    }));
  }
  return Object.freeze({ activatePolicy, exchangeTelegramIdentity, resolveLaunch, cleanupReceipts, lockLaunch });
}
