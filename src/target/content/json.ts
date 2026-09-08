export class ContentInputError extends Error {
  constructor(public readonly code: string, public readonly file: string, public readonly pointer = '') { super(code); }
}
export interface InputLimits {
  readonly id: string; readonly revision: number; readonly maxFileBytes: number;
  readonly maxTotalBytes: number; readonly maxFiles: number; readonly maxDepth: number;
  readonly maxNodes: number; readonly maxStringLength: number;
}
/** Synthetic thresholds, not acceptance of the production O13 budget. */
export const SYNTHETIC_INPUT_LIMITS: InputLimits = Object.freeze({ id: 'synthetic_content', revision: 1,
  maxFileBytes: 65536, maxTotalBytes: 1048576, maxFiles: 64, maxDepth: 24, maxNodes: 10000, maxStringLength: 4096 });
export function checkedLimits(input: InputLimits): Readonly<InputLimits> {
  const ceilings = { revision: 2147483647, maxFileBytes: 1048576, maxTotalBytes: 16777216,
    maxFiles: 512, maxDepth: 64, maxNodes: 100000, maxStringLength: 65536 };
  if (!input || typeof input.id !== 'string' || !/^[a-z][a-z0-9_]{0,63}$/.test(input.id)
    || Object.keys(input).length !== 8) throw new ContentInputError('INVALID_LIMITS', '');
  for (const [key, ceiling] of Object.entries(ceilings)) {
    const value = input[key as keyof typeof ceilings];
    if (!Number.isSafeInteger(value) || value < 1 || value > ceiling) throw new ContentInputError('INVALID_LIMITS', '');
  }
  return Object.freeze({ ...input });
}
export const pointerKey = (key: string) => key.replace(/~/g, '~0').replace(/\//g, '~1');

/** Parse before JSON.parse can overwrite duplicate keys or round a number. */
export function parseContentJson(bytes: Uint8Array, file: string, inputLimits: InputLimits): unknown {
  const limits = checkedLimits(inputLimits);
  const fail = (code: string, pointer = ''): never => { throw new ContentInputError(code, file, pointer); };
  if (bytes.byteLength > limits.maxFileBytes) fail('FILE_TOO_LARGE');
  let text: string;
  try { text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes); }
  catch { return fail('INVALID_UNICODE'); }
  let cursor = 0, nodes = 0;
  const whitespace = () => { while (/[\x20\t\r\n]/.test(text[cursor] ?? 'x')) cursor++; };
  function string(pointer: string): string {
    const start = cursor++;
    while (cursor < text.length) {
      const char = text[cursor++];
      if (char === '\\') { cursor++; continue; }
      if (char === '"') {
        let value: string;
        try { value = JSON.parse(text.slice(start, cursor)); } catch { return fail('INVALID_JSON', pointer); }
        if (value.length > limits.maxStringLength) fail('STRING_TOO_LONG', pointer);
        if ([...value].some(c => { const n = c.codePointAt(0)!; return n >= 0xd800 && n <= 0xdfff; })
          || value.normalize('NFC') !== value) fail('INVALID_UNICODE', pointer);
        return value;
      }
    }
    return fail('INVALID_JSON', pointer);
  }
  function value(depth: number, pointer: string): unknown {
    if (depth > limits.maxDepth) fail('DEPTH_LIMIT', pointer);
    if (++nodes > limits.maxNodes) fail('NODE_LIMIT', pointer);
    whitespace(); const char = text[cursor];
    if (char === '"') return string(pointer);
    if (char === '{') {
      cursor++; whitespace(); const result: Record<string, unknown> = Object.create(null);
      if (text[cursor] === '}') { cursor++; return result; }
      while (cursor < text.length) {
        whitespace(); if (text[cursor] !== '"') fail('INVALID_JSON', pointer);
        const key = string(pointer), child = `${pointer}/${pointerKey(key)}`;
        if (Object.hasOwn(result, key)) fail('DUPLICATE_KEY', child);
        whitespace(); if (text[cursor++] !== ':') fail('INVALID_JSON', child);
        result[key] = value(depth + 1, child); whitespace();
        const end = text[cursor++]; if (end === '}') return result;
        if (end !== ',') fail('INVALID_JSON', pointer);
      }
      return fail('INVALID_JSON', pointer);
    }
    if (char === '[') {
      cursor++; whitespace(); const result: unknown[] = [];
      if (text[cursor] === ']') { cursor++; return result; }
      while (cursor < text.length) {
        result.push(value(depth + 1, `${pointer}/${result.length}`)); whitespace();
        const end = text[cursor++]; if (end === ']') return result;
        if (end !== ',') fail('INVALID_JSON', pointer);
      }
      return fail('INVALID_JSON', pointer);
    }
    const start = cursor;
    while (cursor < text.length && !/[\s,\]}]/.test(text[cursor])) cursor++;
    const token = text.slice(start, cursor);
    if (token === 'true') return true;
    if (token === 'false') return false;
    if (token === 'null') return null;
    // Authoring v1 numbers are small integers; UInt/Int amounts are decimal strings.
    if (!/^-?(0|[1-9][0-9]*)$/.test(token)) return fail('INVALID_JSON_NUMBER', pointer);
    if (token === '-0' || !Number.isSafeInteger(Number(token))) return fail('UNSAFE_NUMBER', pointer);
    return Number(token);
  }
  const parsed = value(0, ''); whitespace();
  if (cursor !== text.length) fail('INVALID_JSON');
  return parsed;
}
