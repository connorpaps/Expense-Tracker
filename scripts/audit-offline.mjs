/**
 * US5 browser audit: prove the already-loaded app remains usable with the
 * network disabled, then reopens the same local vault after a restart.
 * Usage: node scripts/audit-offline.mjs [port]
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname ?? '.', '..');
const PORT = Number(process.argv[2] ?? 5173);
const DEBUG_PORT = 9666;
const APP_URL = `http://localhost:${PORT}/#/transactions`;
const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
const userDataDir = mkdtempSync(join(tmpdir(), 'offline-chrome-'));

function findChrome() {
  const candidates = [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  ];
  for (const candidate of candidates) {
    try {
      readFileSync(candidate);
      return candidate;
    } catch { /* try next */ }
  }
  throw new Error('Chrome not found');
}

const chrome = spawn(findChrome(), [
  '--headless=new',
  `--remote-debugging-port=${DEBUG_PORT}`,
  `--user-data-dir=${userDataDir}`,
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-gpu',
  APP_URL,
], { stdio: 'ignore' });

async function pageWebSocketUrl() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const targets = await (await fetch(`http://localhost:${DEBUG_PORT}/json/list`)).json();
      const page = targets.find((target) => target.type === 'page');
      if (page) return page.webSocketDebuggerUrl;
    } catch { /* booting */ }
    await sleep(250);
  }
  throw new Error('No Chrome page target');
}

const ws = new WebSocket(await pageWebSocketUrl());
let messageId = 0;
const pending = new Map();
const consoleIssues = [];

function send(method, params = {}) {
  return new Promise((resolveSend, rejectSend) => {
    const id = ++messageId;
    pending.set(id, { resolve: resolveSend, reject: rejectSend });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  if (message.id) {
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    if (message.error) request.reject(new Error(message.error.message));
    else request.resolve(message.result);
    return;
  }
  if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
    consoleIssues.push(message.params.args.map((arg) => arg.value ?? arg.description ?? arg.type).join(' '));
  }
  if (message.method === 'Runtime.exceptionThrown') {
    consoleIssues.push(message.params.exceptionDetails.text);
  }
};

async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result.value;
}

async function waitFor(expression, label, timeoutMs = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const value = await evaluate(expression);
    if (value) return value;
    await sleep(200);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

function setControl(selector, value) {
  const escaped = JSON.stringify(value);
  return evaluate(`(() => {
    const element = document.querySelector(${JSON.stringify(selector)});
    if (!element) return false;
    const prototype = element instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
    setter?.call(element, ${escaped});
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`);
}

async function click(text) {
  return evaluate(`(() => {
    const button = Array.from(document.querySelectorAll('button')).find((candidate) => candidate.textContent.trim() === ${JSON.stringify(text)} && !candidate.disabled);
    if (!button) return false;
    button.click();
    return true;
  })()`);
}

function record(results, name, ok, details = {}) {
  results.push({ name, ok, details });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${Object.keys(details).length ? ` — ${JSON.stringify(details)}` : ''}`);
}

const results = [];
ws.onopen = async () => {
  try {
    await send('Runtime.enable');
    await send('Network.enable');
    const vaultId = await waitFor('window.__vaultStore?.vaultId ?? null', 'local vault');
    await waitFor("document.querySelector('h1')?.textContent === 'Transactions'", 'transactions page');

    await send('Network.emulateNetworkConditions', {
      offline: true,
      latency: 0,
      downloadThroughput: 0,
      uploadThroughput: 0,
    });
    const offlineStatus = await waitFor("document.querySelector('.local-status')?.textContent.includes('Browser offline') && navigator.onLine === false", 'offline status');
    record(results, 'offline status is visible', Boolean(offlineStatus));

    await click('Add expense');
    await waitFor("document.querySelector('h2')?.textContent === 'Add an expense'", 'manual entry form');
    await waitFor("document.querySelectorAll('#transaction-category option[value]:not([value=\"\"])').length > 0", 'active categories');
    await setControl('#transaction-merchant', 'Offline Coffee');
    await setControl('#transaction-amount', '-12.34');
    const enteredValues = await evaluate("({ merchant: document.querySelector('#transaction-merchant')?.value ?? '', amount: document.querySelector('#transaction-amount')?.value ?? '', category: document.querySelector('#transaction-category')?.value ?? '' })");
    record(results, 'manual entry form accepts offline values', enteredValues.merchant === 'Offline Coffee' && enteredValues.amount === '-12.34' && enteredValues.category.length > 0, enteredValues);
    await click('Save expense');
    const savedMessage = await waitFor("document.querySelector('main .notice[role=\"status\"]')?.textContent.includes('Expense saved locally')", 'offline save status');
    record(results, 'manual expense saves while offline', Boolean(savedMessage));
    const pendingStatus = await waitFor("document.querySelector('.local-status')?.textContent.includes('local change')", 'pending local change status');
    record(results, 'pending local change is visible', Boolean(pendingStatus));

    await waitFor("document.querySelector('.transaction-row strong')?.textContent === 'Offline Coffee'", 'saved offline transaction');
    await click('Edit');
    await waitFor("document.querySelector('h2')?.textContent === 'Edit transaction'", 'edit form');
    const alternateCategory = await evaluate("document.querySelectorAll('#transaction-category option[value]:not([value=\\\"\\\"])')[1]?.value ?? document.querySelector('#transaction-category option[value]:not([value=\\\"\\\"])')?.value ?? ''");
    const originalCategory = await evaluate("document.querySelector('#transaction-category')?.value ?? ''");
    await setControl('#transaction-category', alternateCategory);
    const correctionValues = await evaluate("({ original: " + JSON.stringify(originalCategory) + ", alternate: document.querySelector('#transaction-category')?.value ?? '' })");
    if (!correctionValues.alternate || correctionValues.alternate === correctionValues.original) throw new Error('Could not select a distinct alternate category');
    await click('Save changes');
    const correctionMessage = await waitFor("document.querySelector('main .notice[role=\"status\"]')?.textContent.includes('Transaction updated locally')", 'category correction status');
    record(results, 'category correction saves while offline', Boolean(correctionMessage), { category: alternateCategory });

    await evaluate("(() => { const link = Array.from(document.querySelectorAll('.app-nav__link')).find((candidate) => candidate.textContent.trim() === 'Overview'); link?.click(); return Boolean(link); })()");
    await waitFor("document.querySelector('h1')?.textContent === 'Overview'", 'overview page');
    const summaryVisible = await waitFor("document.body.innerText.includes('12.34')", 'offline summary amount');
    record(results, 'summary renders while offline', Boolean(summaryVisible));

    await send('Network.emulateNetworkConditions', {
      offline: false,
      latency: 0,
      downloadThroughput: -1,
      uploadThroughput: -1,
    });
    await send('Page.reload');
    await waitFor('window.__vaultStore?.vaultId ?? null', 'vault after restart');
    const persisted = await evaluate(`(async () => {
      const store = window.__vaultStore;
      const rows = await store.db.all('SELECT merchant_display, category_id FROM transactions WHERE vault_id = ? AND merchant_display = ?', [${JSON.stringify(vaultId)}, 'Offline Coffee']);
      return { vaultId: store.vaultId, rows };
    })()`);
    const restartPassed = persisted.vaultId === vaultId && persisted.rows.length === 1 && persisted.rows[0].category_id === alternateCategory;
    record(results, 'offline edit and correction survive restart', restartPassed, persisted);

    record(results, 'offline audit console clean', consoleIssues.length === 0, { issues: consoleIssues });
    console.log(`OFFLINE AUDIT SUMMARY: ${results.length} scenarios, ${results.filter((result) => !result.ok).length} failures`);
    process.exitCode = results.every((result) => result.ok) ? 0 : 1;
  } catch (error) {
    console.error('OFFLINE AUDIT ERROR:', error.message);
    process.exitCode = 1;
  } finally {
    try {
      await send('Network.emulateNetworkConditions', {
        offline: false,
        latency: 0,
        downloadThroughput: -1,
        uploadThroughput: -1,
      });
    } catch { /* browser may already be gone */ }
    ws.close();
    chrome.kill();
    await sleep(1000);
    try { rmSync(userDataDir, { recursive: true, force: true }); } catch { /* profile may still be locked */ }
    process.exit();
  }
};

ws.onerror = (error) => {
  console.error('WebSocket error', error.message ?? error);
  chrome.kill();
  process.exit(1);
};

setTimeout(() => {
  console.error('OFFLINE AUDIT TIMEOUT');
  chrome.kill();
  process.exit(1);
}, 120_000);
