/**
 * Relay entry point (T003). Run with `npm run start --workspace @expense-tracker/relay`
 * (or `npm run relay` from the repo root). Binds to localhost by default so no
 * other machine can reach the relay unless the user opts into LAN mode for iOS
 * pairing.
 */

import { networkInterfaces } from 'node:os';
import { createRelayServer } from './relay-server.js';

interface RelayConfig {
  host: string;
  port: number;
  name: string;
}

function readConfig(): RelayConfig {
  const port = Number(process.env.RELAY_PORT ?? 8712);
  const host = process.env.RELAY_HOST ?? '127.0.0.1';
  return {
    host,
    port: Number.isFinite(port) && port > 0 ? port : 8712,
    name: process.env.RELAY_NAME ?? 'Expense Tracker relay',
  };
}

function lanAddresses(): string[] {
  const addresses: string[] = [];
  for (const entries of Object.values(networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.family === 'IPv4' && !entry.internal) addresses.push(entry.address);
    }
  }
  return addresses;
}

async function main(): Promise<void> {
  const config = readConfig();
  const handle = createRelayServer(config);

  await new Promise<void>((resolve) => {
    handle.server.listen(config.port, config.host, resolve);
  });

  const banner = [
    `──────────────────────────────────────────────`,
    ` ${config.name} (relay)`,
    ` Listening on http://${config.host}:${handle.port}`,
  ];
  const lan = lanAddresses();
  if (config.host === '0.0.0.0' && lan.length > 0) {
    banner.push(` iOS pairing (same Wi-Fi): http://${lan[0]}:${handle.port}`);
  } else {
    banner.push(` Keeping iOS pairing on localhost only — set RELAY_HOST=0.0.0.0 to allow LAN pairing.`);
  }
  banner.push(` Health check: http://localhost:${handle.port}/health`);
  banner.push(`──────────────────────────────────────────────`);
  process.stdout.write(`${banner.join('\n')}\n`);

  const shutdown = (signal: string) => {
    process.stdout.write(`\n${signal} received, shutting down…\n`);
    void handle.close().finally(() => process.exit(0));
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((error) => {
  process.stderr.write(`relay failed to start: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
