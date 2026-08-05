/**
 * Audit: verify the local vault and committed transactions persist across a
 * full page reload (wa-sqlite IDB durability + bootstrap re-open path).
 * Usage: node scripts/audit-reload.mjs [port]
 */
import { spawn } from 'node:child_process';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname ?? '.', '..');
const AMEX = readFileSync(join(ROOT, 'packages/fixtures/statements/csv/amex.csv')).toString('base64');

const PORT = Number(process.argv[2] ?? 5173);
const URL = `http://localhost:${PORT}/#/import`;
const userDataDir = mkdtempSync(join(tmpdir(), 'reload-chrome-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
    } catch { /* next */ }
  }
  throw new Error('Chrome not found');
}

const chrome = spawn(findChrome(), [
  '--headless=new',
  '--remote-debugging-port=9556',
  `--user-data-dir=${userDataDir}`,
  '--no-first-run',
  '--disable-gpu',
  URL,
], { stdio: 'ignore' });

async function getPageWsUrl() {
  for (let i = 0; i < 60; i += 1) {
    try {
      const targets = await (await fetch('http://localhost:9556/json/list')).json();
      const page = targets.find((t) => t.type === 'page');
      if (page) return page.webSocketDebuggerUrl;
    } catch { /* booting */ }
    await sleep(250);
  }
  throw new Error('No CDP target');
}

const ws = new WebSocket(await getPageWsUrl());
let id = 0;
const pending = new Map();

function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const msgId = ++id;
    pending.set(msgId, { resolve, reject });
    ws.send(JSON.stringify({ id: msgId, method, params }));
  });
}

ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  if (!msg.id || !pending.has(msg.id)) return;
  const p = pending.get(msg.id);
  pending.delete(msg.id);
  if (msg.error) p.reject(new Error(msg.error.message));
  else p.resolve(msg.result);
};

async function evalValue(expression) {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  return r.result.value;
}

async function waitVault() {
  for (let i = 0; i < 80; i += 1) {
    const v = await evalValue('window.__vaultStore ? window.__vaultStore.vaultId : null');
    if (v) return v;
    await sleep(250);
  }
  throw new Error('vault did not open');
}

ws.onopen = async () => {
  try {
    await send('Runtime.enable');
    await send('Page.enable');

    const vault1 = await waitVault();
    // Import + commit the amex CSV so real data exists before reload.
    await evalValue(`(() => {
      const bytes = Uint8Array.from(atob('${AMEX}'), (c) => c.charCodeAt(0));
      const file = new File([bytes], 'amex.csv', { type: 'text/csv' });
      const input = document.getElementById('import-file-input');
      const dt = new DataTransfer();
      dt.items.add(file);
      input.files = dt.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    })()`);
    for (let i = 0; i < 80; i += 1) {
      const rows = await evalValue(`document.querySelectorAll('.review__table tbody tr').length`);
      if (rows >= 5) break;
      await sleep(250);
    }
    await evalValue(`(() => {
      const btn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent.trim() === 'Commit import' && !b.disabled);
      if (btn) btn.click();
    })()`);
    for (let i = 0; i < 80; i += 1) {
      const saved = await evalValue(`!!document.querySelector('.commit-bar--success')`);
      if (saved) break;
      await sleep(250);
    }
    const tx1 = await evalValue(
      "(async () => { const s = window.__vaultStore; const r = await s.db.all('SELECT COUNT(*) AS n FROM transactions'); return r[0].n; })()",
    );
    console.log(`BEFORE RELOAD: vault=${vault1} transactions=${tx1}`);

    await send('Page.reload');
    await sleep(4000);
    const vault2 = await waitVault();
    const tx2 = await evalValue(
      "(async () => { const s = window.__vaultStore; const r = await s.db.all('SELECT COUNT(*) AS n FROM transactions'); return r[0].n; })()",
    );
    const cat2 = await evalValue(
      "(async () => { const s = window.__vaultStore; const r = await s.db.all('SELECT COUNT(*) AS n FROM categories'); return r[0].n; })()",
    );
    console.log(`AFTER RELOAD:  vault=${vault2} transactions=${tx2} categories=${cat2}`);

    const pass = Boolean(vault1 && vault1 === vault2 && tx1 === tx2 && tx1 === 5 && cat2 === 10);
    console.log(`RELOAD PERSISTENCE: ${pass ? 'PASS' : 'FAIL'}`);
    process.exitCode = pass ? 0 : 1;
  } catch (error) {
    console.error('AUDIT ERROR:', error.message);
    process.exitCode = 1;
  } finally {
    ws.close();
    chrome.kill();
    await sleep(1200);
    try { rmSync(userDataDir, { recursive: true, force: true }); } catch { /* lock */ }
    process.exit();
  }
};

ws.onerror = (e) => {
  console.error('WS error', e.message ?? e);
  chrome.kill();
  process.exit(1);
};

setTimeout(() => {
  console.error('TIMEOUT');
  chrome.kill();
  process.exit(1);
}, 60_000);
