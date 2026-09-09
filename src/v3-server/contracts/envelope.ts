import { asValidationError, assertValidation } from './errors.ts';
import {
  closedRecord, isSafeRecordKey, parseClosedRecord, parseEntityId,
  type EntityId, type FieldParsers, type ParsedFields,
} from './primitives.ts';

export type CommandEnvelope<K extends string, P> = Readonly<{
  contract: 'family_life_v3.commands';
  version: '0.1';
  command: K;
  idempotencyKey: EntityId;
  payload: P;
}>;
export type CommandSchemas = Readonly<Record<string, FieldParsers>>;
declare const registryType: unique symbol;
export type CommandRegistry<S extends CommandSchemas = CommandSchemas> = Readonly<{ [registryType]: S }>;
export type ParsedCommand<S extends CommandSchemas> = {
  [K in keyof S & string]: CommandEnvelope<K, ParsedFields<S[K]>>
}[keyof S & string];

const schemasByRegistry = new WeakMap<object, CommandSchemas>();
export const JSON_LIMITS = Object.freeze({ maxCodeUnits: 65_536, maxDepth: 32, maxValues: 4_096 });

/** No built-in commands: a harness injects its own closed neutral probe schemas. */
export function createCommandRegistry<const S extends CommandSchemas>(schemas: S): CommandRegistry<S> {
  return asValidationError(() => {
    const names = Object.keys(schemas);
    const source = closedRecord(schemas, names);
    const snapshot: Record<string, FieldParsers> = Object.create(null) as Record<string, FieldParsers>;
    for (const name of names) {
      assertValidation(name.length > 0 && name.length <= 128);
      const schema = source[name];
      assertValidation(typeof schema === 'object' && schema !== null);
      const fields = closedRecord(schema, Object.keys(schema));
      assertValidation(Object.values(fields).every(parser => typeof parser === 'function'));
      snapshot[name] = fields as FieldParsers;
    }
    const registry = Object.freeze(Object.create(null)) as CommandRegistry<S>;
    schemasByRegistry.set(registry, Object.freeze(snapshot));
    return registry;
  });
}

/**
 * Parse before JSON can discard duplicate keys or normalize numeric spelling.
 * V3 numeric wire values are safe integer tokens; bigint quantities travel as strings.
 * No native JSON.parse error, original body, key, offset or callback cause escapes.
 */
export function parseStrictJson(raw: unknown): unknown {
  return asValidationError(() => {
    assertValidation(typeof raw === 'string' && raw.length > 0 && raw.length <= JSON_LIMITS.maxCodeUnits);
    let offset = 0;
    let values = 0;
    const whitespace = () => {
      while (offset < raw.length && /[\u0020\t\r\n]/.test(raw[offset])) offset += 1;
    };
    const string = (): string => {
      assertValidation(raw[offset] === '"');
      const start = offset;
      offset += 1;
      while (offset < raw.length) {
        const character = raw[offset];
        if (character === '"') {
          offset += 1;
          const decoded: unknown = JSON.parse(raw.slice(start, offset));
          assertValidation(typeof decoded === 'string');
          return decoded;
        }
        assertValidation(raw.charCodeAt(offset) >= 0x20);
        offset += character === '\\' ? 2 : 1;
      }
      assertValidation(false);
    };
    const value = (depth: number): unknown => {
      values += 1;
      assertValidation(depth <= JSON_LIMITS.maxDepth && values <= JSON_LIMITS.maxValues);
      whitespace();
      const first = raw[offset];
      if (first === '"') return string();
      if (first === '{') {
        offset += 1;
        whitespace();
        const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
        const keys = new Set<string>();
        if (raw[offset] === '}') {
          offset += 1;
          return Object.freeze(result);
        }
        while (true) {
          const key = string();
          assertValidation(isSafeRecordKey(key) && !keys.has(key));
          keys.add(key);
          whitespace();
          assertValidation(raw[offset] === ':');
          offset += 1;
          result[key] = value(depth + 1);
          whitespace();
          if (raw[offset] === '}') {
            offset += 1;
            return Object.freeze(result);
          }
          assertValidation(raw[offset] === ',');
          offset += 1;
          whitespace();
        }
      }
      if (first === '[') {
        offset += 1;
        whitespace();
        const result: unknown[] = [];
        if (raw[offset] === ']') {
          offset += 1;
          return Object.freeze(result);
        }
        while (true) {
          result.push(value(depth + 1));
          whitespace();
          if (raw[offset] === ']') {
            offset += 1;
            return Object.freeze(result);
          }
          assertValidation(raw[offset] === ',');
          offset += 1;
        }
      }
      for (const [literal, decoded] of [['true', true], ['false', false], ['null', null]] as const) {
        if (raw.startsWith(literal, offset)) {
          offset += literal.length;
          return decoded;
        }
      }
      const match = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/.exec(raw.slice(offset));
      assertValidation(match !== null && /^-?(?:0|[1-9][0-9]*)$/.test(match[0]));
      const number = Number(match[0]);
      assertValidation(Number.isSafeInteger(number) && !Object.is(number, -0));
      offset += match[0].length;
      return number;
    };
    const parsed = value(0);
    whitespace();
    assertValidation(offset === raw.length);
    return parsed;
  });
}

/** The sole wire entry accepts raw JSON, never an already normalized request body. */
export function parseCommandEnvelope<S extends CommandSchemas>(raw: unknown, registry: CommandRegistry<S>): ParsedCommand<S> {
  return asValidationError(() => {
    const input = closedRecord(parseStrictJson(raw), ['contract', 'version', 'command', 'idempotencyKey', 'payload'] as const);
    assertValidation(input.contract === 'family_life_v3.commands' && input.version === '0.1');
    assertValidation(typeof input.command === 'string' && isSafeRecordKey(input.command));
    const schemas = schemasByRegistry.get(registry);
    assertValidation(schemas !== undefined && Object.hasOwn(schemas, input.command));
    const idempotencyKey = parseEntityId(input.idempotencyKey);
    const payload = parseClosedRecord(input.payload, schemas[input.command]);
    return Object.freeze({
      contract: 'family_life_v3.commands', version: '0.1',
      command: input.command, idempotencyKey, payload,
    }) as ParsedCommand<S>;
  });
}
