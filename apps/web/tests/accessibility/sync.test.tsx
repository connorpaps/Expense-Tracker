// @vitest-environment jsdom

import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SyncPage } from '../../src/features/sync/SyncPage';
import { seriousAccessibilityViolations } from '../harness';
import type { Db, SqlRow } from '@expense-tracker/domain';

function fakeDb(): Db {
  const conflict: SqlRow = {
    id: 'conflict-a11y',
    vault_id: 'vault-a11y',
    entity_type: 'transaction',
    entity_id: 'tx-a11y',
    conflicting_fields: '["amount_minor"]',
    local_values: 'opaque-local',
    remote_values: 'opaque-remote',
    base_values: null,
    status: 'open',
    resolved_values: null,
    created_at: '2026-08-06T10:00:00.000Z',
    resolved_at: null,
  };
  return {
    exec: async () => ({ changes: 0 }),
    all: async <T extends SqlRow = SqlRow>(sql: string) => sql.includes('FROM conflicts') ? [conflict] as T[] : [] as T[],
    get: async <T extends SqlRow = SqlRow>(sql: string) => sql.includes('COUNT(*) AS n') ? ({ n: 0 } as unknown as T) : undefined,
    transaction: async <T,>(fn: (db: Db) => Promise<T>) => fn(fakeDb()),
    close: async () => {},
  };
}

describe('US6 sync review accessibility', () => {
  it('exposes labeled conflict controls and has no serious axe violations', async () => {
    const view = render(<MemoryRouter><SyncPage db={fakeDb()} vaultId="vault-a11y" /></MemoryRouter>);
    expect(await screen.findByRole('heading', { name: 'Sync and review' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Resolution choices for tx-a11y' })).toBeInTheDocument();
    expect(await seriousAccessibilityViolations(view.container)).toEqual([]);
  });
});
