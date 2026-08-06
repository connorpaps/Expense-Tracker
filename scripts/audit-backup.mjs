/**
 * Live web backup audit (US5/US7 web boundary).
 * Verifies encrypted download, synthetic file-input selection, password
 * unlock, preview, and isolated copy creation in a fresh browser profile. The
 * synthetic DataTransfer path is not native chooser E2E. It does not claim
 * native parity, remote deletion, or OS-level backup erasure.
 *
 * Usage: node scripts/audit-backup.mjs [port]
 */
import { spawn } from 'node:child_process';
import { readdirSync, readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const port = Number(process.argv[2] ?? 5173);
const debugPort = 9777;
const profile = mkdtempSync(join(tmpdir(), 'backup-audit-chrome-'));
const downloads = mkdtempSync(join(tmpdir(), 'backup-audit-downloads-'));
const url = `http://localhost:${port}/#/settings`;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let chrome;
let ws;
let closed = false;
const pending = new Map();
const results = [];
const consoleIssues = [];
let id = 0;

function findChrome() {
  for (const candidate of [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  ]) {
    try { readFileSync(candidate); return candidate; } catch { /* next */ }
  }
  throw new Error('Chrome not found');
}

async function cleanup() {
  if (closed) return;
  closed = true;
  try { ws?.close(); } catch { /* closed */ }
  try { chrome?.kill(); } catch { /* exited */ }
  await sleep(500);
  try { rmSync(profile, { recursive: true, force: true }); } catch { /* locked */ }
  try { rmSync(downloads, { recursive: true, force: true }); } catch { /* locked */ }
}

async function pageWsUrl() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const targets = await (await fetch(`http://localhost:${debugPort}/json/list`)).json();
      const page = targets.find((target) => target.type === 'page');
      if (page) return page.webSocketDebuggerUrl;
    } catch { /* booting */ }
    await sleep(250);
  }
  throw new Error('No Chrome page target');
}

function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const requestId = ++id;
    pending.set(requestId, { resolve, reject });
    ws.send(JSON.stringify({ id: requestId, method, params }));
  });
}

async function evaluate(expression) {
  const response = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (response.exceptionDetails) throw new Error(response.exceptionDetails.text);
  return response.result.value;
}

async function waitFor(expression, label, timeoutMs = 20000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const value = await evaluate(expression);
    if (value) return value;
    await sleep(250);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

function record(name, ok, details = {}) {
  results.push({ name, ok, details });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} — ${JSON.stringify(details)}`);
}

async function setValue(selector, value, index = 0) {
  return evaluate(`(() => {
    const element = document.querySelectorAll(${JSON.stringify(selector)})[${index}];
    if (!element) return false;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    setter?.call(element, ${JSON.stringify(value)});
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`);
}

async function click(label) {
  return evaluate(`(() => {
    const button = Array.from(document.querySelectorAll('button')).find((candidate) => candidate.textContent.trim() === ${JSON.stringify(label)} && !candidate.disabled);
    if (!button) return false;
    button.click();
    return true;
  })()`);
}

async function injectDownloadedFile(path) {
  const bytes = readFileSync(path).toString('base64');
  return evaluate(`(() => {
    const bytes = Uint8Array.from(atob(${JSON.stringify(bytes)}), (character) => character.charCodeAt(0));
    const file = new File([bytes], 'expense-tracker-vault.etvault', { type: 'application/json' });
    const input = document.querySelector('input[aria-label="Choose an encrypted vault backup"]');
    if (!input) return false;
    const data = new DataTransfer();
    data.items.add(file);
    input.files = data.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return input.files.length === 1;
  })()`);
}

async function main() {
  chrome = spawn(findChrome(), [
    '--headless=new',
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-gpu',
    '--window-size=1280,900',
    url,
  ], { stdio: 'ignore' });
  ws = new WebSocket(await pageWsUrl());
  ws.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const request = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) request.reject(new Error(message.error.message));
      else request.resolve(message.result);
      return;
    }
    if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
      consoleIssues.push(message.params.args.map((arg) => arg.value ?? arg.description ?? arg.type).join(' '));
    }
    if (message.method === 'Runtime.exceptionThrown') consoleIssues.push(message.params.exceptionDetails.text);
    if (message.method === 'Network.responseReceived' && message.params.response.status >= 400 && !message.params.response.url.includes('favicon.ico')) {
      consoleIssues.push(`[network.${message.params.response.status}] ${message.params.response.url}`);
    }
  };
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });
  await send('Runtime.enable');
  await send('Network.enable');
  await send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloads });
  await waitFor("document.querySelector('h1')?.textContent === 'Privacy and settings'", 'settings page');
  await waitFor('window.__vaultStore?.vaultId ?? null', 'vault bootstrap');

  await evaluate(`(async () => {
    const store = window.__vaultStore;
    const category = (await store.db.get('SELECT id FROM categories WHERE vault_id = ? AND is_active = 1 ORDER BY position LIMIT 1', [store.vaultId])).id;
    const now = new Date().toISOString();
    await store.db.exec(
      'INSERT INTO transactions (id, vault_id, occurred_on, merchant_display, merchant_original, amount_minor, currency, category_id, category_source, category_confidence, note, source_type, statement_import_id, source_row_key, review_state, original_payload, created_at, updated_at, deleted_at, version, last_modified_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [crypto.randomUUID(), store.vaultId, now.slice(0, 10), 'Backup Cafe', null, -1234, 'USD', category, 'user', 'confirmed', null, 'manual', null, null, 'confirmed', null, now, now, null, 1, 'web'],
    );
    return true;
  })()`);
  await evaluate(`(() => { const link = Array.from(document.querySelectorAll('.app-nav__link')).find((candidate) => candidate.textContent.trim() === 'Settings'); link?.click(); return Boolean(link); })()`);
  await waitFor("document.querySelector('h1')?.textContent === 'Privacy and settings'", 'settings after seed');

  const initial = await evaluate(`(async () => {
    const store = window.__vaultStore;
    const vaults = await store.db.all('SELECT COUNT(*) AS n FROM vaults');
    const transactions = await store.db.all('SELECT COUNT(*) AS n FROM transactions WHERE vault_id = ?', [store.vaultId]);
    return { vaultId: store.vaultId, vaults: vaults[0].n, transactions: transactions[0].n };
  })()`);
  record('backup audit starts with one seeded vault', initial.vaults === 1 && initial.transactions === 1, initial);

  await click('Export encrypted backup');
  await waitFor("document.querySelector('[role=dialog] h3')?.textContent === 'Protect your backup'", 'export password dialog');
  await setValue('input[type="password"]', 'correct horse battery', 0);
  await setValue('input[type="password"]', 'correct horse battery', 1);
  const exportClicked = await click('Create encrypted backup');
  const downloadStarted = await (async () => {
    const started = Date.now();
    while (Date.now() - started < 30000) {
      if (readdirSync(downloads).some((name) => name.endsWith('.etvault'))) return true;
      await sleep(250);
    }
    return false;
  })();
  if (!downloadStarted) throw new Error('Timed out waiting for encrypted backup download.');
  const fileName = readdirSync(downloads).find((name) => name.endsWith('.etvault'));
  const filePath = join(downloads, fileName);
  const envelope = JSON.parse(readFileSync(filePath, 'utf8'));
  record('encrypted backup downloads', exportClicked && envelope.format === 'expense-tracker-vault-v1' && typeof envelope.encrypted === 'string' && typeof envelope.checksum === 'string', { fileName, format: envelope.format });

  const inspectClicked = await click('Inspect backup');
  await waitFor(`!!document.querySelector('input[aria-label="Choose an encrypted vault backup"]')`, 'backup file input');
  const injected = await injectDownloadedFile(filePath);
  await waitFor(`document.querySelector('[role=dialog] h3')?.textContent === 'Unlock this backup'`, 'unlock dialog');
  await setValue('input[type="password"]', 'correct horse battery');
  const unlockClicked = await click('Unlock backup');
  await waitFor(`!!document.querySelector('[aria-labelledby="backup-preview-heading"]')`, 'backup preview');
  const preview = await evaluate(`document.querySelector('[aria-labelledby="backup-preview-heading"]')?.textContent ?? ''`);
  record('backup file unlocks and shows preview', inspectClicked && unlockClicked && preview.includes('Ready to restore') && preview.includes('1 transactions'), { inspectClicked, syntheticFileInputExposedFiles: injected, unlockClicked, preview: preview.slice(0, 180) });

  await evaluate(`(() => { window.prompt = () => 'Restored copy'; window.confirm = () => true; })()`);
  const copyClicked = await click('Create isolated vault copy');
  await waitFor(`(async () => (await window.__vaultStore.db.all('SELECT COUNT(*) AS n FROM vaults'))[0].n === 2)()`, 'isolated copied vault');
  const copied = await evaluate(`(async () => {
    const store = window.__vaultStore;
    const vaults = await store.db.all('SELECT id, vault_owner_label, demo_mode FROM vaults ORDER BY created_at ASC');
    const counts = await store.db.all('SELECT vault_id, COUNT(*) AS n FROM transactions GROUP BY vault_id ORDER BY vault_id ASC');
    const merchants = await store.db.all('SELECT vault_id, merchant_display FROM transactions ORDER BY vault_id ASC');
    return { activeLabel: store.vault.vault_owner_label, vaults, counts, merchants };
  })()`);
  record('restore creates an isolated non-demo copy', copyClicked && copied.vaults.length === 2 && copied.vaults[0].vault_owner_label === 'Personal vault' && copied.vaults[1].vault_owner_label === 'Restored copy' && copied.vaults[0].demo_mode === 0 && copied.vaults[1].demo_mode === 0 && copied.counts.length === 2 && copied.counts.every((row) => row.n === 1) && copied.merchants.length === 2 && copied.merchants.every((row) => row.merchant_display === 'Backup Cafe'), copied);
  record('backup audit console clean', consoleIssues.length === 0, { issues: consoleIssues });
  console.log(`BACKUP AUDIT SUMMARY: ${results.length} scenarios, ${results.filter((result) => !result.ok).length} failed`);
  process.exitCode = results.every((result) => result.ok) ? 0 : 1;
}

const timeout = setTimeout(() => {
  console.error('BACKUP AUDIT TIMEOUT');
  process.exitCode = 1;
  void cleanup().finally(() => process.exit(1));
}, 120000);

try {
  await main();
} catch (error) {
  console.error('BACKUP AUDIT ERROR:', error.message);
  process.exitCode = 1;
} finally {
  clearTimeout(timeout);
  await cleanup();
  process.exit();
}
