import type { EntityType, MutationOperation, MutationOrigin, MutationStatus } from '@expense-tracker/contracts';
import type { MutationClock } from '@expense-tracker/contracts';

export interface MutationLogEntry {
  id: string;
  vault_id: string;
  entity_type: EntityType;
  entity_id: string;
  operation: MutationOperation;
  base_version: number;
  device_id: string;
  clock: MutationClock;
  ciphertext: string;
  origin: MutationOrigin;
  status: MutationStatus;
  conflict_id: string | null;
  created_at: string;
  applied_at: string | null;
  retry_count: number;
  last_error_code: string | null;
}

export interface DemoDataset {
  id: string;
  vault_id: string;
  name: string;
  seed_version: string;
  created_at: string;
}
