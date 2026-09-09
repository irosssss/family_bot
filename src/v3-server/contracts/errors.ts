/** Fixed messages only: failure objects never retain submitted data or dependency errors. */
export type V3ErrorCode =
  | 'VALIDATION' | 'FORBIDDEN' | 'STALE_ACTOR'
  | 'SELF_REVIEW_FORBIDDEN' | 'CHILD_ONLY' | 'CONFLICT';

const messages: Readonly<Record<V3ErrorCode, string>> = Object.freeze({
  VALIDATION: 'Invalid V3 input.',
  FORBIDDEN: 'This operation is not permitted.',
  STALE_ACTOR: 'The actor context is no longer current.',
  SELF_REVIEW_FORBIDDEN: 'Manual review of your own result is not permitted.',
  CHILD_ONLY: 'This operation requires a child beneficiary.',
  CONFLICT: 'The operation conflicts with the current state.',
});

export class V3Error extends Error {
  readonly code: V3ErrorCode;

  constructor(code: V3ErrorCode) {
    const safeCode = typeof code === 'string' && Object.hasOwn(messages, code) ? code : 'VALIDATION';
    super(messages[safeCode]);
    this.name = 'V3Error';
    this.code = safeCode;
  }
}

export class ValidationError extends V3Error {
  constructor() {
    super('VALIDATION');
    this.name = 'ValidationError';
  }
}

export function assertValidation(condition: unknown): asserts condition {
  if (!condition) throw new ValidationError();
}

/** Sanitize exceptions from schema callbacks, accessors and forged object traps. */
export function asValidationError<T>(operation: () => T): T {
  try {
    return operation();
  } catch {
    throw new ValidationError();
  }
}
