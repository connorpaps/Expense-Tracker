import { normalizeMerchant } from './normalize';
import type { CategoryCorrectionHistory } from '../entities/categorization';
import type { CategorizationRule } from '../entities/rules';
import type { Db, SqlRow } from '../storage/schema';
import { insertRule, updateRule } from '../storage/repository';
import { randomUuid } from '../entities/ids';

export interface RecordCorrectionInput {
  vaultId: string;
  transactionId?: string | null;
  importId?: string | null;
  merchant: string;
  previousCategoryId?: string | null;
  nextCategoryId: string;
  source?: 'user' | 'personal_rule';
  now: string;
}

export function normalizeRuleMatcher(value: string): string {
  return normalizeMerchant(value);
}

export async function recordCategoryCorrection(db: Db, input: RecordCorrectionInput): Promise<CategoryCorrectionHistory> {
  const merchantNormalized = normalizeRuleMatcher(input.merchant);
  if (!merchantNormalized) throw new Error('A merchant is required for correction history.');
  const correction: CategoryCorrectionHistory = {
    id: randomUuid(),
    vault_id: input.vaultId,
    transaction_id: input.transactionId ?? null,
    import_id: input.importId ?? null,
    merchant_normalized: merchantNormalized,
    previous_category_id: input.previousCategoryId ?? null,
    next_category_id: input.nextCategoryId,
    source: input.source ?? 'user',
    created_at: input.now,
  };
  await db.exec(
    `INSERT INTO category_correction_history (id, vault_id, transaction_id, import_id, merchant_normalized, previous_category_id, next_category_id, source, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [correction.id, correction.vault_id, correction.transaction_id, correction.import_id, correction.merchant_normalized, correction.previous_category_id, correction.next_category_id, correction.source, correction.created_at],
  );
  return correction;
}

/**
 * Explicitly remember a correction for future imports. Evidence is increased
 * rather than creating duplicate rules, making the learning signal auditable.
 */
export async function rememberMerchantRule(
  db: Db,
  input: { vaultId: string; merchant: string; categoryId: string; now: string; id?: string },
): Promise<CategorizationRule> {
  const matcher = normalizeRuleMatcher(input.merchant);
  if (!matcher) throw new Error('A merchant pattern is required.');
  const existing = await db.get<SqlRow>(
    `SELECT * FROM categorization_rules WHERE vault_id = ? AND rule_type = 'personal_merchant' AND matcher = ? AND category_id = ? LIMIT 1`,
    [input.vaultId, matcher, input.categoryId],
  );
  if (existing) {
    const current = mapRule(existing);
    await updateRule(db, input.vaultId, current.id, {
      evidence_count: current.evidence_count + 1,
      confidence: Math.min(1, Math.max(current.confidence, 0.9) + 0.02),
      is_active: true,
      updated_at: input.now,
    });
    return {
      ...current,
      evidence_count: current.evidence_count + 1,
      confidence: Math.min(1, Math.max(current.confidence, 0.9) + 0.02),
      is_active: true,
      updated_at: input.now,
      version: current.version + 1,
    };
  }
  const rule: CategorizationRule = {
    id: input.id ?? randomUuid(),
    vault_id: input.vaultId,
    category_id: input.categoryId,
    rule_type: 'personal_merchant',
    matcher,
    priority: 10,
    confidence: 0.9,
    evidence_count: 1,
    is_active: true,
    created_from: 'user_correction',
    created_at: input.now,
    updated_at: input.now,
    version: 1,
  };
  await insertRule(db, rule);
  return rule;
}

export async function listCorrectionHistory(db: Db, vaultId: string, limit = 100): Promise<CategoryCorrectionHistory[]> {
  const rows = await db.all<SqlRow>(
    'SELECT * FROM category_correction_history WHERE vault_id = ? ORDER BY created_at DESC LIMIT ?',
    [vaultId, limit],
  );
  return rows.map((row) => ({
    id: row.id as string,
    vault_id: row.vault_id as string,
    transaction_id: (row.transaction_id as string | null) ?? null,
    import_id: (row.import_id as string | null) ?? null,
    merchant_normalized: row.merchant_normalized as string,
    previous_category_id: (row.previous_category_id as string | null) ?? null,
    next_category_id: row.next_category_id as string,
    source: row.source as CategoryCorrectionHistory['source'],
    created_at: row.created_at as string,
  }));
}

function mapRule(row: SqlRow): CategorizationRule {
  return {
    id: row.id as string,
    vault_id: row.vault_id as string,
    category_id: row.category_id as string,
    rule_type: row.rule_type as CategorizationRule['rule_type'],
    matcher: row.matcher as string,
    priority: row.priority as number,
    confidence: row.confidence as number,
    evidence_count: row.evidence_count as number,
    is_active: row.is_active === 1,
    created_from: row.created_from as CategorizationRule['created_from'],
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
    version: row.version as number,
  };
}
