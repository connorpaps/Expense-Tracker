// @vitest-environment jsdom

import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { fireEvent } from '@testing-library/react';
import { SyncPage } from '../../src/features/sync/SyncPage';
import type { Db, SqlRow } from '@expense-tracker/domain';

const { encryptMutationPayload } = vi.hoisted(() => ({
  encryptMutationPayload: vi.fn(async () => 'encrypted-manual-resolution'),
}));
vi.mock('../../src/local', () => ({ encryptMutationPayload }));

function createSyncDb(): Db {
  const conflict: SqlRow = {
    id: 'conflict-1',
    vault_id: 'vault-sync',
    entity_type: 'transaction',
    entity_id: 'transaction-1',
    conflicting_fields: '["amount_minor","note"]',
    local_values: 'opaque-local',
    remote_values: 'opaque-remote',
    base_values: null,
    status: 'open',
    resolved_values: null,
    created_at: '2026-08-06T10:00:00.000Z',
    resolved_at: null,
  };
  let mutation: SqlRow | undefined;
  let conflictStatus = 'open';
  const db: Db = {
    async exec(sql: string, params: unknown[] = []) {
      if (sql.includes('UPDATE conflicts SET status')) {
        conflictStatus = String(params[0]);
        conflict.status = conflictStatus;
        conflict.resolved_values = String(params[1]);
        conflict.resolved_at = String(params[2]);
      }
      if (sql.includes('INSERT OR IGNORE INTO mutation_log')) {
        mutation = {
          id: String(params[0]),
          vault_id: String(params[1]),
          entity_type: String(params[2]),
          entity_id: String(params[3]),
          operation: String(params[4]),
          base_version: Number(params[5]),
          device_id: String(params[6]),
          lamport_clock: Number(params[7]),
          vector_clock: String(params[8]),
          changed_fields: String(params[9]),
          ciphertext: String(params[10]),
          origin: String(params[11]),
          status: 'pending',
          conflict_id: null,
          created_at: String(params[14]),
          applied_at: null,
          retry_count: 0,
          last_error_code: null,
        };
      }
      return { changes: 1 };
    },
    async all<T extends SqlRow = SqlRow>(sql: string): Promise<T[]> {
      if (sql.includes('FROM conflicts')) {
        return (conflictStatus === 'open' ? [conflict] : []) as T[];
      }
      return [] as T[];
    },
    async get<T extends SqlRow = SqlRow>(sql: string, params: unknown[] = []): Promise<T | undefined> {
      if (sql.includes('COUNT(*) AS n')) return { n: mutation ? 1 : 0 } as unknown as T;
      if (sql.includes('MAX(lamport_clock)')) return { lamport: 0 } as unknown as T;
      if (sql.includes('FROM conflicts')) {
        return (params[0] === 'vault-sync' && params[1] === 'conflict-1' ? conflict : undefined) as T | undefined;
      }
      if (sql.includes('FROM mutation_log')) {
        return (params[0] === 'vault-sync' && params[1] === 'resolve-conflict-conflict-1' ? mutation : undefined) as T | undefined;
      }
      return undefined;
    },
    async transaction<T>(fn: (transactionDb: Db) => Promise<T>): Promise<T> {
      return fn(db);
    },
    async close(): Promise<void> {},
  };
  return db;
}

describe('US6 web local sync boundary', () => {
  beforeEach(() => vi.clearAllMocks());

  it('lists opaque conflicts and resolves direct choices without decrypting candidates', async () => {
    const user = userEvent.setup();
    const db = createSyncDb();
    render(<MemoryRouter><SyncPage db={db} vaultId="vault-sync" /></MemoryRouter>);

    expect(await screen.findByRole('heading', { name: 'Sync and review' })).toBeInTheDocument();
    expect(screen.getByText('amount_minor, note')).toBeInTheDocument();
    expect(screen.queryByText('opaque-local')).not.toBeInTheDocument();
    expect(screen.queryByText('opaque-remote')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Record keep local decision' }));
    expect(await screen.findByText(/Keep local decision saved locally/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('0 open')).toBeInTheDocument());
    expect(encryptMutationPayload).not.toHaveBeenCalled();
  });

  it('records the remote candidate without invoking local encryption', async () => {
    const user = userEvent.setup();
    const db = createSyncDb();
    render(<MemoryRouter><SyncPage db={db} vaultId="vault-sync" /></MemoryRouter>);

    await screen.findByRole('heading', { name: 'Sync and review' });
    await user.click(screen.getByRole('button', { name: 'Record keep remote decision' }));
    expect(await screen.findByText(/Keep remote decision saved locally/)).toBeInTheDocument();
    expect(encryptMutationPayload).not.toHaveBeenCalled();
  });

  it('encrypts valid manual JSON before saving a local resolution', async () => {
    const user = userEvent.setup();
    const db = createSyncDb();
    render(<MemoryRouter><SyncPage db={db} vaultId="vault-sync" /></MemoryRouter>);

    await screen.findByRole('heading', { name: 'Sync and review' });
    await user.click(screen.getByRole('button', { name: 'Manual edit' }));
    const editor = screen.getByRole('textbox', { name: /Encrypted replacement payload/i });
    await user.clear(editor);
    fireEvent.change(editor, { target: { value: '{"amount_minor":1234,"note":"corrected locally"}' } });
    await user.click(screen.getByRole('button', { name: 'Save manual edit decision' }));

    expect(await screen.findByText(/Manual edit decision saved locally/)).toBeInTheDocument();
    expect(encryptMutationPayload).toHaveBeenCalledWith({ amount_minor: 1234, note: 'corrected locally' }, 'vault-sync:conflict:conflict-1');
  });

  it('encrypts a valid keep-both payload before saving a local resolution', async () => {
    const user = userEvent.setup();
    const db = createSyncDb();
    render(<MemoryRouter><SyncPage db={db} vaultId="vault-sync" /></MemoryRouter>);

    await screen.findByRole('heading', { name: 'Sync and review' });
    await user.click(screen.getByRole('button', { name: 'Keep both' }));
    const editor = screen.getByRole('textbox', { name: /Encrypted merged payload/i });
    fireEvent.change(editor, { target: { value: '{"local":{"amount_minor":1234,"note":"local"},"remote":{"amount_minor":1250,"note":"remote"}}' } });
    await user.click(screen.getByRole('button', { name: 'Save keep both decision' }));

    expect(await screen.findByText(/Keep both decision saved locally/)).toBeInTheDocument();
    expect(encryptMutationPayload).toHaveBeenCalledWith({ local: { amount_minor: 1234, note: 'local' }, remote: { amount_minor: 1250, note: 'remote' } }, 'vault-sync:conflict:conflict-1');
  });

  it('rejects invalid manual JSON without encrypting or mutating the conflict', async () => {
    const user = userEvent.setup();
    const db = createSyncDb();
    render(<MemoryRouter><SyncPage db={db} vaultId="vault-sync" /></MemoryRouter>);

    await screen.findByRole('heading', { name: 'Sync and review' });
    await user.click(screen.getByRole('button', { name: 'Keep both' }));
    const editor = screen.getByRole('textbox', { name: /Encrypted merged payload/i });
    await user.clear(editor);
    fireEvent.change(editor, { target: { value: '{not-json' } });
    await user.click(screen.getByRole('button', { name: 'Save keep both decision' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('must be valid JSON');
    expect(encryptMutationPayload).not.toHaveBeenCalled();
    expect(screen.getByText('1 open')).toBeInTheDocument();
  });

  it('rejects unknown-field conflicts before encryption', async () => {
    const db = createSyncDb();
    const exec = vi.spyOn(db, 'exec');
    const originalAll = db.all;
    db.all = async <T extends SqlRow = SqlRow>(sql: string) => {
      const rows = await originalAll<T>(sql);
      if (sql.includes('FROM conflicts')) return [{ ...rows[0], conflicting_fields: '["*"]' }] as unknown as T[];
      return rows;
    };
    render(<MemoryRouter><SyncPage db={db} vaultId="vault-sync" /></MemoryRouter>);

    await screen.findByRole('heading', { name: 'Sync and review' });
    expect(screen.getByRole('button', { name: 'Manual edit' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Keep both' })).toBeDisabled();
    expect(screen.getByText(/Manual and merged payloads are unavailable/)).toBeInTheDocument();
    expect(encryptMutationPayload).not.toHaveBeenCalled();
    expect(exec).not.toHaveBeenCalled();
    expect(screen.getByText('1 open')).toBeInTheDocument();
  });

  it('rejects malformed merged fields before encryption', async () => {
    const user = userEvent.setup();
    const db = createSyncDb();
    render(<MemoryRouter><SyncPage db={db} vaultId="vault-sync" /></MemoryRouter>);

    await screen.findByRole('heading', { name: 'Sync and review' });
    await user.click(screen.getByRole('button', { name: 'Keep both' }));
    const editor = screen.getByRole('textbox', { name: /Encrypted merged payload/i });
    fireEvent.change(editor, { target: { value: '{"local":{"amount_minor":"wrong","note":"local"},"remote":{"amount_minor":1250,"note":"remote"}}' } });
    await user.click(screen.getByRole('button', { name: 'Save keep both decision' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('amount_minor must be a non-zero integer');
    expect(encryptMutationPayload).not.toHaveBeenCalled();
    expect(screen.getByText('1 open')).toBeInTheDocument();
  });
});
