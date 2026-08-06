/**
 * Relay entry point (T003). Run with `npm run start --workspace @expense-tracker/relay`
 * (or `npm run relay` from the repo root). Secure mode is intentionally
 * localhost-only until HTTPS/WSS certificate setup is implemented.
 */

import { createRelayServer } from './relay-server.js';

interface RelayConfig {
  host: string;
  port: number;
  name: string;
  secureMode: boolean;
  enrollmentSecret?: string;
  enrollmentVaultId?: string;
  pairingTtlMs: number;
  authorizationTtlMs: number;
}

function readConfig(): RelayConfig {
  const port = Number(process.env.RELAY_PORT ?? 8712);
  const pairingTtlMs = Number(process.env.RELAY_PAIRING_TTL_MS ?? 5 * 60 * 1000);
  const authorizationTtlMs = Number(process.env.RELAY_AUTH_TTL_MS ?? 30 * 24 * 60 * 60 * 1000);
  const enrollmentSecret = process.env.RELAY_ENROLLMENT_SECRET;
  const enrollmentVaultId = process.env.RELAY_ENROLLMENT_VAULT_ID;
  if (!Number.isFinite(pairingTtlMs) || pairingTtlMs <= 0 || !Number.isFinite(authorizationTtlMs) || authorizationTtlMs <= 0) {
    throw new Error('RELAY_PAIRING_TTL_MS and RELAY_AUTH_TTL_MS must be positive numbers.');
  }
  if (!enrollmentSecret) {
    throw new Error('RELAY_ENROLLMENT_SECRET is required for secure first-device enrollment.');
  }
  if (!enrollmentVaultId?.trim()) {
    throw new Error('RELAY_ENROLLMENT_VAULT_ID is required for vault-scoped first-device enrollment.');
  }
  return {
    host: process.env.RELAY_HOST ?? '127.0.0.1',
    port: Number.isFinite(port) && port > 0 ? port : 8712,
    name: process.env.RELAY_NAME ?? 'Expense Tracker relay',
    secureMode: true,
    enrollmentSecret,
    enrollmentVaultId,
    pairingTtlMs,
    authorizationTtlMs,
  };
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
  banner.push(` Secure pairing is localhost-only until HTTPS/WSS certificate setup is implemented.`);
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
