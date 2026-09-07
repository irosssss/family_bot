import { closedObject, reject } from './errors';
import { revision } from './ids';

export interface PayloadContract {
  readonly contract_id: string;
  readonly schema_version: number;
  readonly parse: (value: unknown, pointer: string) => unknown;
}

/** No built-in game handlers. Caller supplies an explicit, closed registry. */
export function createPayloadParser(contracts: readonly PayloadContract[]) {
  const registry = new Map<string, PayloadContract['parse']>();
  const keyFor = (id: unknown, version: unknown, pointer: string) => {
    if (typeof id !== 'string' || !/^[a-z][a-z0-9_]*$/.test(id)) return reject('contract.payload_id_invalid', pointer);
    return `${id}:${revision(version, `${pointer}/schema_version`)}`;
  };
  for (const contract of contracts) {
    const key = keyFor(contract.contract_id, contract.schema_version, '');
    if (registry.has(key) || typeof contract.parse !== 'function') reject('contract.registry_invalid');
    registry.set(key, contract.parse);
  }
  return (input: unknown, pointer = '') => {
    const envelope = closedObject(input, ['contract_id', 'schema_version', 'value'], pointer);
    const key = keyFor(envelope.contract_id, envelope.schema_version, pointer);
    const parser = registry.get(key);
    if (!parser) return reject('contract.payload_unsupported', pointer);
    return Object.freeze({ contract_id: envelope.contract_id as string,
      schema_version: revision(envelope.schema_version), value: parser(envelope.value, `${pointer}/value`) });
  };
}
