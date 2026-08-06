/**
 * Live browser audit (US1 import/review MVP) via headless Chrome CDP.
 *
 * Drives the real app at the running dev server with a fresh profile and
 * asserts: vault bootstrap, page navigation, Settings privacy controls, CSV
 * import (exclude + commit), duplicate re-import (attention filter + decisions),
 * PDF import + commit, empty-file error state, and malformed-file diagnostics.
 * Captures every
 * console error/exception/network failure. Exits non-zero on assertion failure.
 *
 * Usage:  node scripts/audit-browser.mjs [port]
 * Needs:  the dev server running (npm run dev:web), Node >= 22 (global WebSocket).
 */
import { spawn } from 'node:child_process';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const DEBUG_PORT = 9444;
const APP_PORT = Number(process.argv[2] ?? 5173);
const APP_URL = `http://localhost:${APP_PORT}/#/import`;
const ROOT = resolve(import.meta.dirname ?? '.', '..');

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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const userDataDir = mkdtempSync(join(tmpdir(), 'audit-chrome-'));
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

async function getPageWsUrl() {
  for (let i = 0; i < 60; i += 1) {
    try {
      const res = await fetch(`http://localhost:${DEBUG_PORT}/json/list`);
      const targets = await res.json();
      const page = targets.find((t) => t.type === 'page');
      if (page) return page.webSocketDebuggerUrl;
    } catch {
      /* booting */
    }
    await sleep(250);
  }
  throw new Error('No CDP page target');
}

const ws = new WebSocket(await getPageWsUrl());
let id = 0;
const pending = new Map();
const consoleIssues = [];
const results = [];
let failures = 0;

function send(method, params = {}) {
  return new Promise((resolve2, reject) => {
    const msgId = ++id;
    pending.set(msgId, { resolve: resolve2, reject });
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
  if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
    const args = msg.params.args.map((a) => a.value ?? a.description ?? a.type).join(' ');
    consoleIssues.push(`[console.error] ${args}`);
  } else if (msg.method === 'Runtime.exceptionThrown') {
    const d = msg.params.exceptionDetails;
    consoleIssues.push(`[exception] ${d.text}: ${d.exception?.description ?? d.exception?.value ?? ''}`);
  } else if (msg.method === 'Network.responseReceived' && msg.params.response.status >= 400) {
    const url = msg.params.response.url;
    if (!url.includes('favicon.ico')) consoleIssues.push(`[network.${msg.params.response.status}] ${url}`);
  }
};

async function evalValue(expression) {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(`evaluate failed: ${r.exceptionDetails.text}`);
  return r.result.value;
}

async function waitFor(expression, label, timeoutMs = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const value = await evalValue(expression);
    if (value) return value;
    await sleep(250);
  }
  throw new Error(`timeout waiting for: ${label}`);
}

function record(scenario, ok, details) {
  results.push({ scenario, ok, details });
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${scenario}${details ? ` — ${JSON.stringify(details)}` : ''}`);
}

function injectFile(base64, name, type) {
  return evalValue(`(async () => {
    const bytes = Uint8Array.from(atob('${base64}'), (c) => c.charCodeAt(0));
    const file = new File([bytes], '${name}', { type: '${type}' });
    const input = document.getElementById('import-file-input');
    if (!input) return { injected: false };
    const dt = new DataTransfer();
    dt.items.add(file);
    input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return { injected: true, size: file.size };
  })()`);
}

async function clickButton(text) {
  return evalValue(`(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(
      (b) => b.textContent.trim() === '${text}' && !b.disabled,
    );
    if (!btn) return { clicked: false };
    btn.click();
    return { clicked: true };
  })()`);
}

const readB64 = (p) => readFileSync(join(ROOT, p)).toString('base64');
const AMEX = readB64('packages/fixtures/statements/csv/amex.csv');
const MALFORMED = readB64('packages/fixtures/statements/csv/malformed.csv');
const EMPTY = readB64('packages/fixtures/statements/csv/empty.csv');
const PDF = readB64('TD_Bank_Realistic_Mock.pdf');

ws.onopen = async () => {
  try {
    await send('Runtime.enable');
    await send('Network.enable');
    await waitFor(`!!document.getElementById('import-file-input')`, 'import page input');

    // --- 1. Vault bootstrap ---
    const vault = await waitFor(`window.__vaultStore ? window.__vaultStore.vaultId : null`, 'vault store');
    const probe = await evalValue(`(async () => {
      const s = window.__vaultStore;
      const cats = await s.db.all('SELECT COUNT(*) AS n FROM categories');
      const v = await s.db.all('SELECT COUNT(*) AS n FROM vaults');
      return { categories: cats[0].n, vaults: v[0].n };
    })()`);
    record('vault bootstrap', vault && probe.vaults === 1 && probe.categories === 11,
      { vaultId: vault, ...probe });

    // --- 2. Navigation (all four pages render without errors) ---
    const pages = { Overview: 'Overview', Transactions: 'Transactions', Import: 'Review import', Settings: 'Privacy and settings' };
    for (const [label, heading] of Object.entries(pages)) {
      await evalValue(`(() => {
        const link = Array.from(document.querySelectorAll('.app-nav__link')).find((l) => l.textContent.trim() === '${label}');
        if (link) link.click();
      })()`);
      const h2 = await waitFor(
        `document.querySelector('h1')?.textContent === '${heading}' ? '${heading}' : null`,
        `heading for ${label}`,
      );
      record(`navigate to ${label}`, h2 === heading, { heading: h2 });
    }

    const privacyControls = await evalValue(`(() => ({
      exportButton: !!Array.from(document.querySelectorAll('button')).find((b) => b.textContent.trim() === 'Export encrypted backup'),
      inspectButton: !!Array.from(document.querySelectorAll('button')).find((b) => b.textContent.trim() === 'Inspect backup'),
      clearButton: !!Array.from(document.querySelectorAll('button')).find((b) => b.textContent.trim() === 'Delete all local data'),
      backupHeading: document.querySelector('#backup-heading')?.textContent ?? '',
      dangerHeading: document.querySelector('#danger-zone-heading')?.textContent ?? '',
    }))()`);
    record('Settings: privacy controls present', privacyControls.exportButton && privacyControls.inspectButton && privacyControls.clearButton && privacyControls.backupHeading === 'Export or restore this vault' && privacyControls.dangerHeading === 'Clear this browser', privacyControls);

    // --- 3. CSV import: review, exclude a row, commit ---
    await evalValue(`(() => { const link = Array.from(document.querySelectorAll('.app-nav__link')).find((l) => l.textContent.trim() === 'Import'); if (link) link.click(); })()`);
    await waitFor(`!!document.getElementById('import-file-input')`, 'import input back');
    const csv1 = await injectFile(AMEX, 'amex.csv', 'text/csv');
    const rows1 = await waitFor(`document.querySelectorAll('.review__table tbody tr').length`, 'amex review rows');
    const tableText = await evalValue(`document.querySelector('.review__table')?.innerText ?? ''`);
    record('CSV import: review table', csv1.injected && rows1 === 5, { rows: rows1, hasStarbucks: tableText.includes('Starbucks'), hasUber: tableText.includes('Uber') });
    record('CSV import: category suggestion', tableText.includes('Food and Dining') && tableText.includes('Transportation'), { sample: tableText.slice(0, 120) });

    const excludeClick = await evalValue(`(() => {
      const row = document.querySelector('.review__table tbody tr');
      const btn = Array.from(row.querySelectorAll('button')).find((b) => b.textContent.trim() === 'Exclude');
      if (!btn) return { clicked: false };
      btn.click();
      return { clicked: true };
    })()`);
    await sleep(300);
    const counts1 = await evalValue(`document.querySelector('.commit-bar__counts')?.innerText ?? ''`);
    record('CSV import: exclude decision', excludeClick.clicked && counts1.includes('Exclude 1') && counts1.includes('Accept 4'), { counts: counts1 });

    const commitClick1 = await clickButton('Commit import');
    await waitFor(`!!document.querySelector('.commit-bar--success')`, 'amex commit success');
    const saved1 = await evalValue(`document.querySelector('.commit-bar--success')?.textContent ?? ''`);
    record('CSV import: commit', commitClick1.clicked && saved1.includes('4 transactions'), { saved: saved1 });
    await clickButton('Import another statement');
    await waitFor(`!!document.getElementById('import-file-input')`, 'reset after commit');

    // --- 4. Duplicate re-import: flagged pending, commit blocked, attention filter ---
    await injectFile(AMEX, 'amex.csv', 'text/csv');
    const rows2 = await waitFor(`document.querySelectorAll('.review__table tbody tr').length`, 'duplicate review rows');
    const statuses2 = await evalValue(`Array.from(document.querySelectorAll('.review__table tbody tr [role="status"]')).map((s) => s.textContent.trim())`);
    const commitBlocked = await evalValue(`(() => {
      const btn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent.trim() === 'Commit import');
      return btn ? btn.disabled : null;
    })()`);
    // The 4 committed rows are duplicates; the excluded Starbucks row is not in
    // the vault, so it must remain a normal (Ready) row.
    const dupCount = statuses2.filter((s) => s.includes('duplicate')).length;
    const readyCount = statuses2.filter((s) => s.includes('Ready')).length;
    record('duplicate re-import: exactly committed rows flagged', rows2 === 5 && dupCount === 4 && readyCount === 1, { statuses: statuses2 });
    record('duplicate re-import: commit blocked', commitBlocked === true, { commitDisabled: commitBlocked });

    await evalValue(`(() => {
      const chip = Array.from(document.querySelectorAll('button.chip')).find((b) => b.textContent.includes('Needs attention'));
      if (chip) chip.click();
    })()`);
    await sleep(300);
    const visible2 = await evalValue(`document.querySelectorAll('.review__table tbody tr').length`);
    record('duplicate re-import: attention filter', visible2 === 4, { visibleRows: visible2 });

    // Toggle the filter back off, then exclude ALL rows and commit → nothing
    // should be added (full exclusion semantics).
    await evalValue(`(() => {
      const chip = Array.from(document.querySelectorAll('button.chip')).find((b) => b.textContent.includes('Needs attention'));
      if (chip) chip.click();
    })()`);
    await sleep(300);
    await evalValue(`(() => {
      document.querySelectorAll('.review__table tbody tr').forEach((row) => {
        const btn = Array.from(row.querySelectorAll('button')).find((b) => b.textContent.trim() === 'Exclude');
        if (btn) btn.click();
      });
    })()`);
    await sleep(400);
    const counts2 = await evalValue(`document.querySelector('.commit-bar__counts')?.innerText ?? ''`);
    record('duplicate re-import: exclude-all decisions', counts2.includes('Accept 0') && counts2.includes('Exclude 5'), { counts: counts2 });
    const commitClick2 = await clickButton('Commit import');
    await waitFor(`!!document.querySelector('.commit-bar--success')`, 'duplicate commit success');
    const saved2 = await evalValue(`document.querySelector('.commit-bar--success')?.textContent ?? ''`);
    record('duplicate re-import: exclude-all commit adds nothing', commitClick2.clicked && saved2.includes('0 transactions'), { saved: saved2 });
    await clickButton('Import another statement');
    await waitFor(`!!document.getElementById('import-file-input')`, 'reset after dup commit');

    // --- 5. PDF import: 19 rows + commit ---
    await injectFile(PDF, 'TD_Bank_Realistic_Mock.pdf', 'application/pdf');
    const pdfRows = await waitFor(`document.querySelectorAll('.review__table tbody tr').length`, 'pdf review rows', 45000).catch(async (error) => {
      // Diagnostics: dump whatever stage the UI is in.
      const state = await evalValue(`(() => {
        const errorPanel = document.querySelector('.panel--error');
        const progress = document.querySelector('.panel--progress');
        const committed = document.querySelector('.commit-bar--success');
        return {
          errorPanel: errorPanel ? errorPanel.innerText : null,
          progressPanel: progress ? progress.innerText : null,
          committed: committed ? committed.innerText : null,
          dropzone: !!document.getElementById('import-file-input'),
          bodySnippet: document.body.innerText.slice(0, 400),
        };
      })()`);
      console.log('PDF DIAGNOSTIC DUMP:', JSON.stringify(state, null, 2));
      throw error;
    });
    const pdfCategoryState = await evalValue(`Array.from(document.querySelectorAll('.review__table tbody tr')).map((row) => ({
      merchant: row.querySelector('.review__merchant')?.textContent.trim() ?? '',
      value: row.querySelector('select')?.value ?? '',
      selected: row.querySelector('select option:checked')?.textContent.trim() ?? '',
      explanation: row.querySelector('.review__provenance')?.textContent.trim() ?? '',
    }))`);
    const pdfUncategorized = pdfCategoryState.filter((row) => !row.value || row.selected === 'Choose a category');
    const pdfOldFallbackText = pdfCategoryState.filter((row) => row.explanation.includes('No active rule recognized'));
    record('PDF import: review table', pdfRows === 19, { rows: pdfRows });
    record('PDF import: automatic categories selected', pdfCategoryState.length === 19 && pdfUncategorized.length === 0 && pdfOldFallbackText.length === 0, {
      uncategorized: pdfUncategorized,
      oldFallbackCount: pdfOldFallbackText.length,
      sample: pdfCategoryState.slice(0, 5),
    });
    const commitClick3 = await clickButton('Commit import');
    await waitFor(`!!document.querySelector('.commit-bar--success')`, 'pdf commit success');
    const saved3 = await evalValue(`document.querySelector('.commit-bar--success')?.textContent ?? ''`);
    record('PDF import: commit', commitClick3.clicked && saved3.includes('19 transactions'), { saved: saved3 });
    await clickButton('Import another statement');
    await waitFor(`!!document.getElementById('import-file-input')`, 'reset after pdf commit');

    // --- 6. Empty file error state ---
    await injectFile(EMPTY, 'empty.csv', 'text/csv');
    await waitFor(`!!document.querySelector('.panel--error')`, 'empty-file error card');
    const errEmpty = await evalValue(`document.querySelector('.panel--error .panel__title')?.textContent ?? ''`);
    record('empty file: error card', errEmpty.includes('does not contain any recognizable transactions'), { message: errEmpty });
    await clickButton('Try another file');
    await waitFor(`!!document.getElementById('import-file-input')`, 'reset after error');

    // --- 7. Malformed file: diagnostics + blocked commit ---
    await injectFile(MALFORMED, 'malformed.csv', 'text/csv');
    const rows4 = await waitFor(`document.querySelectorAll('.review__table tbody tr').length`, 'malformed review rows');
    const diagText = await evalValue(`document.querySelector('.review__table')?.innerText ?? ''`);
    const commitBlocked2 = await evalValue(`(() => {
      const btn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent.trim() === 'Commit import');
      return btn ? btn.disabled : null;
    })()`);
    record('malformed file: rows with diagnostics', rows4 >= 5 && diagText.includes('could not be read'), { rows: rows4 });
    record('malformed file: commit blocked', commitBlocked2 === true, { commitDisabled: commitBlocked2 });

    // --- 8. Final DB state + console issues ---
    const finalDb = await evalValue(`(async () => {
      const s = window.__vaultStore;
      const t = await s.db.all('SELECT COUNT(*) AS n FROM transactions');
      const i = await s.db.all('SELECT COUNT(*) AS n FROM statement_imports');
      const r = await s.db.all('SELECT COUNT(*) AS n FROM import_rows');
      return { transactions: t[0].n, statementImports: i[0].n, importRows: r[0].n };
    })()`);
    record('final DB state', finalDb.transactions === 23 && finalDb.statementImports === 3 && finalDb.importRows > 0, finalDb);

    record('console clean (no unexpected errors)', consoleIssues.length === 0, { issues: consoleIssues });

    console.log('\n===== AUDIT SUMMARY =====');
    console.log(`Scenarios: ${results.length}, Failed: ${failures}`);
    if (consoleIssues.length > 0) {
      console.log('Console issues captured:');
      for (const i of consoleIssues) console.log(`  ${i}`);
    }
  } catch (error) {
    failures += 1;
    console.error('AUDIT ERROR:', error.message);
    console.error('Console issues so far:', consoleIssues);
  } finally {
    ws.close();
    chrome.kill();
    await sleep(1200);
    try {
      rmSync(userDataDir, { recursive: true, force: true });
    } catch {
      /* lock held; harmless */
    }
    process.exit(failures > 0 ? 1 : 0);
  }
};

ws.onerror = (e) => {
  console.error('WS error', e.message ?? e);
  chrome.kill();
  process.exit(1);
};

setTimeout(() => {
  console.error('AUDIT TIMEOUT after 180s');
  chrome.kill();
  try {
    rmSync(userDataDir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
  process.exit(1);
}, 180_000);
