import { useEffect, useState } from 'react';
import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import type { Db } from '@expense-tracker/domain';
import { DashboardPage } from './features/dashboard/DashboardPage';
import { TransactionsPage } from './features/transactions/TransactionsPage';
import { ImportPage } from './features/imports/ImportPage';
import { SettingsPage } from './features/settings/SettingsPage';
import { SyncPage } from './features/sync/SyncPage';
import { LocalStatus } from './components/LocalStatus';
import { openVaultStore, refreshVaultStore } from './local';
import type { LocalVault } from '@expense-tracker/domain';

const NAV_ITEMS = [
  { to: '/', label: 'Overview', end: true },
  { to: '/transactions', label: 'Transactions' },
  { to: '/import', label: 'Import' },
  { to: '/settings', label: 'Settings' },
  { to: '/sync', label: 'Sync & review' },
];

export interface VaultSession {
  db: Db;
  vault: LocalVault;
  vaults: LocalVault[];
  vaultId: string;
  defaultCurrency: string;
}

export function App() {
  const [session, setSession] = useState<VaultSession | null>(null);
  const [ready, setReady] = useState(false);
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);
  const [switchError, setSwitchError] = useState<string | null>(null);

  const changeVault = async (vaultId: string) => {
    if (!session) return;
    try {
      const next = await refreshVaultStore(session.db, vaultId);
      setSession(next);
      setSwitchError(null);
      (window as unknown as { __vaultStore?: VaultSession }).__vaultStore = next;
    } catch (error) {
      console.error('Vault switch failed', error);
      setSwitchError('The selected vault could not be opened. Your current vault is still active.');
    }
  };

  useEffect(() => {
    let cancelled = false;
    void openVaultStore()
      .then((store) => {
        if (!cancelled) {
          setSession(store);
          // Kept as a read-only diagnostic bridge for the existing CDP audit
          // scripts. Feature code receives the session through React props.
          (window as unknown as { __vaultStore?: VaultSession }).__vaultStore = store;
        }
      })
      .catch((error) => {
        console.error('Vault bootstrap failed', error);
        if (!cancelled) {
          setBootstrapError('Your local vault could not be opened. Check browser storage permissions, then reload the app.');
        }
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!ready) {
    return (
      <div className="app-loading" role="status">
        Opening your local vault…
      </div>
    );
  }

  if (bootstrapError || !session) {
    return (
      <main className="app-loading app-loading--error">
        <section className="panel panel--error" role="alert" aria-labelledby="vault-error-heading">
          <p className="panel__eyebrow">LOCAL VAULT</p>
          <h1 id="vault-error-heading">Storage is unavailable</h1>
          <p>{bootstrapError ?? 'The local vault did not return a usable session.'}</p>
          <button type="button" className="button button--primary" onClick={() => window.location.reload()}>
            Reload app
          </button>
        </section>
      </main>
    );
  }

  return (
    <div className="app-shell">
      <nav className="app-nav" aria-label="Primary">
        <div className="app-nav__brand">
          <span className="app-nav__mark" aria-hidden="true">
            ◆
          </span>
          Expense Tracker
        </div>
        <div className="vault-switcher">
          <label htmlFor="active-vault">Active vault</label>
          <select id="active-vault" value={session.vaultId} onChange={(event) => void changeVault(event.target.value)}>
            {session.vaults.map((vault) => <option key={vault.id} value={vault.id}>{vault.vault_owner_label ?? 'Unnamed vault'}{vault.demo_mode ? ' · DEMO' : ''}</option>)}
          </select>
          {session.vault.demo_mode && <span className="demo-badge">DEMO · sample data</span>}
          {switchError && <span className="vault-switcher__error" role="alert">{switchError}</span>}
        </div>
        <LocalStatus db={session.db} vaultId={session.vaultId} />
        <ul className="app-nav__links">
          {NAV_ITEMS.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                end={item.end}
                className={({ isActive }) => `app-nav__link${isActive ? ' app-nav__link--active' : ''}`}
              >
                {item.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <main className="app-content">
        <Routes>
          <Route path="/" element={<DashboardPage db={session.db} vaultId={session.vaultId} defaultCurrency={session.defaultCurrency} />} />
          <Route path="/transactions" element={<TransactionsPage db={session.db} vaultId={session.vaultId} defaultCurrency={session.defaultCurrency} />} />
          <Route path="/import" element={<ImportPage db={session.db} vaultId={session.vaultId} defaultCurrency={session.defaultCurrency} />} />
          <Route path="/settings" element={<SettingsPage db={session.db} vaultId={session.vaultId} onVaultChange={(next) => { setSession(next); (window as unknown as { __vaultStore?: VaultSession }).__vaultStore = next; }} />} />
          <Route path="/sync" element={<SyncPage db={session.db} vaultId={session.vaultId} />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
