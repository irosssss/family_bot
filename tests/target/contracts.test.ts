import { describe, expect, it, vi } from 'vitest';
import { randomBytes } from 'node:crypto';
import { contentId, entityId, newEntityId, revision } from '../../src/target/contracts/ids';
import { int, uint } from '../../src/target/contracts/numbers';
import { assetRef, contentRef, registryRef } from '../../src/target/contracts/references';
import { ContractError, closedObject } from '../../src/target/contracts/errors';
import { createPayloadParser } from '../../src/target/contracts/payload';

vi.mock('node:crypto', async importOriginal => {
  const actual = await importOriginal<typeof import('node:crypto')>();
  return { ...actual, randomBytes: vi.fn(actual.randomBytes) };
});

describe('target exact contracts (FT04/FT05)', () => {
  it('roundtrips signed bigint boundaries through JSON without Number', () => {
    const value = { max: uint('9223372036854775807'), min: int('-9223372036854775807'), zero: uint('0') };
    expect(JSON.parse(JSON.stringify(value))).toEqual(value);
    expect(BigInt(value.max) + BigInt(value.min)).toBe(0n);
  });
  it.each([null, 1, 9007199254740992, '-0', '00', '01', '1.0', '1e3', ' 1', '+1', 'NaN', '9223372036854775808', '9'.repeat(10000)])('rejects invalid UInt %s', value => {
    expect(() => uint(value, '/coins')).toThrow(ContractError);
  });
  it.each(['-0', '-01', '-9223372036854775808', '-9223372036854775809', '9223372036854775808', 1, '-1.5'])('rejects invalid Int %s', value => {
    expect(() => int(value)).toThrow(ContractError);
  });
  it('accepts negative deltas but rejects negative balances', () => {
    expect(int('-1')).toBe('-1'); expect(() => uint('-1')).toThrow();
  });
  it('uses the RFC 9562 Appendix A.6 UUIDv7 vector', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1645557742000);
    vi.mocked(randomBytes).mockReturnValueOnce(Buffer.from('0000000000000cc318c4dc0c0c07398f', 'hex') as never);
    try { expect(newEntityId()).toBe('017f22e2-79b0-7cc3-98c4-dc0c0c07398f'); }
    finally { vi.restoreAllMocks(); }
  });
  it('generates valid independent IDs and rejects wrong version/variant', () => {
    const ids = Array.from({ length: 1000 }, () => newEntityId());
    expect(new Set(ids).size).toBe(1000);
    for (const id of ids) expect(entityId(id)).toBe(id);
    expect(() => entityId('017f22e2-79b0-4cc3-98c4-dc0c0c07398f')).toThrow();
    expect(() => entityId('017f22e2-79b0-7cc3-78c4-dc0c0c07398f')).toThrow();
  });
  it('checks exact refs, field pointers, revisions and asset kind', () => {
    expect(contentRef({ definition_id: 'core:pet/cat', content_revision: 1 })).toEqual({ definition_id: 'core:pet/cat', content_revision: 1 });
    expect(assetRef({ asset_id: 'core:asset/cat', asset_revision: 2 }).asset_revision).toBe(2);
    expect(registryRef({ registry_id: 'core:profile/hero', revision: 1 }).revision).toBe(1);
    expect(revision(2147483647)).toBe(2147483647);
    for (const n of [0, 1.5, NaN, Infinity, '1', 2147483648]) expect(() => revision(n)).toThrow();
    for (const id of ['core:pet/../cat', 'Core:pet/cat', 'cat', 'core:pet/cat/extra']) expect(() => contentId(id)).toThrow();
    expect(() => assetRef({ asset_id: 'core:pet/cat', asset_revision: 1 })).toThrow('contract.asset_kind_invalid');
    try { contentRef({ definition_id: 'core:pet/cat', content_revision: 0 }, '/item'); }
    catch (error) { expect((error as ContractError).pointer).toBe('/item/content_revision'); }
  });
  it('rejects missing/extra/accessor/prototype fields without executing accessors', () => {
    expect(() => contentRef({ definition_id: 'core:pet/cat', content_revision: 1, latest: true })).toThrow();
    expect(() => contentRef({ definition_id: 'core:pet/cat' })).toThrow();
    const getter = vi.fn(() => 1);
    const value = Object.defineProperty({ definition_id: 'core:pet/cat' }, 'content_revision', { get: getter });
    expect(() => contentRef(value)).toThrow(); expect(getter).not.toHaveBeenCalled();
    expect(() => closedObject(new Date(), [])).toThrow();
  });
  it('validates the closed payload envelope, selected value schema and unknown pairs', () => {
    const parse = createPayloadParser([{ contract_id: 'fixture_amount', schema_version: 1, parse: (value, pointer) => {
      const row = closedObject(value, ['amount'], pointer); return { amount: uint(row.amount, `${pointer}/amount`) };
    } }]);
    expect(parse({ contract_id: 'fixture_amount', schema_version: 1, value: { amount: '5' } }).value).toEqual({ amount: '5' });
    expect(() => parse({ contract_id: 'fixture_amount', schema_version: 1, value: { amount: 5 } })).toThrow();
    expect(() => parse({ contract_id: 'fixture_amount', schema_version: 2, value: { amount: '5' } })).toThrow('contract.payload_unsupported');
    expect(() => createPayloadParser([])({ contract_id: 'fixture_amount', schema_version: 1, value: {} })).toThrow();
    expect(() => createPayloadParser([{ contract_id: 'x', schema_version: 1, parse: v => v }, { contract_id: 'x', schema_version: 1, parse: v => v }])).toThrow();
  });
});
