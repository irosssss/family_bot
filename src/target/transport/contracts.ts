import { closedObject, reject } from '../contracts/errors';
import { entityId, revision } from '../contracts/ids';
import { isBearer } from '../access/adultCrypto';

export type Validator = (value: unknown) => unknown;
export type Shape = Readonly<Record<string, Validator>>;
export const text = (max: number): Validator => value => {
  if (typeof value !== 'string' || !value.length || value.length > max || /[\u0000\ud800-\udfff]/u.test(value)) reject('transport.request_invalid');
  return value;
};
export const id: Validator = entityId;
export const rev: Validator = revision;
export const token: Validator = value => { if (!isBearer(value)) reject('transport.request_invalid'); return value; };
export const pin: Validator = value => { if (typeof value !== 'string' || !/^[0-9]{6}$/.test(value)) reject('transport.request_invalid'); return value; };
export const choice = (...values: string[]): Validator => value => { if (!values.includes(value as string)) reject('transport.request_invalid'); return value; };
export const nullable = (validate: Validator): Validator => value => value === null ? null : validate(value);
export function parseShape(value: unknown, shape: Shape): Record<string, unknown> {
  const row = closedObject(value, Object.keys(shape));
  return Object.fromEntries(Object.entries(shape).map(([key, validate]) => [key, validate(row[key])]));
}

/** JSON syntax plus duplicate decoded keys and bounded nesting, before command dispatch. */
export function parseBody(bytes: Buffer): unknown {
  const source = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  const parsed: unknown = JSON.parse(source);
  let cursor = 0;
  const space = () => { while (/[\t\r\n ]/.test(source[cursor] ?? 'x')) cursor++; };
  const string = (): string => {
    const start = cursor++;
    while (cursor < source.length) {
      const char = source[cursor++];
      if (char === '\\') cursor++;
      else if (char === '"') return JSON.parse(source.slice(start, cursor)) as string;
    }
    return reject('transport.request_invalid');
  };
  function walk(depth: number): void {
    if (depth > 8) reject('transport.request_invalid');
    space();
    if (source[cursor] === '"') { string(); return; }
    if (source[cursor] === '{') {
      cursor++; space(); const keys = new Set<string>();
      if (source[cursor] === '}') { cursor++; return; }
      while (cursor < source.length) {
        space(); const key = string();
        if (keys.has(key)) reject('transport.request_invalid'); keys.add(key);
        space(); cursor++; walk(depth + 1); space();
        if (source[cursor++] === '}') return;
      }
    } else if (source[cursor] === '[') {
      cursor++; space(); if (source[cursor] === ']') { cursor++; return; }
      while (cursor < source.length) { walk(depth + 1); space(); if (source[cursor++] === ']') return; }
    } else { while (cursor < source.length && !/[\s,}\]]/.test(source[cursor])) cursor++; return; }
    reject('transport.request_invalid');
  }
  walk(0); return parsed;
}

export interface Projection { readonly [key: string]: true | Projection }
/** Only named public properties, including deliberately delivered non-enumerable secrets. */
export function project(value: unknown, fields: Projection): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) reject('transport.response_invalid');
  const row = value as Record<string, unknown>, output: Record<string, unknown> = {};
  for (const [name, field] of Object.entries(fields)) {
    const optional = name.endsWith('?'), key = optional ? name.slice(0,-1) : name;
    if (!Object.hasOwn(row, key)) {
      if (!optional) reject('transport.response_invalid');
      continue;
    }
    const item = row[key];
    if (field === true) {
      if (item !== null && typeof item !== 'string' && typeof item !== 'boolean' && !(typeof item === 'number' && Number.isSafeInteger(item))) reject('transport.response_invalid');
      output[key] = item;
    } else output[key] = item === null ? null : project(item, field);
  }
  return output;
}
