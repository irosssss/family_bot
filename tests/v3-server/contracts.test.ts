import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import { ValidationError, V3Error, type V3ErrorCode } from '../../src/v3-server/contracts/errors.ts';
import {
  closedRecord, parseClosedRecord, parseEntityId, parseInstant, parseInt,
  parseLocalDate, parseRevision, parseUInt,
  type EntityId, type Instant, type Int, type LocalDate, type Revision, type UInt,
} from '../../src/v3-server/contracts/primitives.ts';
import {
  createCommandRegistry, JSON_LIMITS, parseCommandEnvelope, parseStrictJson,
  type CommandRegistry,
} from '../../src/v3-server/contracts/envelope.ts';

const ID = '019a29be-7c00-7000-8000-000000000001';
const schema = { targetId: parseEntityId, expectedRevision: parseRevision };
const registry = createCommandRegistry({ FixtureProbe: schema });
const base = {
  contract: 'family_life_v3.commands', version: '0.1', command: 'FixtureProbe', idempotencyKey: ID,
  payload: { targetId: ID, expectedRevision: 1 },
};
const wire = (overrides: Record<string, unknown> = {}) => JSON.stringify({ ...base, ...overrides });
const expectValidation = (operation: () => unknown) => {
  expect(operation).toThrow(ValidationError);
  try {
    operation();
  } catch (error) {
    expect(error).toMatchObject({ name: 'ValidationError', code: 'VALIDATION', message: 'Invalid V3 input.' });
    expect(error).not.toHaveProperty('cause');
  }
};

describe('V3 primitive wire boundaries', () => {
  it('accepts canonical UUIDv7 with each RFC variant and preserves the submitted identity', () => {
    for (const variant of ['8', '9', 'a', 'b']) {
      const id = ID.replace('-8000-', `-${variant}000-`);
      expect(parseEntityId(id)).toBe(id);
    }
    expectTypeOf(parseEntityId(ID)).toEqualTypeOf<EntityId>();
  });

  it.each([
    ID.toUpperCase(), ` ${ID}`, `${ID}\n`, ID.replace('-7000-', '-4000-'),
    ID.replace('-8000-', '-7000-'), ID.replace('-8000-', '-c000-'),
    ID.replaceAll('-', ''), '00000000-0000-0000-0000-000000000000',
    'ffffffff-ffff-ffff-ffff-ffffffffffff', null, 1, {}, new String(ID),
  ])('rejects noncanonical or invalid entity identity %#', value => {
    expectValidation(() => parseEntityId(value));
  });

  it('accepts exact safe positive revision endpoints without coercion', () => {
    expect(parseRevision(1)).toBe(1);
    expect(parseRevision(Number.MAX_SAFE_INTEGER)).toBe(Number.MAX_SAFE_INTEGER);
    expectTypeOf(parseRevision(1)).toEqualTypeOf<Revision>();
  });

  it.each([0, -0, -1, 0.5, 1.5, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1, '1', 1n, null, true, new Number(1)])(
    'rejects invalid revision object values %#', value => expectValidation(() => parseRevision(value)),
  );

  it('round-trips SQL bigint endpoints as strings, including the asymmetric signed minimum', () => {
    expect(parseUInt('0')).toBe('0');
    expect(parseUInt('9223372036854775807')).toBe('9223372036854775807');
    expect(parseInt('-9223372036854775808')).toBe('-9223372036854775808');
    expect(parseInt('9223372036854775807')).toBe('9223372036854775807');
    expect(parseInt('0')).toBe('0');
    expectTypeOf(parseUInt('1')).toEqualTypeOf<UInt>();
    expectTypeOf(parseInt('-1')).toEqualTypeOf<Int>();
  });

  it.each(['-0', '+0', '+1', '00', '01', '-01', '1.0', '1e0', '1E3', ' 1', '1 ', '1\n', '', '１２', '9223372036854775808', '9'.repeat(1000), 1, 1n, null])(
    'rejects noncanonical or overflowing bigint representations %#', value => {
      expectValidation(() => parseUInt(value));
      expectValidation(() => parseInt(value));
    },
  );

  it('rejects negative unsigned quantities and signed underflow', () => {
    expectValidation(() => parseUInt('-1'));
    expectValidation(() => parseUInt('-9223372036854775808'));
    expectValidation(() => parseInt('-9223372036854775809'));
  });

  it('checks actual Gregorian dates including century leap boundaries', () => {
    for (const date of ['0001-01-01', '2000-02-29', '2024-02-29', '2026-09-09', '9999-12-31']) {
      expect(parseLocalDate(date)).toBe(date);
    }
    expectTypeOf(parseLocalDate('2026-09-09')).toEqualTypeOf<LocalDate>();
  });

  it.each(['0000-01-01', '1900-02-29', '2100-02-29', '2025-02-29', '2026-04-31', '2026-00-01', '2026-13-01', '2026-01-00', '2026-01-32', '2026-1-01', '2026-09-09Z', '2026-09-09\n', new Date('2026-09-09')])(
    'rejects impossible and normalized calendar values %#', value => expectValidation(() => parseLocalDate(value)),
  );

  it('preserves UTC timestamps up to SQL microsecond precision', () => {
    for (const instant of ['0001-01-01T00:00:00Z', '2000-02-29T23:59:59Z', '2026-09-09T12:34:56.1Z', '2026-09-09T12:34:56.123456Z']) {
      expect(parseInstant(instant)).toBe(instant);
    }
    expectTypeOf(parseInstant('2026-09-09T00:00:00Z')).toEqualTypeOf<Instant>();
  });

  it.each([
    '2026-02-30T00:00:00Z', '2026-09-09T24:00:00Z', '2026-09-09T23:60:00Z', '2026-09-09T23:59:60Z',
    '2026-09-09T00:00:00+00:00', '2026-09-09T00:00:00-00:00', '2026-09-09T00:00:00+03:00',
    '2026-09-09t00:00:00z', '2026-09-09 00:00:00Z', '2026-09-09T00:00Z',
    '2026-09-09T00:00:00.Z', '2026-09-09T00:00:00.1234567Z', '2026-09-09T00:00:00Z\n', null,
  ])('rejects invalid UTC instants %#', value => expectValidation(() => parseInstant(value)));
});

describe('V3 closed records and safe errors', () => {
  it('copies only declared own data into a frozen null-prototype record', () => {
    const source = { targetId: ID, expectedRevision: 1 };
    const parsed = parseClosedRecord(source, schema);
    source.expectedRevision = 99;
    expect(parsed.expectedRevision).toBe(1);
    expect(Object.getPrototypeOf(parsed)).toBe(null);
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(parseClosedRecord(Object.assign(Object.create(null), source), schema).expectedRevision).toBe(99);
    expectTypeOf(parsed.targetId).toEqualTypeOf<EntityId>();
    expectTypeOf(parsed.expectedRevision).toEqualTypeOf<Revision>();
  });

  it('rejects inherited, symbol, nonenumerable, getter and extra fields without running accessors', () => {
    const getter = vi.fn(() => ID);
    const cases: unknown[] = [
      Object.create({ targetId: ID }), [], new Date(), null,
      { targetId: ID, [Symbol('hidden')]: 'secret' },
      Object.defineProperty({}, 'targetId', { value: ID, enumerable: false }),
      Object.defineProperty({}, 'targetId', { get: getter, enumerable: true }),
      { targetId: ID, actorId: ID },
    ];
    for (const input of cases) expectValidation(() => closedRecord(input, ['targetId']));
    expect(getter).not.toHaveBeenCalled();
  });

  it.each(['__proto__', 'constructor', 'prototype'])('rejects dangerous property %s even if a forged schema declares it', key => {
    const input = Object.create(null) as Record<string, unknown>;
    input[key] = ID;
    expectValidation(() => closedRecord(input, [key]));
    expectValidation(() => createCommandRegistry({ FixtureProbe: { [key]: parseEntityId } }));
    expectValidation(() => createCommandRegistry({ [key]: schema }));
  });

  it('sanitizes injected parser exceptions and hostile object traps without retaining secrets', () => {
    const secret = 'fixture-secret-must-never-be-returned';
    const throwingRegistry = createCommandRegistry({ FixtureProbe: { targetId: () => { throw new Error(secret); }, expectedRevision: parseRevision } });
    for (const operation of [
      () => parseCommandEnvelope(wire(), throwingRegistry),
      () => closedRecord(new Proxy({}, { ownKeys() { throw new Error(secret); } }), []),
      () => parseStrictJson(`{"private":"${secret}"`),
    ]) {
      try {
        operation();
        throw new Error('The invalid input unexpectedly passed');
      } catch (error) {
        expect(error).toBeInstanceOf(ValidationError);
        expect(String(error)).not.toContain(secret);
        expect(JSON.stringify(error)).not.toContain(secret);
        expect(error).not.toHaveProperty('cause');
      }
    }
    expect(new V3Error('FORBIDDEN')).toMatchObject({ code: 'FORBIDDEN', message: 'This operation is not permitted.' });
    expect(new V3Error(secret as V3ErrorCode)).toMatchObject({ code: 'VALIDATION', message: 'Invalid V3 input.' });
  });
});

describe('V3 raw command envelope before any SQL boundary', () => {
  it('infers a discriminated DTO from the injected closed command registry', () => {
    const typedRegistry = createCommandRegistry({
      FixtureProbe: schema,
      FixtureRead: { quantity: parseUInt },
    });
    const command = parseCommandEnvelope(wire(), typedRegistry);
    if (command.command === 'FixtureProbe') {
      expectTypeOf(command.payload.expectedRevision).toEqualTypeOf<Revision>();
      expectTypeOf(command.payload.targetId).toEqualTypeOf<EntityId>();
      expect(command.payload.expectedRevision).toBe(1);
    } else {
      expectTypeOf(command.payload.quantity).toEqualTypeOf<UInt>();
    }
    expect(Object.isFrozen(command)).toBe(true);
    expect(Object.isFrozen(command.payload)).toBe(true);
  });

  it('freezes registry definitions and rejects unknown commands and forged registries', () => {
    const editable = { FixtureProbe: { ...schema } };
    const snapshot = createCommandRegistry(editable);
    editable.FixtureProbe.expectedRevision = (() => 999 as Revision);
    expect(parseCommandEnvelope(wire(), snapshot).payload.expectedRevision).toBe(1);
    expectValidation(() => parseCommandEnvelope(wire({ command: 'SubmitCompletion' }), registry));
    expectValidation(() => parseCommandEnvelope(wire(), createCommandRegistry({})));
    expectValidation(() => parseCommandEnvelope(wire(), {} as CommandRegistry));
    expectValidation(() => parseCommandEnvelope(base, registry));
  });

  it.each([
    { contract: 'family_life.commands' }, { version: '0.2' }, { version: 0.1 },
    { command: 'constructor' }, { command: null }, { idempotencyKey: 'request-1' },
    { actorId: ID }, { capabilities: ['family.manage'] }, { reward: { gold: '999' } },
    { payload: null }, { payload: [] }, { payload: { targetId: ID } },
  ])('rejects unsupported envelopes and missing payload fields %#', override => {
    expectValidation(() => parseCommandEnvelope(wire(override), registry));
  });

  it.each(['actorId', 'actor', 'capabilities', 'reward', 'gold', 'familyId', 'rewardRulesVersion', 'adultSelfApproved'])('rejects injected payload field %s before a SQL callback can run', field => {
    const sql = vi.fn();
    const body = wire({ payload: { ...base.payload, [field]: 'untrusted' } });
    const boundary = () => {
      const parsed = parseCommandEnvelope(body, registry);
      sql(parsed);
    };
    expectValidation(boundary);
    expect(sql).not.toHaveBeenCalled();
  });

  it.each(['1.0', '1e0', '1E+0', '1e-0', '-0', '0', '-1', '01', '+1', '9007199254740992', '1e999', 'NaN', 'Infinity', '"1"'])('rejects revision token %s without JSON number normalization', token => {
    const raw = wire().replace('"expectedRevision":1', `"expectedRevision":${token}`);
    expectValidation(() => parseCommandEnvelope(raw, registry));
  });

  it('accepts the largest safe raw revision and keeps bigint quantities out of Number', () => {
    const raw = wire().replace('"expectedRevision":1', '"expectedRevision":9007199254740991');
    expect(parseCommandEnvelope(raw, registry).payload.expectedRevision).toBe(Number.MAX_SAFE_INTEGER);
    const quantityRegistry = createCommandRegistry({ FixtureQuantity: { amount: parseUInt } });
    const quantity = parseCommandEnvelope(wire({ command: 'FixtureQuantity', payload: { amount: '9223372036854775807' } }), quantityRegistry);
    expect(quantity.payload.amount).toBe('9223372036854775807');
    expectValidation(() => parseCommandEnvelope(wire({ command: 'FixtureQuantity', payload: { amount: 1 } }), quantityRegistry));
  });

  it('rejects duplicate keys at any depth, including escaped spellings of the same decoded key', () => {
    const raws = [
      wire().replace('"version":"0.1"', '"version":"0.1","version":"0.1"'),
      wire().replace('"expectedRevision":1', '"expectedRevision":1,"expectedRevision":2'),
      wire().replace('"expectedRevision":1', '"expectedRevision":1,"expected\\u0052evision":2'),
      '{"items":[{"n":1,"n":1}]}',
      '{"__proto__":{}}', '{"nested":{"constructor":{}}}',
    ];
    for (const raw of raws) expectValidation(() => parseStrictJson(raw));
    expect(parseStrictJson('{"text":"\\\"id\\\":1,\\\"id\\\":2"}')).toEqual({ text: '"id":1,"id":2' });
  });

  it.each(['', ' ', '{}{}', '{"x":1,}', '[1,]', '{"x":}', '{x:1}', '/* comment */{}', '{"x":"\\x20"}', '{"x":"line\nbreak"}', '\uFEFF{}', '{"x":undefined}'])('rejects malformed JSON %#', raw => {
    expectValidation(() => parseStrictJson(raw));
  });

  it('bounds raw body size, nesting and values before any injected parser runs', () => {
    const parser = vi.fn(parseEntityId);
    const boundedRegistry = createCommandRegistry({ FixtureProbe: { targetId: parser, expectedRevision: parseRevision } });
    for (const raw of [
      `"${'x'.repeat(JSON_LIMITS.maxCodeUnits)}"`,
      '['.repeat(JSON_LIMITS.maxDepth + 1) + 'null' + ']'.repeat(JSON_LIMITS.maxDepth + 1),
      '[' + Array.from({ length: JSON_LIMITS.maxValues }, () => 'null').join(',') + ']',
    ]) expectValidation(() => parseCommandEnvelope(raw, boundedRegistry));
    expect(parser).not.toHaveBeenCalled();
    expect(parseStrictJson(' \t\r\n{"ok":[true,false,null,-1,0,1]} \n')).toEqual({ ok: [true, false, null, -1, 0, 1] });
  });
});
