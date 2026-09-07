export class ContractError extends Error {
  constructor(readonly key: string, readonly pointer = '') {
    super(key);
    this.name = 'ContractError';
  }
}

export function reject(key: string, pointer = ''): never {
  throw new ContractError(key, pointer);
}

/** Closed JSON object boundary. Never interpolate the rejected value in errors. */
export function closedObject(input: unknown, keys: readonly string[], pointer = ''): Record<string, unknown> {
  if (input === null || typeof input !== 'object' || Array.isArray(input)
    || (Object.getPrototypeOf(input) !== Object.prototype && Object.getPrototypeOf(input) !== null)) {
    return reject('contract.object_required', pointer);
  }
  const record = input as Record<string, unknown>;
  if (Reflect.ownKeys(record).length !== keys.length
    || keys.some(key => !Object.hasOwn(record, key))) return reject('contract.fields_invalid', pointer);
  if (Object.values(Object.getOwnPropertyDescriptors(record)).some(value => !('value' in value))) {
    return reject('contract.fields_invalid', pointer);
  }
  return record;
}
