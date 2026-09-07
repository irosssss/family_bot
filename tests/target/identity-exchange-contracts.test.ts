import { describe, expect, it } from 'vitest';
import { parseAccessRecord, accessRecordToDto } from '../../src/target/contracts/access';
import { createIdentityExchangeService } from '../../src/target/access/identityExchange';
import type { openTargetDatabase } from '../../src/target/db/database';
import { accessFixtures, exchangeConfig, startMs } from './identity-exchange-fixtures';

describe('closed access storage contracts', () => {
  it.each(['external_identity','access_launch','exchange_receipt','exchange_policy'] as const)('%s is closed, versioned and roundtrips', kind => {
    const row = accessFixtures()[kind];
    expect(parseAccessRecord(kind, row)).toEqual(row);
    expect(Object.isFrozen(parseAccessRecord(kind, row))).toBe(true);
    expect(accessRecordToDto(kind, { ...row, created_at: '2023-11-14 22:13:20+00' })).toEqual(row);
    for (const change of [{ extra: 'x' }, { id: 'bad' }, { schema_version: 2 }, { retention_policy_revision: 0 },
      { created_at: 'infinity' }, { retention_policy_id: '' }]) {
      expect(() => parseAccessRecord(kind, { ...row, ...change })).toThrow();
    }
    const { id: _id, ...missing } = row;
    expect(() => parseAccessRecord(kind, missing)).toThrow();
  });
  it('rejects malformed identity, references, state and expiry', () => {
    const rows = accessFixtures();
    for (const change of [{ subject: '01' }, { subject: '9007199254740993' }, { provider: 'other' },
      { account_id: 'bad' }, { state_revision: 0 }, { verified_at: '2023-11-14T22:13:21.000Z' }]) {
      expect(() => parseAccessRecord('external_identity', { ...rows.external_identity, ...change })).toThrow();
    }
    for (const change of [{ token_verifier: 'bad' }, { verifier_version: 2 }, { expires_at: rows.access_launch.created_at },
      { revoked_at: '2023-11-14T22:13:19.000Z' }]) {
      expect(() => parseAccessRecord('access_launch', { ...rows.access_launch, ...change })).toThrow();
    }
    expect(() => parseAccessRecord('exchange_receipt', { ...rows.exchange_receipt, cleanup_after: rows.exchange_receipt.authenticated_at })).toThrow();
    expect(() => parseAccessRecord('exchange_policy', { ...rows.exchange_policy, environment: 'other' })).toThrow();
  });
  it('rejects unknown/mutable configuration and invalid entropy without DB access', async () => {
    const db = {} as Awaited<ReturnType<typeof openTargetDatabase>>['db'];
    const cfg = exchangeConfig(() => startMs);
    for (const value of [{ ...cfg, extra: true }, { ...cfg, launchTtlSeconds: 0 },
      { ...cfg, retention: {} }, { ...cfg, telegram: { ...cfg.telegram, botToken: '' } }]) {
      expect(() => createIdentityExchangeService(db, value as typeof cfg)).toThrow('access.exchange_config_invalid');
    }
    const service = createIdentityExchangeService(db, cfg);
    expect(await service.exchangeTelegramIdentity({ subject: '1', ok: true })).toEqual({ ok: false, error_key: 'access.identity_invalid' });
    expect(await service.resolveLaunch('public-uuid')).toEqual({ ok: false, error_key: 'access.launch_invalid' });
  });
});
