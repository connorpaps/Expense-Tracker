/**
 * Live browser audit for the web-first vault/demo/privacy boundary (US7).
 *
 * Verifies with a fresh Chrome profile that the app can create a private vault,
 * create a labeled demo vault, switch between them, keep records isolated, and
 * expose the encrypted backup/retention controls. It intentionally does not
 * claim file chooser backup restore or native iOS parity.
 *
 * Usage: node scripts/audit-vaults.mjs [port]
 */
import { spawn } from 'node:child_process';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const APP_PORT = Number(process.argv[2] ?? 5173);
const DEBUG_PORT = 9666;
const APP_URL = `http://localhost:${APP_PORT}/#/settings`;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const userDataDir = mkdtempSync(join(tmpdir(), 'vault-audit-chrome-'));
let chrome;
let ws;
let cleaned = false;

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

async function cleanup() {
  if (cleaned) return;
  cleaned = true;
  try { ws?.close(); } catch { /* already closed */ }
  try { chrome?.kill(); } catch { /* already exited */ }
  await sleep(500);
  try { rmSync(userDataDir, { recursive: true, force: true }); } catch { /* Chrome may still hold a lock. */ }
}

async function pageWsUrl() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const targets = await (await fetch(`http://localhost:${DEBUG_PORT}/json/list`)).json();
      const page = targets.find((target) => target.type === 'page');
      if (page) return page.webSocketDebuggerUrl;
    } catch { /* booting */ }
    await sleep(250);
  }
  throw new Error('No Chrome CDP page target');
}

const consoleIssues = [];
const results = [];
let commandId = 0;
const pending = new Map();

function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++commandId;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
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

async function clickButton(label) {
  return evaluate(`(() => {
    const button = Array.from(document.querySelectorAll('button')).find((candidate) => candidate.textContent.trim() === ${JSON.stringify(label)} && !candidate.disabled);
    if (!button) return false;
    button.click();
    return true;
  })()`);
}

async function state() {
  return evaluate(`(async () => {
    const store = window.__vaultStore;
    const vaults = await store.db.all('SELECT id, vault_owner_label, demo_mode FROM vaults ORDER BY created_at ASC');
    const transactions = await store.db.all('SELECT vault_id, source_type, merchant_display FROM transactions ORDER BY created_at ASC');
    return {
      activeVaultId: store.vaultId,
      activeLabel: store.vault.vault_owner_label,
      activeDemo: store.vault.demo_mode,
      vaults,
      transactions,
    };
  })()`);
}

async function main() {
  chrome = spawn(findChrome(), [
    '--headless=new',
    `--remote-debugging-port=${DEBUG_PORT}`,
    `--user-data-dir=${userDataDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-gpu',
    '--window-size=1280,900',
    APP_URL,
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
  ws.onerror = (error) => consoleIssues.push(`CDP: ${error.message ?? error}`);

  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });
  await send('Runtime.enable');
  await send('Network.enable');
  await waitFor(`document.querySelector('h1')?.textContent === 'Privacy and settings'`, 'Settings page');
  await waitFor('window.__vaultStore?.vaultId ?? null', 'initial vault');

  const initial = await state();
  record('private vault bootstrap', initial.vaults.length === 1 && initial.activeDemo === false, { vaults: initial.vaults.length, activeLabel: initial.activeLabel });

  const controls = await evaluate(`(() => ({
    privateButton: Boolean(Array.from(document.querySelectorAll('button')).find((b) => b.textContent.trim() === 'Create private vault')),
    demoButton: Boolean(Array.from(document.querySelectorAll('button')).find((b) => b.textContent.trim() === 'Create demo vault')),
    exportButton: Boolean(Array.from(document.querySelectorAll('button')).find((b) => b.textContent.trim() === 'Export encrypted backup')),
    inspectButton: Boolean(Array.from(document.querySelectorAll('button')).find((b) => b.textContent.trim() === 'Inspect backup')),
    retentionHeading: document.querySelector('#retention-heading')?.textContent ?? '',
    dangerHeading: document.querySelector('#danger-zone-heading')?.textContent ?? '',
  }))()`);
  record('privacy and vault controls are exposed', controls.privateButton && controls.demoButton && controls.exportButton && controls.inspectButton && controls.retentionHeading === 'Remove imported data' && controls.dangerHeading === 'Clear this browser', controls);

  const nameInput = await evaluate(`(() => {
    const label = Array.from(document.querySelectorAll('label')).find((candidate) => candidate.textContent.trim().startsWith('New vault name'));
    return label?.querySelector('input')?.getAttribute('placeholder') ?? null;
  })()`);
  record('new vault name control is labeled', nameInput === 'e.g. Household demo', { placeholder: nameInput, semanticLabel: 'New vault name' });

  const privateCreated = await evaluate(`(async () => {
    const input = document.querySelector('input[placeholder="e.g. Household demo"]');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(input, 'Household private');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.closest('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    return input.value;
  })()`);
  await waitFor(`window.__vaultStore?.vault?.vault_owner_label === 'Household private'`, 'private vault creation');
  const afterPrivate = await state();
  record('create private vault', privateCreated === 'Household private' && afterPrivate.vaults.length === 2 && afterPrivate.activeDemo === false, { activeLabel: afterPrivate.activeLabel, vaults: afterPrivate.vaults });

  const demoCreated = await clickButton('Create demo vault');
  await waitFor(`window.__vaultStore?.vault?.demo_mode === true`, 'demo vault creation');
  const afterDemo = await state();
  const demoRows = afterDemo.transactions.filter((row) => row.vault_id === afterDemo.activeVaultId);
  record('create clearly labeled demo vault', demoCreated && afterDemo.activeDemo === true && afterDemo.activeLabel === 'Portfolio demo' && demoRows.length === 13 && demoRows.every((row) => row.source_type === 'demo'), { activeLabel: afterDemo.activeLabel, demoRows: demoRows.length, demoSources: [...new Set(demoRows.map((row) => row.source_type))] });

  const privateVault = afterDemo.vaults.find((vault) => vault.vault_owner_label === 'Household private');
  const switchedPrivate = await evaluate(`(() => {
    const select = document.querySelector('#active-vault');
    select.value = ${JSON.stringify(privateVault.id)};
    select.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`);
  await waitFor(`window.__vaultStore?.vault?.vault_owner_label === 'Household private'`, 'switch back to private vault');
  const backPrivate = await state();
  const privateRows = backPrivate.transactions.filter((row) => row.vault_id === backPrivate.activeVaultId);
  record('switch back to private vault without mixing records', switchedPrivate && backPrivate.activeDemo === false && privateRows.length === 0 && backPrivate.activeLabel === 'Household private', { activeLabel: backPrivate.activeLabel, privateRows: privateRows.length });

  const switchedDemo = await evaluate(`(() => {
    const select = document.querySelector('#active-vault');
    select.value = ${JSON.stringify(afterDemo.activeVaultId)};
    select.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`);
  await waitFor(`window.__vaultStore?.vault?.demo_mode === true`, 'switch to demo vault');
  const backDemo = await state();
  record('switch to demo vault restores only demo records', switchedDemo && backDemo.activeDemo === true && backDemo.transactions.filter((row) => row.vault_id === backDemo.activeVaultId).length === 13, { activeLabel: backDemo.activeLabel, demoRows: backDemo.transactions.filter((row) => row.vault_id === backDemo.activeVaultId).length });

  record('browser audit console clean', consoleIssues.length === 0, { issues: consoleIssues });
  console.log(`VAULT AUDIT SUMMARY: ${results.length} scenarios, ${results.filter((result) => !result.ok).length} failed`);
  process.exitCode = results.every((result) => result.ok) ? 0 : 1;
}

const timeout = setTimeout(() => {
  console.error('VAULT AUDIT TIMEOUT');
  process.exitCode = 1;
  void cleanup().finally(() => process.exit(1));
}, 120_000);

try {
  await main();
} catch (error) {
  console.error('VAULT AUDIT ERROR:', error.message);
  process.exitCode = 1;
} finally {
  clearTimeout(timeout);
  await cleanup();
  process.exit();
}
