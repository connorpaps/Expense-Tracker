/**
 * US5 browser audit: verify persistence across separate Chrome processes using
 * the same profile, not merely a Page.reload in one process.
 * Usage: node scripts/audit-restart.mjs [port]
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const PORT = Number(process.argv[2] ?? 5173);
const APP_URL = `http://localhost:${PORT}/#/import`;
const PROFILE = mkdtempSync(join(tmpdir(), 'restart-chrome-'));
const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
let debugPort = 9777;

function findChrome() {
  const candidates = [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  ];
  for (const candidate of candidates) {
    try { readFileSync(candidate); return candidate; } catch { /* next */ }
  }
  throw new Error('Chrome not found');
}

async function launch() {
  const process = spawn(findChrome(), [
    '--headless=new', `--remote-debugging-port=${debugPort}`, `--user-data-dir=${PROFILE}`,
    '--no-first-run', '--no-default-browser-check', '--disable-gpu', APP_URL,
  ], { stdio: 'ignore' });
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const targets = await (await fetch(`http://localhost:${debugPort}/json/list`)).json();
      const page = targets.find((target) => target.type === 'page');
      if (page) return { process, pageUrl: page.webSocketDebuggerUrl };
    } catch { /* booting */ }
    await sleep(250);
  }
  process.kill();
  await new Promise((resolveExit) => process.once('exit', resolveExit));
  throw new Error('Chrome did not expose a page');
}

async function inspect(pageUrl, seed = false) {
  const ws = new WebSocket(pageUrl);
  let messageId = 0;
  const pending = new Map();
  const send = (method, params = {}) => new Promise((resolveSend, rejectSend) => {
    const id = ++messageId;
    pending.set(id, { resolve: resolveSend, reject: rejectSend });
    ws.send(JSON.stringify({ id, method, params }));
  });
  ws.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (!message.id || !pending.has(message.id)) return;
    const request = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) request.reject(new Error(message.error.message)); else request.resolve(message.result);
  };
  await new Promise((resolveOpen, rejectOpen) => { ws.onopen = resolveOpen; ws.onerror = rejectOpen; });
  await send('Runtime.enable');
  const evaluate = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result.value;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const value = await evaluate('window.__vaultStore?.vaultId ?? null');
    if (value) {
      if (seed) {
        await evaluate(`(async () => {
          const store = window.__vaultStore;
          const category = (await store.db.all('SELECT id FROM categories WHERE vault_id = ? AND is_active = 1 LIMIT 1', [${JSON.stringify(value)}]))[0];
          await store.db.exec(
            'INSERT INTO transactions (id, vault_id, occurred_on, merchant_display, merchant_original, amount_minor, currency, category_id, category_source, category_confidence, note, source_type, statement_import_id, source_row_key, review_state, original_payload, created_at, updated_at, deleted_at, version, last_modified_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            ['restart-transaction', ${JSON.stringify(value)}, '2026-08-05', 'Process Restart Cafe', null, -875, 'USD', category.id, 'user', 'confirmed', null, 'manual', null, null, 'confirmed', null, '2026-08-05T00:00:00.000Z', '2026-08-05T00:00:00.000Z', null, 1, 'web'],
          );
        })()`);
      }
      const state = await evaluate(`(async () => {
        const rows = await window.__vaultStore.db.all('SELECT COUNT(*) AS n FROM transactions WHERE id = ?', ['restart-transaction']);
        return { vaultId: window.__vaultStore.vaultId, restartTransactions: rows[0]?.n ?? 0 };
      })()`);
      ws.close();
      return state;
    }
    await sleep(250);
  }
  ws.close();
  throw new Error('vault did not open');
}

try {
  const first = await launch();
  const firstState = await inspect(first.pageUrl, true);
  first.process.kill();
  await new Promise((resolveExit) => first.process.once('exit', resolveExit));
  await sleep(1500);
  debugPort += 1;
  const second = await launch();
  const secondState = await inspect(second.pageUrl);
  second.process.kill();
  await new Promise((resolveExit) => second.process.once('exit', resolveExit));
  const pass = firstState.vaultId === secondState.vaultId && firstState.restartTransactions === 1 && secondState.restartTransactions === 1;
  console.log(`PROCESS RESTART PERSISTENCE: ${pass ? 'PASS' : 'FAIL'} vault1=${firstState.vaultId} vault2=${secondState.vaultId} seededTransaction=${secondState.restartTransactions}`);
  process.exitCode = pass ? 0 : 1;
} catch (error) {
  console.error('RESTART AUDIT ERROR:', error.message);
  process.exitCode = 1;
} finally {
  try { rmSync(PROFILE, { recursive: true, force: true }); } catch { /* profile may be locked */ }
}
