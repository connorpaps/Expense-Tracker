/**
 * UI state contract shared across clients. State meaning, vault boundaries, and
 * destructive-action confirmation MUST remain consistent between web and iOS
 * even though each platform renders the states natively.
 */

export type UiState =
  | 'idle'
  | 'working'
  | 'saved_local'
  | 'synced'
  | 'empty'
  | 'warning'
  | 'error'
  | 'disconnected'
  | 'pairing'
  | 'conflict';

export interface SyncStatusDto {
  state: 'idle' | 'synced' | 'disconnected' | 'working' | 'conflict';
  pending_count: number;
  oldest_pending_at: string | null;
  last_exchange_at: string | null;
  last_error_code: string | null;
}

export interface OperationStatusDto {
  state: UiState;
  message?: string;
  progress?: { current: number; total: number };
}

export const OPERATION_LABELS: Record<UiState, string> = {
  idle: 'Ready',
  working: 'Working…',
  saved_local: 'Saved on this device',
  synced: 'Synced',
  empty: 'Nothing here yet',
  warning: 'Needs attention',
  error: 'Something went wrong',
  disconnected: 'Waiting to sync',
  pairing: 'Pairing',
  conflict: 'Conflict needs review',
};
