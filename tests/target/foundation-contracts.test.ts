import { describe, expect, it } from 'vitest';
import { foundationRecordToDto, instant, parseAccountRecord, parseFamilyRecord, parseMemberProfileRecord, parsePlayerRecord, parseRetentionPolicyRecord, zoneId } from '../../src/target/contracts/foundation';
import { createPayloadParser } from '../../src/target/contracts/payload';
import { accountFixture, familyFixture, fixturePayloadParser, playerFixture, profileFixture, retentionFixture, time } from './foundation-fixtures';

describe('foundation record boundaries (FB03/FB04)', () => {
  it('rejects unknown/missing fields and unsupported schema versions for every record', () => {
    const family = familyFixture(), profile = profileFixture(family.id);
    const cases = [[parseAccountRecord, accountFixture()], [parseFamilyRecord, family], [parseMemberProfileRecord, profile],
      [parsePlayerRecord, playerFixture(family.id, profile.id)]] as const;
    for (const [parse, record] of cases) {
      expect(parse(JSON.parse(JSON.stringify(record)))).toEqual(record);
      expect(() => parse({ ...record, extra: true })).toThrow('contract.fields_invalid');
      const { created_at: _createdAt, ...missing } = record;
      expect(() => parse(missing)).toThrow('contract.fields_invalid');
      expect(() => parse({ ...record, schema_version: 2 })).toThrow('contract.schema_unsupported');
      expect(() => parse({ ...record, retention_policy_revision: 0 })).toThrow('contract.revision_invalid');
    }
  });
  it('validates real calendar dates, UTC precision, finite instants and IANA zones', () => {
    for (const value of ['2026-02-30T12:00:00.000Z', '2026-09-07T12:00:00Z', '2026-09-07T15:00:00.000+03:00', 'infinity', 1]) {
      expect(() => instant(value)).toThrow('contract.instant_invalid');
    }
    expect(instant(time)).toBe(time); expect(zoneId('Europe/Moscow')).toBe('Europe/Moscow');
    for (const value of ['+03:00', 'Mars/Olympus', '', null]) expect(() => zoneId(value)).toThrow('contract.zone_invalid');
  });
  it('rejects contradictory states but keeps erasure-pending distinct from disabled', () => {
    const account = accountFixture(), family = familyFixture(), profile = profileFixture(family.id);
    expect(() => parseAccountRecord({ ...account, disabled_at: time })).toThrow('contract.account_state_invalid');
    expect(() => parseAccountRecord({ ...account, status: 'disabled' })).toThrow('contract.account_state_invalid');
    expect(parseAccountRecord({ ...account, status: 'erasure_pending' }).disabled_at).toBeNull();
    for (const change of [{ recurrence_paused: true }, { recurrence_paused: 'false' }, { status: 'archived' }, { calendar_revision: 0 }]) {
      expect(() => parseFamilyRecord({ ...family, ...change })).toThrow();
    }
    expect(parseFamilyRecord({ ...family, status: 'archived', archived_at: time }).status).toBe('archived');
    for (const change of [{ status: 'left' }, { archived_at: time }, { family_role: 'admin' }]) expect(() => parseMemberProfileRecord({ ...profile, ...change })).toThrow();
    expect(() => parsePlayerRecord({ ...playerFixture(family.id, profile.id), role: 'parent' })).toThrow('contract.enum_invalid');
    expect(() => parseAccountRecord({ ...account, updated_at: '2025-01-01T00:00:00.000Z' })).toThrow('contract.time_order_invalid');
  });
  it('rejects unregistered retention contracts and invalid nested values without supplying production defaults', () => {
    const record = retentionFixture();
    expect(() => parseRetentionPolicyRecord(record, createPayloadParser([]))).toThrow('contract.payload_unsupported');
    for (const policy_payload of [{ ...record.policy_payload, extra: true }, { ...record.policy_payload, schema_version: 2 },
      { ...record.policy_payload, value: { disposition: 'forever', exact_probe: '1' } },
      { ...record.policy_payload, value: { disposition: 'delete_with_test_database', exact_probe: 9223372036854775807 } }]) {
      expect(() => parseRetentionPolicyRecord({ ...record, policy_payload }, fixturePayloadParser)).toThrow();
    }
  });
  it('normalizes storage timestamps only through the explicit DB-to-wire adapter', () => {
    const account = accountFixture();
    expect(foundationRecordToDto('account', { ...account, created_at: '2026-09-07 15:00:00.123+03', updated_at: '2026-09-07 12:00:00.123+00' })).toEqual(account);
    expect(() => foundationRecordToDto('account', { ...account, created_at: 'infinity' })).toThrow('contract.instant_invalid');
  });
});
