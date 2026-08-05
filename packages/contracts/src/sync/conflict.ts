/**
 * Conflict contract. A conflict occurs when causally concurrent mutations
 * change the same financial field or cannot otherwise be safely merged.
 */

import type { EntityType } from './mutation';

export type ConflictResolution = 'keep_local' | 'keep_remote' | 'manual_edit' | 'keep_both';

export type ConflictStatus = 'open' | 'resolved_local' | 'resolved_remote' | 'resolved_manual';

export interface ConflictRecordDto {
  conflict_id: string;
  vault_id: string;
  entity_type: EntityType;
  entity_id: string;
  conflicting_fields: string[];
  /** Encrypted-or-local reference to the local candidate values. */
  local_candidate: string;
  /** Encrypted-or-local reference to the remote candidate values. */
  remote_candidate: string;
  /** Encrypted-or-local reference to the last common known values. */
  base_candidate: string | null;
  status: ConflictStatus;
  created_at: string;
  resolved_at: string | null;
}

export interface ResolveConflictRequest {
  conflict_id: string;
  vault_id: string;
  resolution: ConflictResolution;
  /** Required when resolution is 'manual_edit'. */
  manual_values?: Record<string, string | number | null>;
}
