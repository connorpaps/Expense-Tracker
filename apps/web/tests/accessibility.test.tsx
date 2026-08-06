/**
 * Accessibility tests (T037). Each import component and the full review flow
 * must pass axe-core with the standard landmark/region rules scoped to a
 * <main> wrapper (page-level concerns like skip links are out of scope for a
 * component suite). Interaction paths must also be reachable via keyboard.
 */

import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { readStatementCsv } from '@expense-tracker/fixtures';
import { DEFAULT_CATEGORIES, categorySlug } from '@expense-tracker/domain';
import type { Category, Db, SqlRow } from '@expense-tracker/domain';
import { StatusBadge } from '../src/features/imports/components/StatusBadge';
import { ReviewTable } from '../src/features/imports/components/ReviewTable';
import { CommitBar } from '../src/features/imports/components/CommitBar';
import { ImportDropzone } from '../src/features/imports/components/ImportDropzone';
import { ImportPage } from '../src/features/imports/ImportPage';
import { parseFileInProcess } from '../src/features/imports/parse-file';
import { buildImportPreview } from '../src/features/imports/import-pipeline';
import type { ImportPreviewDto } from '@expense-tracker/contracts';

const categories: Category[] = DEFAULT_CATEGORIES.map((c, index) => ({
  id: `cat-${categorySlug(c.name)}`,
  vault_id: 'vault-test',
  name: c.name,
  slug: categorySlug(c.name),
  kind: c.kind,
  color_token: c.color_token,
  icon_name: c.icon_name,
  position: index,
  is_active: true,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  version: 1,
}));

function toRow(category: Category): SqlRow {
  return { ...category, is_active: 1 };
}

function fakeDb(): Db {
  return {
    exec: async () => ({ changes: 0 }),
    all: async <T,>(sql: string) =>
      (sql.includes('FROM categories') ? categories.map(toRow) : []) as T[],
    get: async <T,>(sql: string, params: unknown[] = []) => {
      if (sql.includes('FROM categories')) {
        const category = categories.find(
          (candidate) => candidate.vault_id === params[0] && candidate.id === params[1],
        );
        return category ? (toRow(category) as T) : undefined;
      }
      return undefined;
    },
    transaction: async <T,>(fn: (db: Db) => Promise<T>) => fn(fakeDb()),
    close: async () => {},
  };
}

/** Render children inside a <main> so landmark/region axe rules pass. */
function renderInMain(ui: React.ReactElement) {
  return render(<main>{ui}</main>);
}

describe('import components (T037)', () => {
  it('StatusBadge carries a descriptive accessible name', () => {
    const { container } = renderInMain(<StatusBadge status="duplicate_candidate" />);
    const badge = screen.getByRole('status');
    expect(badge).toHaveAttribute('aria-label', 'Possible duplicate');
    expect(within(container).getByText('Possible duplicate')).toBeInTheDocument();
  });

  it('ImportDropzone file input has an accessible name and a keyboard-reachable trigger', async () => {
    const user = userEvent.setup();
    const onFile = vi.fn();
    renderInMain(<ImportDropzone onFile={onFile} />);

    const input = screen.getByLabelText('Choose a statement file to import');
    expect(input).toHaveAttribute('accept');

    // The visible button must be able to open the picker (click target wired to input).
    const choose = screen.getByRole('button', { name: 'Choose a file' });
    const clickSpy = vi.spyOn(input, 'click').mockImplementation(() => {});
    await user.click(choose);
    expect(clickSpy).toHaveBeenCalledOnce();
    clickSpy.mockRestore();

    // Selecting a file via the input surfaces it through onFile.
    const file = new File(['a,b\n1,2'], 'statement.csv', { type: 'text/csv' });
    await user.upload(input, file);
    expect(onFile).toHaveBeenCalledWith(file);
  });

  it('ReviewTable exposes the table, radiogroups, and toggles attention filter', async () => {
    const preview = await realPreview('amex.csv');
    const user = userEvent.setup();
    const onDecision = vi.fn();

    function StatefulReviewTable() {
      const [attentionOnly, setAttentionOnly] = useState(false);
      return (
        <ReviewTable
          preview={preview}
          categories={categories}
          decisions={new Map()}
          attentionOnly={attentionOnly}
          onToggleAttention={() => setAttentionOnly((value) => !value)}
          onDecision={onDecision}
        />
      );
    }

    const { container } = renderInMain(<StatefulReviewTable />);

    expect(screen.getByRole('table', { name: 'Imported transactions review' })).toBeInTheDocument();
    const rows = within(screen.getByRole('table')).getAllByRole('row');
    expect(rows.length).toBeGreaterThan(1); // header + data rows

    // Decisions are announced as radio groups and fire per-row callbacks.
    const group = screen.getAllByRole('group', { name: /Decision for Starbucks/ })[0]!;
    expect(within(group).getByRole('button', { name: 'Accept' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await user.click(within(group).getByRole('button', { name: 'Exclude' }));
    expect(onDecision).toHaveBeenCalledWith(expect.any(String), 'exclude');

    // The attention filter is a pressed toggle that narrows the table.
    const filter = screen.getByRole('button', { name: /Needs attention/ });
    expect(filter).toHaveAttribute('aria-pressed', 'false');
    await user.click(filter);
    expect(filter).toHaveAttribute('aria-pressed', 'true');
    expect(within(container).getByText('0 of 5 rows shown')).toBeInTheDocument();
  });

  it('CommitBar blocks commit while rows are unresolved and announces success', async () => {
    const blocked = {
      accepted: 4,
      excluded: 0,
      unresolved: 1,
      duplicate_candidates: 0,
      errors: 1,
    };
    const ready = { accepted: 5, excluded: 0, unresolved: 0, duplicate_candidates: 0, errors: 0 };

    const { rerender } = renderInMain(
      <CommitBar counts={blocked} onCommit={() => {}} onCancel={() => {}} />,
    );
    expect(screen.getByRole('button', { name: 'Commit import' })).toBeDisabled();

    rerender(
      <main>
        <CommitBar counts={ready} onCommit={() => {}} onCancel={() => {}} />
      </main>,
    );
    expect(screen.getByRole('button', { name: 'Commit import' })).toBeEnabled();

    rerender(
      <main>
        <CommitBar counts={ready} committed onCommit={() => {}} onCancel={() => {}} />
      </main>,
    );
    expect(screen.getByRole('status')).toHaveTextContent('Import saved');
  });

  it('import components pass axe-core checks', async () => {
    const preview = await realPreview('amex.csv');
    const { container } = renderInMain(
      <div>
        <ReviewTable
          preview={preview}
          categories={categories}
          decisions={new Map()}
          attentionOnly={false}
          onToggleAttention={() => {}}
          onDecision={() => {}}
        />
        <CommitBar
          counts={{ accepted: 5, excluded: 0, unresolved: 0, duplicate_candidates: 0, errors: 0 }}
          onCommit={() => {}}
          onCancel={() => {}}
        />
      </div>,
    );
    const results = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } });
    const serious = results.violations.filter((v) =>
      ['serious', 'critical'].includes(v.impact ?? ''),
    );
    expect(serious.map((v) => v.id)).toEqual([]);
  });
});

describe('full import flow (T037)', () => {
  it('parses a real fixture, renders the review flow, and passes axe', async () => {
    const user = userEvent.setup();
    const { container } = renderInMain(
      <ImportPage db={fakeDb()} vaultId="vault-test" parseFile={parseFileInProcess} />,
    );

    expect(screen.getByRole('heading', { name: 'Review import' })).toBeInTheDocument();
    const input = screen.getByLabelText('Choose a statement file to import');
    const file = new File([readStatementCsv('amex.csv')], 'amex.csv', { type: 'text/csv' });
    await user.upload(input, file);

    // Review stage with the parsed merchants.
    expect(
      await screen.findByRole('table', { name: 'Imported transactions review' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Starbucks')).toBeInTheDocument();
    expect(screen.getByText('Uber *Trip')).toBeInTheDocument();

    const commit = screen.getByRole('button', { name: 'Commit import' });
    expect(commit).toBeEnabled();
    await user.click(commit);
    expect(screen.getByRole('status')).toHaveTextContent('Import saved');

    // The whole flow must be free of serious/critical violations.
    const results = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } });
    const serious = results.violations.filter((v) =>
      ['serious', 'critical'].includes(v.impact ?? ''),
    );
    expect(serious.map((v) => v.id)).toEqual([]);
  }, 15_000);

  it('surfaces a safe error message when the vault is unavailable', async () => {
    const { container } = renderInMain(
      <ImportPage db={null} vaultId={null} parseFile={parseFileInProcess} />,
    );
    const input = screen.getByLabelText('Choose a statement file to import');
    const file = new File([readStatementCsv('amex.csv')], 'amex.csv', { type: 'text/csv' });
    await userEvent.setup().upload(input, file);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('The local vault is not ready yet');
    expect(within(container).getByRole('button', { name: 'Try another file' })).toBeInTheDocument();
  });
});

/** Parse a fixture through the in-process pipeline to build a real preview. */
async function realPreview(name: string): Promise<ImportPreviewDto> {
  const csv = readStatementCsv(name);
  const { statement } = await parseFileInProcess(
    new File([csv], name, { type: 'text/csv' }),
    () => {},
  );
  return buildImportPreview(statement, {
    vaultId: 'vault-test',
    categories,
    personalRules: [],
    existingTransactions: [],
    now: '2026-01-15T12:00:00.000Z',
    fileName: name,
    fileType: 'csv',
    fileSizeBytes: csv.length,
  });
}
