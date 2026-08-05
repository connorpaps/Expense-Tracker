import type { WeekStart } from './enums';

export interface LocalVault {
  id: string;
  vault_owner_label: string | null;
  default_currency: string;
  locale: string;
  week_start: WeekStart;
  demo_mode: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface PairedDevice {
  id: string;
  vault_id: string;
  display_name: string;
  public_key: string;
  capabilities: Array<'read' | 'write' | 'import' | 'export'>;
  wrapped_vault_key: string;
  key_version: number;
  paired_at: string;
  last_seen_at: string | null;
  status: 'pending' | 'active' | 'revoked';
  revoked_at: string | null;
}
