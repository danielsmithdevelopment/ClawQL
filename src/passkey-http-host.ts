/**
 * Host wiring for primary passkey HTTP routes (`CLAWQL_PASSKEY_ENABLED=1`).
 */

import {
  attachPasskeyRoutes,
  createMemoryPasskeyCredentialStore,
  resolveSecretStore,
  type AttachPasskeyRoutesOptions,
  type McpOAuthAdminAuth,
  type PasskeyCredentialStore,
} from "clawql-auth";
import type { Express } from "express";

let processPasskeyStore: PasskeyCredentialStore | null = null;

export function resolvePasskeyCredentialStore(): PasskeyCredentialStore {
  if (!processPasskeyStore) {
    processPasskeyStore = createMemoryPasskeyCredentialStore();
  }
  return processPasskeyStore;
}

export function isPasskeyHttpEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const v = env.CLAWQL_PASSKEY_ENABLED?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

export function attachHostPasskeyRoutes(
  app: Express,
  options: {
    adminAuth?: McpOAuthAdminAuth;
    env?: NodeJS.ProcessEnv;
  } = {}
): boolean {
  const env = options.env ?? process.env;
  if (!isPasskeyHttpEnabled(env)) return false;

  const rpId = env.CLAWQL_PASSKEY_RP_ID?.trim();
  const origin = env.CLAWQL_PASSKEY_ORIGIN?.trim();
  if (!rpId || !origin) {
    process.stderr.write(
      "[clawql] CLAWQL_PASSKEY_ENABLED=1 requires CLAWQL_PASSKEY_RP_ID and CLAWQL_PASSKEY_ORIGIN\n"
    );
    return false;
  }

  const attachOptions: AttachPasskeyRoutesOptions = {
    credentials: resolvePasskeyCredentialStore(),
    secretStore: resolveSecretStore(),
    rpId,
    origin,
    adminAuth: options.adminAuth,
  };
  attachPasskeyRoutes(app, attachOptions);
  return true;
}
