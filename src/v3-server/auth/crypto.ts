import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { ValidationError } from '../contracts/errors.js';
const scrypt = promisify(scryptCallback);
export const token = () => randomBytes(32).toString('hex');
export const digest = (value: string) => createHash('sha256').update(value).digest('hex');
export function parseToken(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) throw new ValidationError();
  return value;
}
export function parsePin(value: unknown): string {
  if (typeof value !== 'string' || !/^[0-9]{6,12}$/.test(value)) throw new ValidationError();
  return value;
}
export async function hashPin(pin: string): Promise<string> {
  parsePin(pin);
  const salt = randomBytes(16).toString('hex');
  const derived = await scrypt(pin, salt, 32) as Buffer;
  return salt + ':' + derived.toString('hex');
}
export async function verifyPin(pin: string, encoded: string): Promise<boolean> {
  parsePin(pin);
  if (!/^[a-f0-9]{32}:[a-f0-9]{64}$/.test(encoded)) return false;
  const [salt, stored] = encoded.split(':');
  return timingSafeEqual(await scrypt(pin, salt, 32) as Buffer, Buffer.from(stored, 'hex'));
}
