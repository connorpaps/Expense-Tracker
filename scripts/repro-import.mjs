/**
 * Diagnostic: reproduce the PDF upload flow in real headless Chrome via CDP.
 * Uses Node 22's built-in WebSocket. Inject the TD PDF through a DataTransfer
 * File on the real file input, then dump console + UI state.
 */
import { spawn } from 'node:child_process';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const DEBUG_PORT = 9333;
const APP_URL = 'http://localhost:5173/#/import';
const PDF_PATH = join(process.cwd(), 'TD_Bank_Realistic_Mock.pdf');

function findChrome() {
  const candidates = [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  ];
  for (const c of candidates) {
    try {
      readFileSync(c);
      return c;
    } catch {
      /* keep looking */
    }
  }
  throw new Error('Chrome not found');
}

const userDataDir = mkdtempSync(join(tmpdir(), 'repro-chrome-'));
const chrome = spawn(findChrome(), [
  '--headless=new',
  `--remote-debugging-port=${DEBUG_PORT}`,
  `--user-data-dir=${userDataDir}`,
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-gpu',
  '--window-size=1280,900',
  APP_URL,
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getPageWsUrl() {
  for (let i = 0; i < 60; i += 1) {
    try {
      const res = await fetch(`http://localhost:${DEBUG_PORT}/json/list`);
      const targets = await res.json();
      const page = targets.find((t) => t.type === 'page');
      if (page) return page.webSocketDebuggerUrl;
    } catch {
      /* chrome still booting */
    }
    await sleep(250);
  }
  throw new Error('No CDP page target');
}

const pdfBase64 = readFileSync(PDF_PATH).toString('base64');
console.log(`PDF bytes: ${Buffer.from(pdfBase64, 'base64').length}`);

const ws = new WebSocket(await getPageWsUrl());
let id = 0;
const pending = new Map();
const consoleMessages = [];

function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const msgId = ++id;
    pending.set(msgId, { resolve, reject });
    ws.send(JSON.stringify({ id: msgId, method, params }));
  });
}

ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  if (msg.id) {
    const p = pending.get(msg.id);
    if (!p) return;
    pending.delete(msg.id);
    if (msg.error) p.reject(new Error(`${msg.error.message} (${msg.error.code})`));
    else p.resolve(msg.result);
    return;
  }
  if (msg.method === 'Runtime.consoleAPICalled') {
    const args = msg.params.args.map((a) => a.value ?? a.description ?? a.type).join(' ');
    consoleMessages.push(`[console.${msg.params.type}] ${args}`);
  } else if (msg.method === 'Runtime.exceptionThrown') {
    const d = msg.params.exceptionDetails;
    consoleMessages.push(`[exception] ${d.text}: ${d.exception?.description ?? d.exception?.value ?? ''}`);
  } else if (msg.method === 'Log.entryAdded') {
    consoleMessages.push(`[log.${msg.params.entry.level}] ${msg.params.entry.text}`);
  } else if (msg.method === 'Network.loadingFailed') {
    consoleMessages.push(`[network.failed] ${msg.params.errorText} (type=${msg.params.type}) url=${msg.params.requestId}`);
  } else if (msg.method === 'Network.responseReceived' && msg.params.response.status >= 400) {
    consoleMessages.push(
      `[network.${msg.params.response.status}] ${msg.params.response.url}`,
    );
  }
};

ws.onopen = async () => {
  try {
    await send('Runtime.enable');
    await send('Log.enable');
    await send('Page.enable');
    await send('Network.enable');

    // Wait for the import dropzone input.
    for (let i = 0; i < 60; i += 1) {
      const r = await send('Runtime.evaluate', {
        expression: `!!document.getElementById('import-file-input')`,
        returnByValue: true,
      });
      if (r.result.value) break;
      await sleep(250);
    }

    // Wait for vault store.
    let vaultId = null;
    for (let i = 0; i < 60; i += 1) {
      const r = await send('Runtime.evaluate', {
        expression: `window.__vaultStore ? window.__vaultStore.vaultId : null`,
        returnByValue: true,
      });
      vaultId = r.result.value;
      if (vaultId) break;
      await sleep(250);
    }
    console.log(`Vault ready: ${vaultId ? 'yes (' + vaultId + ')' : 'NO'}`);

    // Probe the live DB handle directly: if the StrictMode cleanup closed the
    // shared wa-sqlite handle, these queries will throw.
    const dbProbe = await send('Runtime.evaluate', {
      expression: `(async () => {
        const store = window.__vaultStore;
        if (!store) return { skipped: true };
        const out = {};
        try { const rows = await store.db.all('SELECT COUNT(*) AS n FROM categories'); out.categories = rows[0] && rows[0].n; } catch (e) { out.categoriesError = String(e && e.message ? e.message : e); }
        try { const rows = await store.db.all('SELECT COUNT(*) AS n FROM transactions'); out.transactions = rows[0] && rows[0].n; } catch (e) { out.transactionsError = String(e && e.message ? e.message : e); }
        try { const rows = await store.db.all('SELECT COUNT(*) AS n FROM vaults'); out.vaults = rows[0] && rows[0].n; } catch (e) { out.vaultsError = String(e && e.message ? e.message : e); }
        return out;
      })()`,
      awaitPromise: true,
      returnByValue: true,
    });
    console.log(`DB PROBE: ${JSON.stringify(dbProbe.result.value)}`);

    // Inject the real TD PDF through the real input element.
    const inject = await send('Runtime.evaluate', {
      expression: `(async () => {
        const bytes = Uint8Array.from(atob('${pdfBase64}'), (c) => c.charCodeAt(0));
        const file = new File([bytes], 'TD_Bank_Realistic_Mock.pdf', { type: 'application/pdf' });
        const input = document.getElementById('import-file-input');
        const dt = new DataTransfer();
        dt.items.add(file);
        input.files = dt.files;
        input.dispatchEvent(new Event('change', { bubbles: true }));
        return { injected: true, size: file.size };
      })()`,
      awaitPromise: true,
      returnByValue: true,
    });
    console.log(`Injection: ${JSON.stringify(inject.result.value)}`);

    // Give the pipeline time to parse + query + render.
    await sleep(9000);

    const state = await send('Runtime.evaluate', {
      expression: `(() => {
        const errorPanel = document.querySelector('.panel--error');
        const reviewTable = document.querySelector('.review-table, table');
        const progress = document.querySelector('.panel--progress');
        const bodyText = document.body.innerText.slice(0, 600);
        return {
          hasErrorPanel: !!errorPanel,
          errorTitle: errorPanel?.querySelector('.panel__title')?.textContent ?? null,
          errorHint: errorPanel?.querySelector('.panel__hint')?.textContent ?? null,
          hasReviewTable: !!reviewTable,
          reviewRows: reviewTable ? reviewTable.querySelectorAll('tbody tr').length : 0,
          hasProgress: !!progress,
          bodyText,
        };
      })()`,
      returnByValue: true,
    });
    console.log('UI STATE:');
    console.log(JSON.stringify(state.result.value, null, 2));

    // If the review table appeared, drive the commit button end-to-end.
    if (state.result.value.hasReviewTable) {
      const clicked = await send('Runtime.evaluate', {
        expression: `(() => {
          const btn = Array.from(document.querySelectorAll('button')).find(
            (b) => b.textContent.trim() === 'Commit import' && !b.disabled,
          );
          if (!btn) return { clicked: false, reason: 'no enabled commit button' };
          btn.click();
          return { clicked: true };
        })()`,
        returnByValue: true,
      });
      console.log(`COMMIT CLICK: ${JSON.stringify(clicked.result.value)}`);
      await sleep(6000);
      const committed = await send('Runtime.evaluate', {
        expression: `(() => {
          const saved = document.querySelector('.commit-bar--success');
          const errorPanel = document.querySelector('.panel--error');
          return {
            commitSaved: saved ? saved.textContent : null,
            errorAfterCommit: errorPanel ? errorPanel.textContent : null,
          };
        })()`,
        returnByValue: true,
      });
      console.log('AFTER COMMIT:');
      console.log(JSON.stringify(committed.result.value, null, 2));
      // Verify the transactions actually landed in SQLite.
      const verify = await send('Runtime.evaluate', {
        expression: `(async () => {
          const store = window.__vaultStore;
          const rows = await store.db.all('SELECT COUNT(*) AS n FROM transactions');
          return { transactionsInDb: rows[0] && rows[0].n };
        })()`,
        awaitPromise: true,
        returnByValue: true,
      });
      console.log(`DB VERIFY: ${JSON.stringify(verify.result.value)}`);

      if (committed.result.value.commitSaved === null) {
        console.error('ASSERTION FAILED: commit did not report saved');
        process.exitCode = 1;
      } else if (verify.result.value.transactionsInDb !== 19) {
        console.error(`ASSERTION FAILED: expected 19 transactions in DB, got ${verify.result.value.transactionsInDb}`);
        process.exitCode = 1;
      }
    }

    if (!state.result.value.hasReviewTable) {
      console.error('ASSERTION FAILED: no review table after upload');
      process.exitCode = 1;
    }

    console.log('CONSOLE MESSAGES:');
    for (const m of consoleMessages) console.log(m);
    if (consoleMessages.length === 0) console.log('(none captured)');
  } catch (error) {
    console.error('REPRO FAILED:', error);
  } finally {
    ws.close();
    chrome.kill();
    await sleep(1500);
    try {
      rmSync(userDataDir, { recursive: true, force: true });
    } catch {
      /* chrome may still hold a lock; the temp dir is harmless */
    }
    process.exit(0);
  }
};

ws.onerror = (e) => {
  console.error('WS error', e.message ?? e);
  chrome.kill();
  rmSync(userDataDir, { recursive: true, force: true });
  process.exit(1);
};

setTimeout(() => {
  console.error('TIMEOUT');
  chrome.kill();
  try {
    rmSync(userDataDir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
  process.exit(1);
}, 90_000);
