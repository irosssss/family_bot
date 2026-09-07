import { randomBytes } from 'node:crypto';
import { reject } from './errors';

export type EntityId = string & { readonly __entityId: unique symbol };
export type ContentId = string & { readonly __contentId: unique symbol };
export type Revision = number & { readonly __revision: unique symbol };

export function entityId(value: unknown, pointer = ''): EntityId {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value)) {
    return reject('contract.entity_id_invalid', pointer);
  }
  return value as EntityId;
}

export function contentId(value: unknown, pointer = ''): ContentId {
  if (typeof value !== 'string' || !/^[a-z][a-z0-9_]*:[a-z][a-z0-9_]*\/[a-z][a-z0-9_]*$/.test(value)) {
    return reject('contract.content_id_invalid', pointer);
  }
  return value as ContentId;
}

export function revision(value: unknown, pointer = ''): Revision {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 2147483647) {
    return reject('contract.revision_invalid', pointer);
  }
  return value as Revision;
}

/** RFC 9562 §5.7: 48-bit milliseconds + 74 random bits. No ordering promise within a millisecond. */
export function newEntityId(): EntityId {
  const bytes = randomBytes(16);
  bytes.writeUIntBE(Date.now(), 0, 6);
  bytes[6] = (bytes[6] & 0x0f) | 0x70;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return entityId(`${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`);
}
