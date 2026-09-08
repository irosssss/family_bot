import Ajv2020 from 'ajv/dist/2020.js';
import { canonicalJson } from './canonical';

export function createContentSchemaValidator() {
  const ajv = new Ajv2020({ strict: true, allErrors: false, ownProperties: true,
    coerceTypes: false, removeAdditional: false, useDefaults: false });
  // Ajv's fast-deep-equal assumes callable valueOf/toString on objects. Our parser
  // deliberately creates null-prototype records; JSON keys must never invoke methods.
  // Preserve standard JSON Schema uniqueItems semantics using a safe JSON-value comparison.
  ajv.removeKeyword('uniqueItems');
  ajv.addKeyword({ keyword: 'uniqueItems', type: 'array', schemaType: 'boolean',
    validate: (enabled: boolean, values: unknown[]) => {
      if (!enabled) return true;
      const seen = new Set<string>();
      for (const value of values) {
        let key: string;
        try { key = canonicalJson(value); } catch { return false; }
        if (seen.has(key)) return false;
        seen.add(key);
      }
      return true;
    } });
  return ajv;
}
