import { createHash } from 'node:crypto';
import { ContentInputError } from './json';

export const compareText = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
export function freezeJson<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freezeJson(child);
    Object.freeze(value);
  }
  return value;
}

/** RFC 8785: UTF-16 key order, ECMAScript primitive serialization, arrays keep order.
 * Domain parsing restricts numbers separately. This function never coerces or calls toJSON.
 */
export function canonicalJson(input: unknown): string {
  const ancestors = new Set<object>();
  let nodes = 0;
  const fail = (): never => { throw new ContentInputError('NOT_CANONICAL_JSON_INPUT', ''); };
  const string = (value: string) => {
    for (const character of value) {
      const point = character.codePointAt(0)!;
      if (point >= 0xd800 && point <= 0xdfff) fail();
    }
    return JSON.stringify(value);
  };
  function visit(value: unknown, depth: number): string {
    if (++nodes > 100000 || depth > 64) return fail();
    if (value === null) return 'null';
    if (typeof value === 'string') return string(value);
    if (typeof value === 'boolean') return String(value);
    if (typeof value === 'number') return Number.isFinite(value) ? JSON.stringify(value) : fail();
    if (!value || typeof value !== 'object' || ancestors.has(value)) return fail();
    const descriptors = Object.getOwnPropertyDescriptors(value);
    if (Object.getOwnPropertySymbols(value).length) return fail();
    for (const [key, descriptor] of Object.entries(descriptors)) {
      if (!('value' in descriptor) || (!descriptor.enumerable && !(Array.isArray(value) && key === 'length'))) fail();
    }
    ancestors.add(value);
    try {
      if (Array.isArray(value)) {
        if (Object.keys(value).length !== value.length) return fail();
        return '[' + Array.from({ length: value.length }, (_, i) => {
          if (!Object.hasOwn(descriptors, String(i))) return fail();
          return visit(descriptors[i].value, depth + 1);
        }).join(',') + ']';
      }
      if (![null, Object.prototype].includes(Object.getPrototypeOf(value))) return fail();
      return '{' + Object.keys(descriptors).sort().map(key => string(key) + ':' + visit(descriptors[key].value, depth + 1)).join(',') + '}';
    } finally { ancestors.delete(value); }
  }
  return visit(input, 0);
}
export const hashBytes = (bytes: string | Uint8Array) => createHash('sha256').update(bytes).digest('hex');
export const hashJson = (value: unknown) => hashBytes(canonicalJson(value));
