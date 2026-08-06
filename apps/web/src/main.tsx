import { StrictMode } from 'react';
import { configurePdfWorker } from '@expense-tracker/parsing';
import pdfWorkerUrl from 'pdfjs-dist/legacy/build/pdf.worker.mjs?url';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { App } from './App';
import './styles/tokens.css';
import './styles/global.css';

configurePdfWorker(pdfWorkerUrl);

// The service worker is an optional static-shell enhancement. It never owns
// vault data, IndexedDB, or SQLite; the app remains fully functional without it.
if ('serviceWorker' in navigator) {
  if (import.meta.env.PROD) {
    void navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch((cause: unknown) => {
      console.warn('Optional static shell is unavailable; continuing without it.', cause);
    });
  } else {
    // A production preview may have previously registered the shell on this
    // localhost origin. Remove that registration before Vite development code
    // loads, otherwise an old cached shell can mask the current source bundle.
    void navigator.serviceWorker
      .getRegistrations()
      .then((registrations) =>
        Promise.all(
          registrations
            .filter((registration) => {
              const scriptUrl = new URL(
                registration.active?.scriptURL ??
                  registration.installing?.scriptURL ??
                  registration.waiting?.scriptURL ??
                  '',
                window.location.href,
              );
              return scriptUrl.origin === window.location.origin && scriptUrl.pathname === '/sw.js';
            })
            .map((registration) => registration.unregister()),
        ),
      )
      .then(() => {
        const cacheStorage = globalThis.caches;
        if (!cacheStorage) return undefined;
        return cacheStorage
          .keys()
          .then((keys) =>
            Promise.all(
              keys
                .filter((key) => key.startsWith('expense-tracker-shell-'))
                .map((key) => cacheStorage.delete(key)),
            ),
          );
      })
      .catch((cause: unknown) => {
        console.warn('Optional development cache cleanup was unavailable.', cause);
      });
  }
}

const container = document.getElementById('root');
if (!container) {
  throw new Error('Missing #root element');
}

createRoot(container).render(
  <StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </StrictMode>,
);
