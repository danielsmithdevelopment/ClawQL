/**
 * Persistent EMA org configuration — IdP trust + group→scope mappings.
 *
 * Effect-primary: `id-jag.ts`'s {@link EmaConfigStore.getOrgConfig} is `yield*`ed by
 * `mcp-oauth.ts` (owned elsewhere) without a `mapError`, so it (and the admin CRUD added
 * by {@link SecretStoreEmaConfigStore}) declare `Effect.Effect<A>` (never-erroring) —
 * every {@link SecretStore} call runs through Effect via `yield*`, with IO failures
 * lifted to a defect via `Effect.orDie` rather than surfaced through the error channel.
 */

import { readFileSync } from "node:fs";
import { Effect } from "effect";

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
  saveOrgConfig: (config: EmaOrgConfigInput) => Effect.Effect<EmaOrgConfig>;
  deleteOrgConfig: (orgId: string) => Effect.Effect<void>;
  listOrgIds: () => Effect.Effect<string[]>;
};

/**
 * SecretStore-backed {@link EmaConfigStore} — one JSON blob per org at `ema-orgs/{orgId}`.
 */
export function createSecretStoreEmaConfigStore(store: SecretStore): SecretStoreEmaConfigStore {
  return {
    getOrgConfig: (orgId) =>
      Effect.gen(function* () {
        const raw = yield* store.getSecret(emaOrgPath(orgId));
        if (!raw) return null;
        try {
          return normalizeOrgInput(JSON.parse(raw) as EmaOrgConfigInput);
        } catch {
          return null;
        }
      }).pipe(Effect.orDie),

    saveOrgConfig: (input) => {
      const config = normalizeOrgInput(input);
      return store.setSecret(emaOrgPath(config.orgId), JSON.stringify(config)).pipe(
        Effect.map(() => config),
        Effect.orDie
      );
    },

    deleteOrgConfig: (orgId) => store.deleteSecret(emaOrgPath(orgId)).pipe(Effect.orDie),

    listOrgIds: () =>
      Effect.gen(function* () {
        const paths = yield* store.listSecrets(EMA_ORG_SECRET_PREFIX);
        return paths
          .map((p) => p.slice(EMA_ORG_SECRET_PREFIX.length))
          .filter(Boolean)
          .sort();
      }).pipe(Effect.orDie),
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
    getOrgConfig: (orgId) =>
      Effect.gen(function* () {
        for (const store of [primary, ...fallbacks]) {
          const found = yield* store.getOrgConfig(orgId);
          if (found) return found;
        }
        return null;
      }),
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
export function bootstrapEmaOrgsToStoreEffect(
  store: SecretStoreEmaConfigStore,
  configs: EmaOrgConfigInput[],
  options?: { overwrite?: boolean }
): Effect.Effect<number> {
  return Effect.gen(function* () {
    let written = 0;
    for (const input of configs) {
      const config = normalizeOrgInput(input);
      if (!options?.overwrite) {
        const existing = yield* store.getOrgConfig(config.orgId);
        if (existing) continue;
      }
      yield* store.saveOrgConfig(config);
      written += 1;
    }
    return written;
  });
}
