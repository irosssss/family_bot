import { reject } from './errors';

export const MAX_INT64 = 9223372036854775807n;
// Domain deltas use the symmetric PDB range so negation remains representable.
export const MIN_DELTA = -MAX_INT64;
export type UInt = string & { readonly __uint: unique symbol };
export type Int = string & { readonly __int: unique symbol };

export function uint(value: unknown, pointer = ''): UInt {
  if (typeof value !== 'string' || value.length > 19 || !/^(0|[1-9][0-9]*)$/.test(value)
    || BigInt(value) > MAX_INT64) return reject('contract.uint_invalid', pointer);
  return value as UInt;
}

export function int(value: unknown, pointer = ''): Int {
  if (typeof value !== 'string' || value.length > 20 || !/^(0|-?[1-9][0-9]*)$/.test(value)) {
    return reject('contract.int_invalid', pointer);
  }
  const parsed = BigInt(value);
  if (parsed < MIN_DELTA || parsed > MAX_INT64) return reject('contract.int_invalid', pointer);
  return value as Int;
}
