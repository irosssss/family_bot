import { asValidationError, assertValidation } from './errors.ts';

type Brand<T, Name extends string> = T & { readonly __v3Brand: Name };
export type EntityId = Brand<string, 'EntityId'>;
export type Revision = Brand<number, 'Revision'>;
export type UInt = Brand<string, 'UInt'>;
export type Int = Brand<string, 'Int'>;
export type LocalDate = Brand<string, 'LocalDate'>;
export type Instant = Brand<string, 'Instant'>;
export type Parser<T> = (value: unknown) => T;
export type FieldParsers = Readonly<Record<string, Parser<unknown>>>;
export type ParsedFields<S extends FieldParsers> = { readonly [K in keyof S]: ReturnType<S[K]> };

const SQL_BIGINT_MAX = 9223372036854775807n;
const SQL_BIGINT_MIN = -9223372036854775808n;
const dangerousKeys = new Set(['__proto__', 'prototype', 'constructor']);

export function isSafeRecordKey(value: string): boolean {
  return !dangerousKeys.has(value);
}

/** UUID version and RFC variant are both checked; no trim, casing or ID coercion. */
export function parseEntityId(value: unknown): EntityId {
  assertValidation(typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value));
  return value as EntityId;
}

export function parseRevision(value: unknown): Revision {
  assertValidation(typeof value === 'number' && Number.isSafeInteger(value) && value > 0 && !Object.is(value, -0));
  return value as Revision;
}

export function parseUInt(value: unknown): UInt {
  assertValidation(typeof value === 'string' && /^(0|[1-9][0-9]{0,18})$/.test(value));
  assertValidation(BigInt(value) <= SQL_BIGINT_MAX);
  return value as UInt;
}

export function parseInt(value: unknown): Int {
  assertValidation(typeof value === 'string' && /^(0|-?[1-9][0-9]{0,18})$/.test(value));
  const quantity = BigInt(value);
  assertValidation(quantity >= SQL_BIGINT_MIN && quantity <= SQL_BIGINT_MAX);
  return value as Int;
}

/** Proleptic Gregorian YYYY-MM-DD, years 0001..9999; no Date rollover normalization. */
export function parseLocalDate(value: unknown): LocalDate {
  assertValidation(typeof value === 'string' && /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(value));
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const monthDays = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  assertValidation(year >= 1 && month >= 1 && month <= 12 && day >= 1 && day <= monthDays[month - 1]);
  return value as LocalDate;
}

/** UTC Z form, seconds required, optional 1..6 fractional digits (PostgreSQL precision). */
export function parseInstant(value: unknown): Instant {
  assertValidation(typeof value === 'string' && /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]{1,6})?Z$/.test(value));
  parseLocalDate(value.slice(0, 10));
  assertValidation(Number(value.slice(11, 13)) <= 23 && Number(value.slice(14, 16)) <= 59 && Number(value.slice(17, 19)) <= 59);
  return value as Instant;
}

/** Return a frozen own-data snapshot. Never invoke getters or retain the original object. */
export function closedRecord<K extends string>(value: unknown, requiredKeys: readonly K[]): Readonly<Record<K, unknown>> {
  return asValidationError(() => {
    assertValidation(typeof value === 'object' && value !== null && !Array.isArray(value));
    const prototype: unknown = Object.getPrototypeOf(value);
    assertValidation(prototype === null || prototype === Object.prototype);
    const required = new Set<string>(requiredKeys);
    assertValidation(required.size === requiredKeys.length && requiredKeys.every(isSafeRecordKey));
    const actual = Reflect.ownKeys(value);
    assertValidation(actual.length === required.size);
    const result = Object.create(null) as Record<K, unknown>;
    for (const key of actual) {
      assertValidation(typeof key === 'string' && isSafeRecordKey(key) && required.has(key));
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      assertValidation(descriptor !== undefined && 'value' in descriptor && descriptor.enumerable === true);
      result[key as K] = descriptor.value;
    }
    return Object.freeze(result);
  });
}

/** All declared fields are required; nullable/union/nested values use explicit parsers. */
export function parseClosedRecord<S extends FieldParsers>(value: unknown, schema: S): ParsedFields<S> {
  return asValidationError(() => {
    const keys = Reflect.ownKeys(schema);
    assertValidation(keys.every(key => typeof key === 'string' && isSafeRecordKey(key)));
    const parsers = closedRecord(schema, keys as string[]);
    const input = closedRecord(value, keys as string[]);
    const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    for (const key of keys as string[]) {
      const parser = parsers[key];
      assertValidation(typeof parser === 'function');
      result[key] = (parser as Parser<unknown>)(input[key]);
    }
    return Object.freeze(result) as ParsedFields<S>;
  });
}
