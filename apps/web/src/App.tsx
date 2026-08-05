import { useEffect, useState } from 'react';
import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import type { Db } from '@expense-tracker/domain';
import { DashboardPage } from './features/dashboard/DashboardPage';
import { TransactionsPage } from './features/transactions/TransactionsPage';
import { ImportPage } from './features/imports/ImportPage';
import { SettingsPage } from './features/settings/SettingsPage';
import { openVaultStore } from './local';

const NAV_ITEMS = [
  { to: '/', label: 'Overview', end: true },
  { to: '/transactions', label: 'Transactions' },
  { to: '/import', label: 'Import' },
  { to: '/settings', label: 'Settings' },
];

export function App() {
  const [vault] = useState<{ db: Db; vaultId: string } | null>(null);
  const [ready, setReady] = useState(false);
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void openVaultStore()
      .then((store) => {
        if (cancelled) {
          // openVaultStore() returns a module-level singleton promise, so in
          // development StrictMode runs this effect twice against the SAME
          // store. Closing the handle here would invalidate the live DB that
          // the second pass publishes and the app then uses (every later query
          // fails with SQLITE_MISUSE). The store is intentionally owned by the
          // app session, not by this effect.
          return;
        }
        (window as unknown as { __vaultStore?: { db: Db; vaultId: string } }).__vaultStore = store;
      })
      .catch((error) => {
        console.error('Vault bootstrap failed', error);
        setBootstrapError('Your local vault could not be opened. Check browser storage permissions, then reload the app.');
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

  if (bootstrapError) {
    return (
      <main className="app-loading app-loading--error">
        <section className="panel panel--error" role="alert" aria-labelledby="vault-error-heading">
          <p className="panel__eyebrow">LOCAL VAULT</p>
          <h1 id="vault-error-heading">Storage is unavailable</h1>
          <p>{bootstrapError}</p>
          <button type="button" className="button button--primary" onClick={() => window.location.reload()}>
            Reload app
          </button>
        </section>
      </main>
    );
  }

  const store = (window as unknown as { __vaultStore?: { db: Db; vaultId: string } }).__vaultStore ?? null;
  const db = store?.db ?? vault?.db ?? null;
  const vaultId = store?.vaultId ?? vault?.vaultId ?? null;

  return (
    <div className="app-shell">
      <nav className="app-nav" aria-label="Primary">
        <div className="app-nav__brand">
          <span className="app-nav__mark" aria-hidden="true">
            ◆
          </span>
          Expense Tracker
        </div>
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
          <Route path="/" element={<DashboardPage />} />
          <Route path="/transactions" element={<TransactionsPage />} />
          <Route path="/import" element={<ImportPage db={db} vaultId={vaultId} />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
