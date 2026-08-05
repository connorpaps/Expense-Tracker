import type { ErrorCode } from './error-codes';

/**
 * A normalized product error. `message` is always safe to show to a user;
 * `entityReference` / `fieldReference` / `rowReference` let UI attach the error
 * to the exact row or field that produced it.
 */
export interface AppError {
  code: ErrorCode;
  message: string;
  entityReference: string | null;
  fieldReference: string | null;
  rowReference: number | null;
  retryable: boolean;
  cause?: unknown;
}

export function appError(
  code: ErrorCode,
  message: string,
  options: Partial<Pick<AppError, 'entityReference' | 'fieldReference' | 'rowReference' | 'retryable' | 'cause'>> = {},
): AppError {
  return {
    code,
    message,
    entityReference: options.entityReference ?? null,
    fieldReference: options.fieldReference ?? null,
    rowReference: options.rowReference ?? null,
    retryable: options.retryable ?? false,
    cause: options.cause,
  };
}

export function isAppError(value: unknown): value is AppError {
  return (
    typeof value === 'object' &&
    value !== null &&
    'code' in value &&
    'message' in value &&
    typeof (value as AppError).code === 'string'
  );
}

/** Serializable JSON form of an AppError (matches the contract's error shape). */
export function errorToJson(error: AppError): {
  error: {
    code: ErrorCode;
    message: string;
    entity_reference: string | null;
    retryable: boolean;
  };
} {
  return {
    error: {
      code: error.code,
      message: error.message,
      entity_reference: error.entityReference,
      retryable: error.retryable,
    },
  };
}
