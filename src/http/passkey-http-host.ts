/**
 * Host wiring for primary passkey HTTP routes (`CLAWQL_PASSKEY_ENABLED=1`).
 * Dynamic-imports clawql-auth so Ready listen does not evaluate inbound AS / SIWE.
 */

import type { Express } from "express";

type PasskeyCredentialStore = import("clawql-auth").PasskeyCredentialStore;
type McpOAuthAdminAuth = import("clawql-auth").McpOAuthAdminAuth;

let processPasskeyStore: PasskeyCredentialStore | null = null;

export function isPasskeyHttpEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const v = env.CLAWQL_PASSKEY_ENABLED?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

async function resolvePasskeyCredentialStore(): Promise<PasskeyCredentialStore> {
  if (!processPasskeyStore) {
    const auth = await import("clawql-auth");
    processPasskeyStore = auth.createMemoryPasskeyCredentialStore();
  }
  return processPasskeyStore;
}

export async function attachHostPasskeyRoutes(
  app: Express,
  options: {
    adminAuth?: McpOAuthAdminAuth;
    env?: NodeJS.ProcessEnv;
  } = {}
): Promise<boolean> {
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

  const auth = await import("clawql-auth");
  auth.attachPasskeyRoutes(app, {
    credentials: await resolvePasskeyCredentialStore(),
    secretStore: auth.resolveSecretStore(),
    rpId,
    origin,
    adminAuth: options.adminAuth,
  });
  return true;
}
