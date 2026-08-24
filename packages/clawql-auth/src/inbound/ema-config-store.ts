/**
 * Persistent EMA org configuration — IdP trust + group→scope mappings.
 */

import { readFileSync } from "node:fs";

import type { SecretStore } from "../stores/types.js";
import type { EmaConfigStore, EmaOrgConfig } from "./id-jag.js";
import { buildOktaEmaOrgConfig, type OktaEmaOrgParams } from "./okta-id-jag.js";

export const EMA_ORG_SECRET_PREFIX = "ema-orgs/";

export type EmaOrgConfigInput =
  EmaOrgConfig | (OktaEmaOrgParams & { provider?: "okta" | "custom" });

function normalizeOrgInput(input: EmaOrgConfigInput): EmaOrgConfig {
  if ("idpJwksUri" in input && input.idpJwksUri) {
    return input as EmaOrgConfig;
  }
  const withProvider = input as OktaEmaOrgParams & { provider?: string };
  if (
    withProvider.provider === "okta" ||
    ("oktaDomain" in withProvider && typeof withProvider.oktaDomain === "string")
  ) {
    return buildOktaEmaOrgConfig(withProvider);
  }
  throw new Error("ema_org_config_invalid: expected EmaOrgConfig or OktaEmaOrgParams");
}

function emaOrgPath(orgId: string): string {
  return `${EMA_ORG_SECRET_PREFIX}${orgId.trim()}`;
}

export type SecretStoreEmaConfigStore = EmaConfigStore & {
  saveOrgConfig: (config: EmaOrgConfigInput) => Promise<EmaOrgConfig>;
  deleteOrgConfig: (orgId: string) => Promise<void>;
  listOrgIds: () => Promise<string[]>;
};

/**
 * SecretStore-backed {@link EmaConfigStore} — one JSON blob per org at `ema-orgs/{orgId}`.
 */
export function createSecretStoreEmaConfigStore(store: SecretStore): SecretStoreEmaConfigStore {
  return {
    async getOrgConfig(orgId) {
      const raw = await store.getSecret(emaOrgPath(orgId));
      if (!raw) return null;
      try {
        return normalizeOrgInput(JSON.parse(raw) as EmaOrgConfigInput);
      } catch {
        return null;
      }
    },

    async saveOrgConfig(input) {
      const config = normalizeOrgInput(input);
      await store.setSecret(emaOrgPath(config.orgId), JSON.stringify(config));
      return config;
    },

    async deleteOrgConfig(orgId) {
      await store.deleteSecret(emaOrgPath(orgId));
    },

    async listOrgIds() {
      const paths = await store.listSecrets(EMA_ORG_SECRET_PREFIX);
      return paths
        .map((p) => p.slice(EMA_ORG_SECRET_PREFIX.length))
        .filter(Boolean)
        .sort();
    },
  };
}

/**
 * Composite store: memory/file bootstrap entries, then SecretStore (store wins on conflict).
 */
export function createCompositeEmaConfigStore(
  primary: EmaConfigStore,
  ...fallbacks: EmaConfigStore[]
): EmaConfigStore {
  return {
    async getOrgConfig(orgId) {
      for (const store of [primary, ...fallbacks]) {
        const found = await store.getOrgConfig(orgId);
        if (found) return found;
      }
      return null;
    },
  };
}

export function loadEmaOrgsFromJson(raw: string): EmaOrgConfig[] {
  const parsed = JSON.parse(raw) as { orgs?: EmaOrgConfigInput[] } | EmaOrgConfigInput[];
  const list = Array.isArray(parsed) ? parsed : (parsed.orgs ?? []);
  return list.map((entry) => normalizeOrgInput(entry));
}

export function loadEmaOrgsFromJsonFile(path: string): EmaOrgConfig[] {
  return loadEmaOrgsFromJson(readFileSync(path, "utf8"));
}

/** Bootstrap org configs from JSON into SecretStore (skip existing unless `overwrite`). */
export async function bootstrapEmaOrgsToStore(
  store: SecretStoreEmaConfigStore,
  configs: EmaOrgConfigInput[],
  options?: { overwrite?: boolean }
): Promise<number> {
  let written = 0;
  for (const input of configs) {
    const config = normalizeOrgInput(input);
    if (!options?.overwrite) {
      const existing = await store.getOrgConfig(config.orgId);
      if (existing) continue;
    }
    await store.saveOrgConfig(config);
    written += 1;
  }
  return written;
}
