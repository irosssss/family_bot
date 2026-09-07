import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { closedObject, reject } from '../../contracts/errors';
import { parseTelegramQuery, parseTelegramSubject } from './parse';

export interface TelegramVerificationPolicy {
  readonly id: string;
  readonly revision: number;
  readonly maxAgeSeconds: number;
  readonly futureSkewSeconds: number;
  readonly maxBytes: number;
  readonly maxFields: number;
}

export interface TelegramVerifierConfig {
  readonly botId: string;
  readonly botToken: string;
  readonly environment: 'production' | 'test';
  readonly policy: TelegramVerificationPolicy;
  /** Server clock in Unix milliseconds, injected explicitly. */
  readonly now: () => number;
}

/** Internal verification result, not a session, bearer or family authorization. */
export interface VerifiedTelegramIdentity {
  readonly schema_version: 1;
  readonly provider: 'telegram';
  readonly subject: string;
  readonly bot_id: string;
  readonly environment: 'production' | 'test';
  readonly verification_method: 'telegram_hmac_sha256_v1';
  readonly verification_policy_id: string;
  readonly verification_policy_revision: number;
  readonly authenticated_at: string;
  readonly verified_at: string;
  /** Internal dedupe key only; the exchange service must still enforce uniqueness. */
  readonly replay_fingerprint: string;
}

export type TelegramVerificationResult =
  | Readonly<{ ok: true; identity: Readonly<VerifiedTelegramIdentity> }>
  | Readonly<{ ok: false; error_key: 'access.identity_invalid' | 'access.verifier_unavailable' }>;

function readConfig(input: TelegramVerifierConfig): TelegramVerifierConfig {
  try {
    const config = closedObject(input, ['botId', 'botToken', 'environment', 'policy', 'now']);
    const policy = closedObject(config.policy, ['id', 'revision', 'maxAgeSeconds', 'futureSkewSeconds', 'maxBytes', 'maxFields']);
    const integer = (value: unknown, min: number, max = Number.MAX_SAFE_INTEGER) =>
      typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max;
    if (typeof config.botId !== 'string' || !/^[1-9][0-9]*$/.test(config.botId)
      || !Number.isSafeInteger(Number(config.botId)) || typeof config.botToken !== 'string'
      || !config.botToken.startsWith(`${config.botId}:`) || !/^[1-9][0-9]*:[A-Za-z0-9_-]+$/.test(config.botToken)
      || !['production', 'test'].includes(config.environment as string) || typeof config.now !== 'function'
      || typeof policy.id !== 'string' || !/^[a-z][a-z0-9_]*$/.test(policy.id)
      || !integer(policy.revision, 1, 2147483647) || !integer(policy.maxAgeSeconds, 1)
      || !integer(policy.futureSkewSeconds, 0) || !integer(policy.maxBytes, 1, 1048576)
      || !integer(policy.maxFields, 3, 1024)) return reject('access.telegram_config_invalid');
    // Snapshot settings; later caller mutation cannot silently change verification policy.
    return { botId: config.botId, botToken: config.botToken,
      environment: config.environment as TelegramVerifierConfig['environment'], now: config.now as () => number,
      policy: Object.freeze({ ...policy }) as unknown as TelegramVerificationPolicy };
  } catch { return reject('access.telegram_config_invalid'); }
}

/** Pure server-only factory. No environment reads, HTTP, database, logging or fallback. */
export function createTelegramIdentityVerifier(input: TelegramVerifierConfig): (initData: unknown) => TelegramVerificationResult {
  const config = readConfig(input);
  const { botId, environment, now, policy } = config;
  const secretKey = createHmac('sha256', 'WebAppData').update(config.botToken).digest();
  const invalid = Object.freeze({ ok: false as const, error_key: 'access.identity_invalid' as const });
  return (initData: unknown): TelegramVerificationResult => {
    let authDate: number;
    let subject: string;
    let hash: string;
    try {
      const fields = parseTelegramQuery(initData, policy.maxBytes, policy.maxFields);
      hash = fields.get('hash') ?? '';
      if (!/^[a-f0-9]{64}$/i.test(hash)) return invalid;
      const checkString = [...fields.keys()].filter(name => name !== 'hash').sort()
        .map(name => `${name}=${fields.get(name)}`).join('\n');
      const expected = createHmac('sha256', secretKey).update(checkString).digest();
      if (!timingSafeEqual(expected, Buffer.from(hash, 'hex'))) return invalid;
      const authDateText = fields.get('auth_date') ?? '';
      if (!/^[1-9][0-9]*$/.test(authDateText)) return invalid;
      authDate = Number(authDateText);
      // Keep wire instants in the target contract's four-digit ISO year range.
      if (!Number.isSafeInteger(authDate) || authDate > 253402300799) return invalid;
      subject = parseTelegramSubject(fields.get('user') ?? '');
    } catch { return invalid; }

    let nowMs: number;
    try {
      nowMs = now();
      if (!Number.isSafeInteger(nowMs) || nowMs < 0 || nowMs > 253402300799999) throw new Error();
    } catch { return Object.freeze({ ok: false, error_key: 'access.verifier_unavailable' }); }
    const ageSeconds = nowMs / 1000 - authDate;
    if (ageSeconds > policy.maxAgeSeconds || ageSeconds < -policy.futureSkewSeconds) return invalid;
    const replayFingerprint = createHash('sha256')
      .update(JSON.stringify(['telegram_hmac_sha256_v1', botId, environment, hash.toLowerCase()])).digest('hex');
    return Object.freeze({ ok: true, identity: Object.freeze({
      schema_version: 1, provider: 'telegram', subject, bot_id: botId, environment,
      verification_method: 'telegram_hmac_sha256_v1', verification_policy_id: policy.id,
      verification_policy_revision: policy.revision,
      authenticated_at: new Date(authDate * 1000).toISOString(), verified_at: new Date(nowMs).toISOString(),
      replay_fingerprint: replayFingerprint,
    }) });
  };
}
