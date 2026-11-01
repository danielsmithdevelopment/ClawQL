/**
 * SecretStore factory — pick a backend from options or env.
 *
 * Env:
 * - `CLAWQL_SECRET_STORE=sqlite|memory|env|hashicorp-vault|openbao|infisical|vaultwarden|onepassword`
 * - SQLite path: `CLAWQL_SECRET_STORE_PATH` (default `~/.clawql/secrets.db` or `$CLAWQL_HOME/secrets.db`)
 * - Vault/OpenBao: `VAULT_ADDR` / `BAO_ADDR`, `VAULT_TOKEN` / `BAO_TOKEN`, optional `CLAWQL_VAULT_MOUNT`
 * - Transit (encrypt-at-rest over any backend): set `CLAWQL_VAULT_TRANSIT_KEY` (+ addr/token);
 *   optional `CLAWQL_VAULT_TRANSIT_MOUNT` (default `transit`),
 *   `CLAWQL_VAULT_TRANSIT_TENANT`, `CLAWQL_VAULT_TRANSIT_CACHE_TTL_MS` (default 30000)
 *
 * `resolveSecretStore` is a sync construction helper (no IO — it just picks and
 * `new`s a backend, each of which is Effect-primary on its own methods). The env
 * flag reader it depends on, {@link resolveSecretStoreKindEffect}, is `Effect.sync`.
 */

import { Effect } from "effect";

import { createVaultTransitProvider } from "../vault/transit.js";
import { createEnvSecretStore } from "./env.js";
import { createHashiCorpVaultStore } from "./hashicorp-vault.js";
import { createInfisicalStore } from "./infisical.js";
import { createMemorySecretStore } from "./memory.js";
import { createOnePasswordStore } from "./onepassword.js";
import { createOpenBaoStore } from "./openbao.js";
import { createSQLiteSecretStore, defaultSQLiteSecretPath } from "./sqlite.js";
import { createTransitEncryptedSecretStore } from "./transit-encrypted.js";
import type { SecretStore, SecretStoreKind } from "./types.js";
import { createVaultwardenStore } from "./vaultwarden.js";

export type ResolveSecretStoreOptions = {
  kind?: SecretStoreKind;
  /** Explicit store instance — wins over kind/env. */
  store?: SecretStore;
  sqlitePath?: string;
  /**
   * When true, wrap the resolved store with Vault Transit encrypt-at-rest.
   * Default: wrap when `CLAWQL_VAULT_TRANSIT_KEY` is set.
   */
  vaultTransit?: boolean;
  /** Transit key name override (default `CLAWQL_VAULT_TRANSIT_KEY`). */
  vaultTransitKey?: string;
  /** Fallback tenant for Transit derived-key context. */
  vaultTransitTenantId?: string;
  /** In-memory decrypt cache TTL (ms); 0 disables. */
  vaultTransitCacheTtlMs?: number;
};

export type WrapSecretStoreWithVaultTransitOptions = {
  vaultAddr?: string;
  vaultToken?: string;
  mountPath?: string;
  keyName: string;
  tenantId?: string;
  decryptCacheTtlMs?: number;
};

/** Effect: resolve the configured store kind from `explicit` or `CLAWQL_SECRET_STORE`. */
export function resolveSecretStoreKindEffect(
  explicit?: SecretStoreKind
): Effect.Effect<SecretStoreKind, never> {
  return Effect.sync(() => {
    if (explicit) return explicit;
    const raw = process.env.CLAWQL_SECRET_STORE?.trim().toLowerCase();
    if (raw === "vault" || raw === "hashicorp-vault") return "hashicorp-vault";
    if (raw === "1password" || raw === "onepassword") return "onepassword";
    if (
      raw === "sqlite" ||
      raw === "memory" ||
      raw === "env" ||
      raw === "openbao" ||
      raw === "infisical" ||
      raw === "vaultwarden"
    ) {
      return raw;
    }
    return "sqlite";
  });
}

/** Sync convenience wrapper for callers that just need the resolved kind (never fails). */
export function resolveSecretStoreKind(explicit?: SecretStoreKind): SecretStoreKind {
  return Effect.runSync(resolveSecretStoreKindEffect(explicit));
}

/**
 * Wrap any SecretStore so values are Vault Transit ciphertext at rest.
 * Sync construction; encrypt/decrypt IO stays on the Effect methods.
 */
export function wrapSecretStoreWithVaultTransit(
  inner: SecretStore,
  options: WrapSecretStoreWithVaultTransitOptions
): SecretStore {
  const endpoint =
    options.vaultAddr?.trim() || process.env.VAULT_ADDR?.trim() || process.env.BAO_ADDR?.trim();
  const token =
    options.vaultToken?.trim() || process.env.VAULT_TOKEN?.trim() || process.env.BAO_TOKEN?.trim();
  if (!endpoint || !token) {
    throw new Error("vault_transit_requires_VAULT_ADDR_and_VAULT_TOKEN");
  }
  const transit = createVaultTransitProvider({
    vaultAddr: endpoint,
    vaultToken: token,
    mountPath:
      options.mountPath?.trim() || process.env.CLAWQL_VAULT_TRANSIT_MOUNT?.trim() || "transit",
    keyName: options.keyName.trim(),
  });
  return createTransitEncryptedSecretStore({
    inner,
    transit,
    tenantId: options.tenantId,
    decryptCacheTtlMs: options.decryptCacheTtlMs,
  });
}

function maybeWrapVaultTransit(
  store: SecretStore,
  options: ResolveSecretStoreOptions
): SecretStore {
  const keyName = options.vaultTransitKey?.trim() || process.env.CLAWQL_VAULT_TRANSIT_KEY?.trim();
  const enabled =
    options.vaultTransit === true || (options.vaultTransit !== false && Boolean(keyName));
  if (!enabled) return store;
  if (!keyName) {
    throw new Error("vault_transit_requires_CLAWQL_VAULT_TRANSIT_KEY");
  }
  return wrapSecretStoreWithVaultTransit(store, {
    keyName,
    tenantId: options.vaultTransitTenantId,
    decryptCacheTtlMs: options.vaultTransitCacheTtlMs,
  });
}

/**
 * Build the configured SecretStore. Default is SQLite (local / Hermes / homelab).
 * Sync construction; the returned store's CRUD/lifecycle methods are Effect-primary.
 * When `CLAWQL_VAULT_TRANSIT_KEY` is set, values are encrypted with Vault Transit
 * before they hit the inner backend (SQLite, Vault KV, …).
 */
export function resolveSecretStore(options: ResolveSecretStoreOptions = {}): SecretStore {
  if (options.store) return maybeWrapVaultTransit(options.store, options);
  const kind = resolveSecretStoreKind(options.kind);

  let store: SecretStore;
  switch (kind) {
    case "memory":
      store = createMemorySecretStore();
      break;
    case "env":
      store = createEnvSecretStore({ allowOverlayWrites: false });
      break;
    case "hashicorp-vault": {
      const endpoint = process.env.VAULT_ADDR?.trim();
      const token = process.env.VAULT_TOKEN?.trim();
      if (!endpoint || !token) {
        throw new Error("hashicorp_vault_requires_VAULT_ADDR_and_VAULT_TOKEN");
      }
      store = createHashiCorpVaultStore({
        endpoint,
        token,
        mountPath: process.env.CLAWQL_VAULT_MOUNT?.trim() || "secret",
        pathPrefix: process.env.CLAWQL_VAULT_PREFIX?.trim() || "clawql",
      });
      break;
    }
    case "openbao": {
      const endpoint = process.env.BAO_ADDR?.trim() || process.env.VAULT_ADDR?.trim();
      const token = process.env.BAO_TOKEN?.trim() || process.env.VAULT_TOKEN?.trim();
      if (!endpoint || !token) {
        throw new Error("openbao_requires_BAO_ADDR_and_BAO_TOKEN");
      }
      store = createOpenBaoStore({
        endpoint,
        token,
        mountPath: process.env.CLAWQL_VAULT_MOUNT?.trim() || "secret",
        pathPrefix: process.env.CLAWQL_VAULT_PREFIX?.trim() || "clawql",
      });
      break;
    }
    case "infisical": {
      const clientId = process.env.INFISICAL_CLIENT_ID?.trim();
      const clientSecret = process.env.INFISICAL_CLIENT_SECRET?.trim();
      const projectId = process.env.INFISICAL_PROJECT_ID?.trim();
      if (!clientId || !clientSecret || !projectId) {
        throw new Error("infisical_requires_client_id_secret_project");
      }
      store = createInfisicalStore({ clientId, clientSecret, projectId });
      break;
    }
    case "vaultwarden": {
      const endpoint = process.env.VAULTWARDEN_ADDR?.trim();
      const accessToken = process.env.VAULTWARDEN_TOKEN?.trim();
      if (!endpoint || !accessToken) {
        throw new Error("vaultwarden_requires_VAULTWARDEN_ADDR_and_TOKEN");
      }
      store = createVaultwardenStore({
        endpoint,
        accessToken,
        organizationId: process.env.VAULTWARDEN_ORG_ID?.trim(),
        projectId: process.env.VAULTWARDEN_PROJECT_ID?.trim(),
        mode: process.env.VAULTWARDEN_MODE === "http" ? "http" : "cache",
      });
      break;
    }
    case "onepassword": {
      const endpoint = process.env.OP_CONNECT_HOST?.trim();
      const token = process.env.OP_CONNECT_TOKEN?.trim();
      const vaultId = process.env.OP_VAULT_ID?.trim();
      if (!endpoint || !token || !vaultId) {
        throw new Error("onepassword_requires_OP_CONNECT_HOST_TOKEN_VAULT_ID");
      }
      store = createOnePasswordStore({ endpoint, token, vaultId });
      break;
    }
    case "sqlite":
    default:
      store = createSQLiteSecretStore({
        path:
          options.sqlitePath ||
          process.env.CLAWQL_SECRET_STORE_PATH?.trim() ||
          defaultSQLiteSecretPath(),
      });
      break;
  }
  return maybeWrapVaultTransit(store, options);
}
