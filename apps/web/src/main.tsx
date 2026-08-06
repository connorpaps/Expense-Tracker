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
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  void navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch((cause: unknown) => {
    console.warn('Optional static shell is unavailable; continuing without it.', cause);
  });
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
