import { argon2, createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { reject } from '../contracts/errors';

export const pinKdfId = 'argon2id_v19_19m_t2_p1';
export const pinKdfParameters = Object.freeze({ memory: 19456, passes: 2, parallelism: 1, tagLength: 32 });
let running = 0;

export function parsePin(input: unknown): string {
  if (typeof input !== 'string' || !/^[0-9]{6}$/.test(input)) reject('adult.pin_invalid');
  return input;
}
export function secretDigest(purpose: string, value: string): string {
  return createHash('sha256').update(`${purpose}:${value}`).digest('hex');
}
export function equalDigest(a: string, b: string): boolean {
  return /^[a-f0-9]{64}$/.test(a) && /^[a-f0-9]{64}$/.test(b)
    && timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
}
export function isBearer(input: unknown): input is string {
  return typeof input === 'string' && /^[A-Za-z0-9_-]{43}$/.test(input)
    && Buffer.from(input, 'base64url').toString('base64url') === input;
}
export function newBearer(entropy: (size: number) => Uint8Array = randomBytes): string {
  const bytes = entropy(32);
  if (!(bytes instanceof Uint8Array) || bytes.byteLength !== 32) reject('adult.entropy_unavailable');
  return Buffer.from(bytes).toString('base64url');
}
export function withSecret<T extends object, K extends string>(result: T, name: K, secret: string): Readonly<T & Record<K, string>> {
  Object.defineProperty(result, name, { value: secret, enumerable: false });
  return Object.freeze(result) as Readonly<T & Record<K, string>>;
}

/** Fixed registered profile; no PHC parameters from clients or unbounded work queue. */
export function createPinKdf(pepperInput: Uint8Array) {
  if (typeof argon2 !== 'function') reject('adult.node_argon2_required');
  if (!(pepperInput instanceof Uint8Array) || pepperInput.byteLength !== 32) reject('adult.pepper_required');
  const pepper = Buffer.from(pepperInput);
  const derive = promisify(argon2);
  return Object.freeze({
    async derive(pinInput: unknown, saltHex: string): Promise<string> {
      const pin = parsePin(pinInput);
      if (!/^[a-f0-9]{32}$/.test(saltHex)) reject('adult.verifier_invalid');
      if (running >= 2) reject('adult.busy');
      running++;
      const message = Buffer.from(pin, 'ascii');
      try {
        const result = await derive('argon2id', { ...pinKdfParameters, message, nonce: Buffer.from(saltHex, 'hex'), secret: pepper });
        return result.toString('hex');
      } finally { message.fill(0); running--; }
    },
  });
}

// RFC 4648 Base32 alphabet. Twenty random bytes yield exactly 32 characters, without padding.
const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function newRecoveryCode(entropy: (size: number) => Uint8Array = randomBytes): string {
  const bytes = entropy(20);
  if (!(bytes instanceof Uint8Array) || bytes.byteLength !== 20) reject('adult.entropy_unavailable');
  let bits = 0, buffer = 0, text = '';
  for (const byte of bytes) {
    buffer = (buffer << 8) | byte; bits += 8;
    while (bits >= 5) { bits -= 5; text += alphabet[(buffer >>> bits) & 31]; }
  }
  const checksum = alphabet[createHash('sha256').update(`recovery_checksum_v1:${text}`).digest()[0] & 31];
  return text.match(/.{4}/g)!.join('-') + '-' + checksum;
}
export function recoveryVerifier(input: unknown): string {
  if (typeof input !== 'string' || !/^(?:[A-Z2-7]{4}-){8}[A-Z2-7]$/.test(input)) reject('adult.recovery_invalid');
  const plain = input.replaceAll('-', ''), body = plain.slice(0, 32);
  const checksum = alphabet[createHash('sha256').update(`recovery_checksum_v1:${body}`).digest()[0] & 31];
  if (plain[32] !== checksum) reject('adult.recovery_invalid');
  return secretDigest('adult_recovery_v1', plain);
}
