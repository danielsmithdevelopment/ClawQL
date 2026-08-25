/**
 * EMA connector registry — admin-authorized MCP connectors per org.
 * Persists in SecretStore so the same backend as EMA org config applies.
 *
 * Effect-primary: `id-jag-issuer.ts` `yield*`s {@link EmaConnectorRegistry.get} directly
 * without a `mapError`, so every method declares `Effect.Effect<A>` (never-erroring) —
 * {@link createSecretStoreEmaConnectorRegistry} runs every {@link SecretStore} call through
 * Effect via `yield*`, lifting IO failures to a defect via `Effect.orDie`.
 */

import { Effect } from "effect";

import type { SecretStore } from "../stores/types.js";
import type { EmaConnectorRegistration } from "./id-jag-issuer.js";

export const EMA_CONNECTOR_SECRET_PREFIX = "ema-connectors/";

function connectorPath(orgId: string, connectorId: string): string {
  return `${EMA_CONNECTOR_SECRET_PREFIX}${orgId.trim()}/${connectorId.trim()}`;
}

function orgPrefix(orgId: string): string {
  return `${EMA_CONNECTOR_SECRET_PREFIX}${orgId.trim()}/`;
}

export type EmaConnectorRegistry = {
  get: (orgId: string, connectorId: string) => Effect.Effect<EmaConnectorRegistration | null>;
  save: (registration: EmaConnectorRegistration) => Effect.Effect<EmaConnectorRegistration>;
  delete: (orgId: string, connectorId: string) => Effect.Effect<void>;
  list: (orgId: string) => Effect.Effect<EmaConnectorRegistration[]>;
};

export type SecretStoreEmaConnectorRegistry = EmaConnectorRegistry;

function normalizeRegistration(input: EmaConnectorRegistration): EmaConnectorRegistration {
  const orgId = input.orgId?.trim();
  const connectorId = input.connectorId?.trim();
  if (!orgId) throw new Error("ema_connector_missing_org_id");
  if (!connectorId) throw new Error("ema_connector_missing_connector_id");
  const audience = input.audience;
  if (
    audience === undefined ||
    (Array.isArray(audience) ? audience.length === 0 : !String(audience).trim())
  ) {
    throw new Error("ema_connector_missing_audience");
  }
  return {
    connectorId,
    orgId,
    audience,
    label: input.label?.trim() || undefined,
    enabled: input.enabled !== false,
    createdAt: input.createdAt?.trim() || new Date().toISOString(),
  };
}

/**
 * SecretStore-backed connector registry at `ema-connectors/{orgId}/{connectorId}`.
 */
export function createSecretStoreEmaConnectorRegistry(
  store: SecretStore
): SecretStoreEmaConnectorRegistry {
  return {
    get: (orgId, connectorId) =>
      Effect.gen(function* () {
        const raw = yield* store.getSecret(connectorPath(orgId, connectorId));
        if (!raw) return null;
        try {
          return normalizeRegistration(JSON.parse(raw) as EmaConnectorRegistration);
        } catch {
          return null;
        }
      }).pipe(Effect.orDie),

    save: (input) => {
      const registration = normalizeRegistration(input);
      return store
        .setSecret(
          connectorPath(registration.orgId, registration.connectorId),
          JSON.stringify(registration)
        )
        .pipe(
          Effect.map(() => registration),
          Effect.orDie
        );
    },

    delete: (orgId, connectorId) =>
      store.deleteSecret(connectorPath(orgId, connectorId)).pipe(Effect.orDie),

    list: (orgId) =>
      Effect.gen(function* () {
        const paths = yield* store.listSecrets(orgPrefix(orgId));
        const out: EmaConnectorRegistration[] = [];
        for (const path of paths) {
          const raw = yield* store.getSecret(path);
          if (!raw) continue;
          try {
            out.push(normalizeRegistration(JSON.parse(raw) as EmaConnectorRegistration));
          } catch {
            // skip corrupt entries
          }
        }
        return out.sort((a, b) => a.connectorId.localeCompare(b.connectorId));
      }).pipe(Effect.orDie),
  };
}

/** In-memory connector registry for tests. */
export function createMemoryEmaConnectorRegistry(
  initial: EmaConnectorRegistration[] = []
): EmaConnectorRegistry & { readonly map: Map<string, EmaConnectorRegistration> } {
  const map = new Map<string, EmaConnectorRegistration>();
  for (const entry of initial) {
    const reg = normalizeRegistration(entry);
    map.set(`${reg.orgId}/${reg.connectorId}`, reg);
  }
  return {
    map,
    get: (orgId, connectorId) =>
      Effect.sync(() => map.get(`${orgId.trim()}/${connectorId.trim()}`) ?? null),
    save: (input) =>
      Effect.sync(() => {
        const registration = normalizeRegistration(input);
        map.set(`${registration.orgId}/${registration.connectorId}`, registration);
        return registration;
      }),
    delete: (orgId, connectorId) =>
      Effect.sync(() => {
        map.delete(`${orgId.trim()}/${connectorId.trim()}`);
      }),
    list: (orgId) =>
      Effect.sync(() => {
        const prefix = `${orgId.trim()}/`;
        return [...map.entries()]
          .filter(([key]) => key.startsWith(prefix))
          .map(([, value]) => value)
          .sort((a, b) => a.connectorId.localeCompare(b.connectorId));
      }),
  };
}
