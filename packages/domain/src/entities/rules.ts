import type { RuleCreatedFrom, RuleType } from './enums';

export interface CategorizationRule {
  id: string;
  vault_id: string;
  category_id: string;
  rule_type: RuleType;
  matcher: string;
  priority: number;
  confidence: number;
  evidence_count: number;
  is_active: boolean;
  created_from: RuleCreatedFrom;
  created_at: string;
  updated_at: string;
  version: number;
}

export interface ConflictRecord {
  id: string;
  vault_id: string;
  entity_type: string;
  entity_id: string;
  conflicting_fields: string[];
  local_values: string;
  remote_values: string;
  base_values: string | null;
  status: 'open' | 'resolved_local' | 'resolved_remote' | 'resolved_manual' | 'resolved_both';
  resolved_values: string | null;
  created_at: string;
  resolved_at: string | null;
}
