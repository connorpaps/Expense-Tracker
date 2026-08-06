/**
 * US5 T068 production browser audit: exercise the optional static shell.
 * Usage: node scripts/audit-service-worker.mjs [port]
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = Number(process.argv[2] ?? 4173);
const DEBUG_PORT = 9888;
const AUDIT_TIMEOUT_MS = 90_000;
const PROFILE = mkdtempSync(join(tmpdir(), 'sw-chrome-'));
const URL = `http://localhost:${PORT}/#/settings`;
const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));

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

const chrome = spawn(findChrome(), [
  '--headless=new', `--remote-debugging-port=${DEBUG_PORT}`, `--user-data-dir=${PROFILE}`,
  '--no-first-run', '--no-default-browser-check', '--disable-gpu', URL,
], { stdio: 'ignore' });

async function pageUrl() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const targets = await (await fetch(`http://localhost:${DEBUG_PORT}/json/list`)).json();
      const page = targets.find((target) => target.type === 'page');
      if (page) return page.webSocketDebuggerUrl;
    } catch { /* booting */ }
    await sleep(250);
  }
  throw new Error('No page target');
}

let ws = null;
let cleanedUp = false;
async function cleanup() {
  if (cleanedUp) return;
  cleanedUp = true;
  try { ws?.close(); } catch { /* not connected */ }
  try { chrome.kill(); } catch { /* already exited */ }
  await sleep(500);
  try { rmSync(PROFILE, { recursive: true, force: true }); } catch { /* profile may be locked */ }
}

const timeout = setTimeout(() => {
  console.error('SERVICE WORKER AUDIT TIMEOUT');
  void cleanup().finally(() => {
    process.exitCode = 1;
    process.exit(1);
  });
}, AUDIT_TIMEOUT_MS);

ws = new WebSocket(await pageUrl());
let id = 0;
const pending = new Map();
const send = (method, params = {}) => new Promise((resolveSend, rejectSend) => {
  const messageId = ++id;
  pending.set(messageId, { resolve: resolveSend, reject: rejectSend });
  ws.send(JSON.stringify({ id: messageId, method, params }));
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
await send('Network.enable');
const evaluate = async (expression) => {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(`${result.exceptionDetails.text}: ${result.exceptionDetails.exception?.description ?? ''}`);
  return result.result?.value;
};
const waitFor = async (expression, label) => {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (await evaluate(expression)) return true;
    await sleep(250);
  }
  throw new Error(`Timed out waiting for ${label}`);
};

try {
  await waitFor("document.querySelector('h1')?.textContent === 'Privacy and settings'", 'online app shell');
  const scriptResponse = await evaluate(`fetch('/sw.js').then(async (response) => ({
    status: response.status,
    hasInstall: (await response.text()).includes("addEventListener('install'")
  }))`);
  const productionMarker = await evaluate("document.querySelector('script[type=module][src*=assets]')?.getAttribute('src')?.startsWith('/assets/') ?? false");
  if (!productionMarker) throw new Error('Production preview marker not found; run this audit against vite preview, not a dev server.');
  await waitFor("navigator.serviceWorker?.controller?.state === 'activated' || navigator.serviceWorker?.ready.then((registration) => registration.active?.state === 'activated').catch(() => false)", 'service worker registration');
  const registration = await evaluate("navigator.serviceWorker.controller?.state ?? 'no-controller'");
  const initialHeading = await evaluate("document.querySelector('h1')?.textContent ?? ''");
  const cached = await evaluate("caches.keys().then((keys) => keys.some((key) => key.includes('expense-tracker-shell')))");
  console.log(`SERVICE WORKER ONLINE: ${registration} heading=${initialHeading} cached=${cached} script=${JSON.stringify(scriptResponse)}`);

  await send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
  await send('Page.navigate', { url: URL });
  await waitFor("document.querySelector('h1')?.textContent === 'Privacy and settings'", 'offline cached shell navigation');
  const offlineHeading = await evaluate("document.querySelector('h1')?.textContent ?? ''");
  const pass = productionMarker && registration === 'activated' && initialHeading === 'Privacy and settings' && cached && offlineHeading === 'Privacy and settings' && scriptResponse.status === 200 && scriptResponse.hasInstall;
  console.log(`SERVICE WORKER OFFLINE NAVIGATION: ${pass ? 'PASS' : 'FAIL'} heading=${offlineHeading}`);
  process.exitCode = pass ? 0 : 1;
} catch (error) {
  console.error('SERVICE WORKER AUDIT ERROR:', error.message);
  process.exitCode = 1;
} finally {
  clearTimeout(timeout);
  try { await send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 }); } catch { /* closing */ }
  await cleanup();
  process.exit();
}
