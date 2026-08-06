import { useEffect, useState } from 'react';
import { pendingMutationCount } from '@expense-tracker/domain';
import type { Db } from '@expense-tracker/domain';

interface LocalStatusProps {
  db: Db;
  vaultId: string;
}

function browserIsOnline(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine;
}

export function LocalStatus({ db, vaultId }: LocalStatusProps) {
  const [online, setOnline] = useState(browserIsOnline);
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      try {
        const count = await pendingMutationCount(db, vaultId);
        if (!cancelled) setPendingCount(count);
      } catch (cause) {
        // Status should never turn a usable local vault into an error state.
        console.error('Local status refresh failed', cause);
      }
    };

    void refresh();
    const interval = window.setInterval(() => void refresh(), 2000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [db, vaultId]);

  const pendingLabel = pendingCount > 0
    ? `${pendingCount} local change${pendingCount === 1 ? '' : 's'} not synchronized`
    : 'No local changes awaiting synchronization';
  const label = online
    ? `Saved locally · ${pendingLabel} · sync not connected`
    : `Browser offline · saved locally · ${pendingLabel}`;

  return (
    <div className={`local-status${online ? '' : ' local-status--offline'}`} role="status" aria-live="polite">
      <span className="local-status__dot" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}
