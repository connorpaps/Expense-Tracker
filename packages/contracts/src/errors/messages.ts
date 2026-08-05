import type { ErrorCode } from './error-codes';

/**
 * Safe, plain-language user-facing messages. These strings are the contract
 * vocabulary shared with iOS; both clients must render the same meaning even
 * when the copy differs per platform.
 */
export const SAFE_MESSAGES: Record<ErrorCode, string> = {
  VAULT_INVALID: 'This vault file is not valid and was not opened.',
  VAULT_VERSION_UNSUPPORTED: 'This vault was created by a newer version and cannot be opened here yet.',
  VAULT_DECRYPT_FAILED: 'The vault could not be unlocked. Check the recovery key and try again.',
  VAULT_EXPORT_FAILED: 'The vault export could not be created. Your data is unchanged.',
  PAIRING_EXPIRED: 'The pairing code expired. Start pairing again on both devices.',
  PAIRING_REJECTED: 'Pairing was declined on the other device.',
  PAIRING_REVOKED: 'This device is no longer paired with this vault.',
  PAIRING_KEY_MISMATCH: 'The security keys do not match. Restart pairing.',
  SYNC_DISCONNECTED: 'Not connected to the PC. Changes are saved locally.',
  SYNC_RETRYABLE: 'The connection was interrupted. This will be retried.',
  SYNC_MUTATION_INVALID: 'A change could not be applied because it is malformed.',
  SYNC_CONFLICT: 'This record was changed on two devices at the same time and needs review.',
  SYNC_BACKLOG_PENDING: 'Changes made while away are waiting to synchronize.',
  SYNC_BATCH_DUPLICATE_SAFE: 'A change that was already applied was ignored. Nothing was duplicated.',
  VALIDATION_FAILED: 'Some details are missing or invalid.',
  CURRENCY_REQUIRED: 'Choose a currency for this record.',
  AMOUNT_INVALID: 'Enter a valid amount.',
  DATE_INVALID: 'Enter a valid date.',
  IMPORT_UNSUPPORTED_TYPE: 'Only CSV or PDF files can be imported.',
  IMPORT_TOO_LARGE: 'This file is larger than the supported import limit.',
  IMPORT_EMPTY: 'This file does not contain any recognizable transactions.',
  IMPORT_PARSE_FAILED: 'This file could not be parsed. Check the file and try again.',
  IMPORT_PDF_ENCRYPTED: 'This PDF is password-protected. Export it without a password and try again.',
  IMPORT_PDF_IMAGE_ONLY: 'This PDF contains no readable text. Export a text-based statement or import a CSV instead.',
  IMPORT_PDF_UNSUPPORTED_LAYOUT: 'This PDF has readable text, but its transaction layout is not supported yet. Export the bank statement as CSV or share a text-based sample for support.',
  IMPORT_ROW_AMBIGUOUS: 'This row could not be read reliably and needs review.',
  IMPORT_DUPLICATE_CANDIDATE: 'This looks like a duplicate of an existing transaction.',
  IMPORT_COMMIT_INCOMPLETE: 'Some rows still need a decision before this import can be saved.',
  DELETE_CONFIRMATION_REQUIRED: 'Please confirm the deletion.',
  CLEAR_LOCAL_DATA_CONFIRMATION_REQUIRED: 'Please confirm that all local data on this device will be removed.',
};
