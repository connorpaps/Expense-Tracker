// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import axe from 'axe-core';
import { ReviewTable } from '../../src/features/imports/components/ReviewTable';
import type { ImportPreviewDto } from '@expense-tracker/contracts';

const preview: ImportPreviewDto = {
  session: { import_id: 'i1', vault_id: 'v1', file_name: 'x.csv', file_type: 'csv', file_size_bytes: 1, source_fingerprint: 'x', bank_profile: null, parser_version: 'x', status: 'review', total_rows: 1, recognized_rows: 1, warning_count: 0, error_count: 0, created_at: 'x' },
  rows: [{ id: 'r1', import_id: 'i1', source_row_number: 1, parsed_date: '2026-08-05', parsed_merchant: 'Corner Cafe', parsed_amount_minor: -1250, parsed_currency: 'USD', suggested_category_id: 'other', category_source: 'default_rule', category_confidence: 'medium', row_status: 'valid', diagnostics: [], duplicate_candidate_ids: [], user_decision: 'accept', explanation: { source: 'default_rule', confidence: 'medium', matchedRuleId: null, matchedPattern: 'cafe', detail: 'Matched the default pattern “cafe”.' } }],
  commit_counts: { accepted: 1, excluded: 0, unresolved: 0, duplicate_candidates: 0, errors: 0 },
};

describe('US4 categorization accessibility', () => {
  it('names category correction and remember controls and passes serious axe checks', async () => {
    const { container } = render(<main><ReviewTable preview={preview} categories={[{ id: 'food', name: 'Food and Dining' }, { id: 'other', name: 'Other' }]} decisions={new Map()} corrections={new Map()} attentionOnly={false} onToggleAttention={() => {}} onDecision={() => {}} onCategoryCorrection={() => {}} /></main>);
    expect(screen.getByRole('combobox', { name: 'Category for Corner Cafe' })).toBeInTheDocument();
    const results = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } });
    expect(results.violations.filter((violation) => ['serious', 'critical'].includes(violation.impact ?? '')).map((violation) => violation.id)).toEqual([]);
  });
});
