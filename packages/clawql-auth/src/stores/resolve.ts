/**
 * SecretStore factory — pick a backend from options or env.
 *
 * Env:
 * - `CLAWQL_SECRET_STORE=sqlite|memory|env|hashicorp-vault|openbao|infisical|vaultwarden|onepassword`
 * - SQLite path: `CLAWQL_SECRET_STORE_PATH` (default `~/.clawql/secrets.db` or `$CLAWQL_HOME/secrets.db`)
 * - Vault/OpenBao: `VAULT_ADDR` / `BAO_ADDR`, `VAULT_TOKEN` / `BAO_TOKEN`, optional `CLAWQL_VAULT_MOUNT`
 */

import { createEnvSecretStore } from "./env.js";
import { createHashiCorpVaultStore } from "./hashicorp-vault.js";
import { createInfisicalStore } from "./infisical.js";
import { createMemorySecretStore } from "./memory.js";
import { createOnePasswordStore } from "./onepassword.js";
import { createOpenBaoStore } from "./openbao.js";
import { createSQLiteSecretStore, defaultSQLiteSecretPath } from "./sqlite.js";
import type { SecretStore, SecretStoreKind } from "./types.js";
import { createVaultwardenStore } from "./vaultwarden.js";

export type ResolveSecretStoreOptions = {
  kind?: SecretStoreKind;
  /** Explicit store instance — wins over kind/env. */
  store?: SecretStore;
  sqlitePath?: string;
};

export function resolveSecretStoreKind(explicit?: SecretStoreKind): SecretStoreKind {
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
}

/**
 * Build the configured SecretStore. Default is SQLite (local / Hermes / homelab).
 */
export function resolveSecretStore(options: ResolveSecretStoreOptions = {}): SecretStore {
  if (options.store) return options.store;
  const kind = resolveSecretStoreKind(options.kind);

  switch (kind) {
    case "memory":
      return createMemorySecretStore();
    case "env":
      return createEnvSecretStore({ allowOverlayWrites: false });
    case "hashicorp-vault": {
      const endpoint = process.env.VAULT_ADDR?.trim();
      const token = process.env.VAULT_TOKEN?.trim();
      if (!endpoint || !token) {
        throw new Error("hashicorp_vault_requires_VAULT_ADDR_and_VAULT_TOKEN");
      }
      return createHashiCorpVaultStore({
        endpoint,
        token,
        mountPath: process.env.CLAWQL_VAULT_MOUNT?.trim() || "secret",
        pathPrefix: process.env.CLAWQL_VAULT_PREFIX?.trim() || "clawql",
      });
    }
    case "openbao": {
      const endpoint = process.env.BAO_ADDR?.trim() || process.env.VAULT_ADDR?.trim();
      const token = process.env.BAO_TOKEN?.trim() || process.env.VAULT_TOKEN?.trim();
      if (!endpoint || !token) {
        throw new Error("openbao_requires_BAO_ADDR_and_BAO_TOKEN");
      }
      return createOpenBaoStore({
        endpoint,
        token,
        mountPath: process.env.CLAWQL_VAULT_MOUNT?.trim() || "secret",
        pathPrefix: process.env.CLAWQL_VAULT_PREFIX?.trim() || "clawql",
      });
    }
    case "infisical": {
      const clientId = process.env.INFISICAL_CLIENT_ID?.trim();
      const clientSecret = process.env.INFISICAL_CLIENT_SECRET?.trim();
      const projectId = process.env.INFISICAL_PROJECT_ID?.trim();
      if (!clientId || !clientSecret || !projectId) {
        throw new Error("infisical_requires_client_id_secret_project");
      }
      return createInfisicalStore({ clientId, clientSecret, projectId });
    }
    case "vaultwarden": {
      const endpoint = process.env.VAULTWARDEN_ADDR?.trim();
      const accessToken = process.env.VAULTWARDEN_TOKEN?.trim();
      if (!endpoint || !accessToken) {
        throw new Error("vaultwarden_requires_VAULTWARDEN_ADDR_and_TOKEN");
      }
      return createVaultwardenStore({
        endpoint,
        accessToken,
        organizationId: process.env.VAULTWARDEN_ORG_ID?.trim(),
        projectId: process.env.VAULTWARDEN_PROJECT_ID?.trim(),
        mode: process.env.VAULTWARDEN_MODE === "http" ? "http" : "cache",
      });
    }
    case "onepassword": {
      const endpoint = process.env.OP_CONNECT_HOST?.trim();
      const token = process.env.OP_CONNECT_TOKEN?.trim();
      const vaultId = process.env.OP_VAULT_ID?.trim();
      if (!endpoint || !token || !vaultId) {
        throw new Error("onepassword_requires_OP_CONNECT_HOST_TOKEN_VAULT_ID");
      }
      return createOnePasswordStore({ endpoint, token, vaultId });
    }
    case "sqlite":
    default:
      return createSQLiteSecretStore({
        path:
          options.sqlitePath ||
          process.env.CLAWQL_SECRET_STORE_PATH?.trim() ||
          defaultSQLiteSecretPath(),
      });
  }
}
