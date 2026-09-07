import { createHmac } from 'node:crypto';
import vector from '../fixtures/telegram-init-data.json';
import type { IdentityExchangeConfig } from '../../src/target/access/identityExchange';
import { newEntityId } from '../../src/target/contracts/ids';

export const startMs = vector.nowMs;
export function exchangeConfig(now: () => number): IdentityExchangeConfig {
  const ref = { id: 'fixture_only', revision: 1 };
  return { telegram: { botId: '7000000000', botToken: vector.botToken, environment: 'test', now,
    policy: { id: 'fixture_access', revision: 1, maxAgeSeconds: 300, futureSkewSeconds: 30, maxBytes: 16384, maxFields: 64 } },
    launchTtlSeconds: 600, retention: { account: ref, identity: ref, launch: ref, receipt: ref, policy: ref } };
}
export function syntheticInput(time = startMs, queryId = 'one', userId = 69513172, token = vector.botToken) {
  const fields = { auth_date: String(Math.floor(time / 1000)), query_id: queryId,
    user: JSON.stringify({ id: userId, first_name: 'Синтетический % + &' }) };
  const key = createHmac('sha256', 'WebAppData').update(token).digest();
  const check = Object.entries(fields).sort().map(([k,v]) => `${k}=${v}`).join('\n');
  return new URLSearchParams({ ...fields, hash: createHmac('sha256', key).update(check).digest('hex') }).toString();
}
export function accessFixtures() {
  const time = new Date(startMs).toISOString();
  const base = () => ({ id: newEntityId(), schema_version: 1, created_at: time, retention_policy_id: 'fixture_only', retention_policy_revision: 1 });
  const mutable = () => ({ ...base(), updated_at: time, state_revision: 1 });
  const identity = { ...mutable(), account_id: newEntityId(), provider: 'telegram', subject: '69513172', verified_at: time, revoked_at: null };
  const launch = { ...mutable(), account_id: identity.account_id, external_identity_id: identity.id,
    token_verifier: 'a'.repeat(64), verifier_version: 1, expires_at: new Date(startMs + 600000).toISOString(), revoked_at: null };
  return {
    external_identity: identity, access_launch: launch,
    exchange_receipt: { ...base(), launch_id: launch.id, replay_fingerprint: 'b'.repeat(64), verification_policy_id: 'fixture_access', verification_policy_revision: 1,
      authenticated_at: time, cleanup_after: new Date(startMs + 330000).toISOString() },
    exchange_policy: { ...mutable(), scope: 'telegram', environment: 'test', bot_id: '7000000000', policy_digest: 'c'.repeat(64),
      verification_policy_id: 'fixture_access', verification_policy_revision: 1, activated_at: time, auth_date_floor: time },
  };
}
