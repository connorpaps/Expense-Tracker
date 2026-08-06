// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SettingsPage } from '../src/features/settings/SettingsPage';
import type { Db } from '@expense-tracker/domain';

function fakeDb(): Db {
  return {
    exec: async () => ({ changes: 0 }),
    all: async <T,>() => [] as T[],
    get: async <T,>() => undefined as T | undefined,
    transaction: async <T,>(fn: (db: Db) => Promise<T>) => fn(fakeDb()),
    close: async () => {},
  };
}

describe('US7 Settings vault controls', () => {
  it('exposes labeled vault creation and privacy controls', async () => {
    render(<SettingsPage db={fakeDb()} vaultId="vault-1" onVaultChange={vi.fn()} />);
    expect(await screen.findByRole('heading', { name: 'Privacy and settings' })).toBeInTheDocument();
    expect(screen.getByLabelText('New vault name')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create private vault' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create demo vault' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Export encrypted backup' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Inspect backup' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete all local data' })).toBeInTheDocument();
  });
});
