import { ContentInputError } from './json';

// Process-local provenance: JSON supplied by a package cannot manufacture a compiler result.
const results = new WeakSet<object>();
export const registerCompilerResult = (value: object): void => { results.add(value); };
export function assertCompilerResult(value: object): void {
  if (!results.has(value)) throw new ContentInputError('UNTRUSTED_COMPILER_RESULT', '');
}
