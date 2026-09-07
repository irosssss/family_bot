import { reject } from '../../contracts/errors';

export function parseTelegramQuery(input: unknown, maxBytes: number, maxFields: number): Map<string, string> {
  if (typeof input !== 'string' || input.length === 0 || input.length > maxBytes
    || Buffer.byteLength(input, 'utf8') > maxBytes) return reject('access.identity_invalid');
  // Buffer's UTF-8 encoder replaces lone UTF-16 surrogates. Reject before signing
  // so distinct malformed strings cannot silently become the same signed bytes.
  for (const character of input) {
    const codePoint = character.codePointAt(0)!;
    if (codePoint >= 0xd800 && codePoint <= 0xdfff) return reject('access.identity_invalid');
  }
  const pairs = input.split('&');
  if (pairs.length > maxFields) return reject('access.identity_invalid');
  const fields = new Map<string, string>();
  const decode = (value: string) => decodeURIComponent(value.replace(/\+/g, ' '));
  for (const pair of pairs) {
    const separator = pair.indexOf('=');
    if (separator < 1) return reject('access.identity_invalid');
    const name = decode(pair.slice(0, separator));
    const value = decode(pair.slice(separator + 1));
    // Telegram field names are ASCII identifiers. '=' and line separators would
    // make the data-check-string ambiguous. Unknown identifiers remain signed.
    if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(name) || /[\r\n\0]/.test(value) || fields.has(name)) {
      return reject('access.identity_invalid');
    }
    fields.set(name, value);
  }
  return fields;
}

/** JSON.parse owns syntax validation; this bounded walk detects keys it would overwrite.
 * It also preserves the root id's number token, preventing rounding into a valid ID.
 * No parsed Telegram attributes are copied into application objects.
 */
export function parseTelegramSubject(text: string): string {
  const parsed: unknown = JSON.parse(text);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return reject('access.identity_invalid');
  let cursor = 0;
  let idToken: string | undefined;
  const whitespace = () => { while (/[\t\n\r ]/.test(text[cursor] ?? 'x')) cursor++; };
  const string = (): string => {
    const start = cursor++;
    while (cursor < text.length) {
      const char = text[cursor++];
      if (char === '\\') cursor++;
      else if (char === '"') return JSON.parse(text.slice(start, cursor)) as string;
    }
    return reject('access.identity_invalid');
  };
  function value(depth: number): void {
    if (depth > 32) return reject('access.identity_invalid');
    whitespace();
    if (text[cursor] === '"') { string(); return; }
    if (text[cursor] === '{') {
      cursor++; whitespace();
      const keys = new Set<string>();
      if (text[cursor] === '}') { cursor++; return; }
      while (cursor < text.length) {
        whitespace();
        const name = string();
        if (keys.has(name)) return reject('access.identity_invalid');
        keys.add(name);
        whitespace(); cursor++; whitespace(); // ':'; syntax already checked by JSON.parse
        const start = cursor;
        value(depth + 1);
        if (depth === 0 && name === 'id') idToken = text.slice(start, cursor);
        whitespace();
        if (text[cursor++] === '}') return;
      }
    } else if (text[cursor] === '[') {
      cursor++; whitespace();
      if (text[cursor] === ']') { cursor++; return; }
      while (cursor < text.length) {
        value(depth + 1); whitespace();
        if (text[cursor++] === ']') return;
      }
    } else {
      while (cursor < text.length && !/[\s,}\]]/.test(text[cursor])) cursor++;
      return;
    }
    return reject('access.identity_invalid');
  }
  value(0);
  const id = (parsed as Record<string, unknown>).id;
  if (!idToken || !/^[1-9][0-9]*$/.test(idToken) || typeof id !== 'number' || !Number.isSafeInteger(id)) {
    return reject('access.identity_invalid');
  }
  return String(id);
}
