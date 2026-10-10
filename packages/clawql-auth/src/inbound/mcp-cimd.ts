/**
 * MCP OAuth §3 — Client ID Metadata Documents (CIMD) + trusted-client list.
 *
 * A client_id that is an HTTPS URL is fetched, validated, and must appear on
 * the operator trusted-client list (or allowlist). Fail closed.
 */

import { createHash } from "node:crypto";
import { Context, Data, Effect, Layer } from "effect";
import type { SecretStore } from "../stores/types.js";
import type { McpClientRegistry, McpRegisteredClient, McpTrustedClientRecord } from "./mcp-oauth.js";
import type { SecretStoreMcpClientRegistry } from "./mcp-oauth-stores.js";

export class CimdError extends Data.TaggedError("CimdError")<{
  readonly reason: string;
}> {}

export type CimdDocument = {
  readonly client_id: string;
  readonly redirect_uris: readonly string[];
  readonly client_name?: string;
  readonly token_endpoint_auth_method?: string;
};

export type TrustedClientStore = {
  readonly get: (clientIdUrl: string) => Effect.Effect<McpTrustedClientRecord | null>;
  readonly upsert: (record: McpTrustedClientRecord) => Effect.Effect<void>;
  readonly list: () => Effect.Effect<readonly McpTrustedClientRecord[]>;
};

/** Fetch a CIMD JSON document (injectable for tests). */
export type CimdDocumentFetch = (clientIdUrl: string) => Effect.Effect<unknown, CimdError>;

export const MCP_OAUTH_TRUSTED_CLIENT_PREFIX = "mcp-oauth/trusted-clients/";

function trustedClientPath(clientIdUrl: string): string {
  const key = createHash("sha256").update(clientIdUrl).digest("hex");
  return `${MCP_OAUTH_TRUSTED_CLIENT_PREFIX}${key}`;
}

export function createMemoryTrustedClientStore(
  initial: readonly McpTrustedClientRecord[] = []
): TrustedClientStore {
  const map = new Map(initial.map((r) => [r.clientIdUrl, r]));
  return {
    get: (url) => Effect.sync(() => map.get(url) ?? null),
    upsert: (record) =>
      Effect.sync(() => {
        map.set(record.clientIdUrl, record);
      }),
    list: () => Effect.sync(() => [...map.values()]),
  };
}

/** SecretStore-backed trusted-client list (operator allowlist). */
export function createSecretStoreTrustedClientStore(store: SecretStore): TrustedClientStore {
  return {
    get: (clientIdUrl) =>
      Effect.gen(function* () {
        const raw = yield* store.getSecret(trustedClientPath(clientIdUrl));
        if (!raw) return null;
        try {
          const parsed = JSON.parse(raw) as McpTrustedClientRecord;
          return parsed.clientIdUrl === clientIdUrl ? parsed : null;
        } catch {
          return null;
        }
      }).pipe(Effect.orDie),
    upsert: (record) =>
      store
        .setSecret(trustedClientPath(record.clientIdUrl), JSON.stringify(record))
        .pipe(Effect.orDie),
    list: () =>
      Effect.gen(function* () {
        const paths = yield* store.listSecrets(MCP_OAUTH_TRUSTED_CLIENT_PREFIX);
        const out: McpTrustedClientRecord[] = [];
        for (const path of paths) {
          const raw = yield* store.getSecret(path);
          if (!raw) continue;
          try {
            out.push(JSON.parse(raw) as McpTrustedClientRecord);
          } catch {
            /* skip corrupt */
          }
        }
        return out;
      }).pipe(Effect.orDie),
  };
}

export function isHttpsClientIdUrl(clientId: string): boolean {
  try {
    const u = new URL(clientId);
    return u.protocol === "https:" && Boolean(u.hostname);
  } catch {
    return false;
  }
}

export function parseCimdDocumentEffect(raw: unknown): Effect.Effect<CimdDocument, CimdError> {
  return Effect.gen(function* () {
    if (!raw || typeof raw !== "object") {
      return yield* Effect.fail(new CimdError({ reason: "invalid_document" }));
    }
    const o = raw as Record<string, unknown>;
    const client_id = typeof o.client_id === "string" ? o.client_id.trim() : "";
    if (!client_id || !isHttpsClientIdUrl(client_id)) {
      return yield* Effect.fail(new CimdError({ reason: "invalid_client_id" }));
    }
    const redirect_uris = Array.isArray(o.redirect_uris)
      ? o.redirect_uris.filter((u): u is string => typeof u === "string" && u.length > 0)
      : [];
    if (redirect_uris.length === 0) {
      return yield* Effect.fail(new CimdError({ reason: "missing_redirect_uris" }));
    }
    return {
      client_id,
      redirect_uris,
      client_name: typeof o.client_name === "string" ? o.client_name : undefined,
      token_endpoint_auth_method:
        typeof o.token_endpoint_auth_method === "string"
          ? o.token_endpoint_auth_method
          : undefined,
    };
  });
}

/**
 * Resolve a CIMD client: must be trusted, document client_id must match URL,
 * redirect_uris must be a subset of the trusted record (or equal when pinning).
 */
export function resolveTrustedCimdClientEffect(
  clientIdUrl: string,
  document: CimdDocument,
  trusted: McpTrustedClientRecord | null
): Effect.Effect<McpTrustedClientRecord, CimdError> {
  return Effect.gen(function* () {
    if (!trusted) {
      return yield* Effect.fail(new CimdError({ reason: "client_not_trusted" }));
    }
    if (trusted.clientIdUrl !== clientIdUrl || document.client_id !== clientIdUrl) {
      return yield* Effect.fail(new CimdError({ reason: "client_id_mismatch" }));
    }
    for (const uri of document.redirect_uris) {
      if (!trusted.redirectUris.includes(uri)) {
        return yield* Effect.fail(new CimdError({ reason: "redirect_uri_not_trusted" }));
      }
    }
    const documentSha256 = createHash("sha256")
      .update(JSON.stringify(document))
      .digest("hex");
    return {
      ...trusted,
      documentSha256,
    };
  });
}

/**
 * HTTPS GET of `client_id` URL. Fail closed on non-2xx, redirects, or non-HTTPS final URL.
 */
export function defaultCimdDocumentFetch(clientIdUrl: string): Effect.Effect<unknown, CimdError> {
  return Effect.tryPromise({
    try: async () => {
      const res = await fetch(clientIdUrl, {
        method: "GET",
        headers: { Accept: "application/json" },
        redirect: "error",
        signal: AbortSignal.timeout(5_000),
      });
      if (!res.ok) {
        throw new Error(`http_${res.status}`);
      }
      const finalUrl = res.url || clientIdUrl;
      if (!isHttpsClientIdUrl(finalUrl) || finalUrl !== clientIdUrl) {
        throw new Error("url_mismatch");
      }
      return (await res.json()) as unknown;
    },
    catch: (cause) =>
      new CimdError({
        reason: cause instanceof Error ? cause.message : "fetch_failed",
      }),
  });
}

/** Default scopes for public CIMD clients registered from a trusted document. */
export const CIMD_DEFAULT_SCOPES = ["execute", "search", "mcp:tools"] as const;

/**
 * Fetch + validate CIMD, then materialize a public {@link McpRegisteredClient}.
 * Does not persist — callers that own a writable registry should `saveClient`.
 */
export function resolveCimdRegisteredClientEffect(
  clientIdUrl: string,
  trustedStore: TrustedClientStore,
  fetchDocument: CimdDocumentFetch = defaultCimdDocumentFetch,
  defaultScope: readonly string[] = CIMD_DEFAULT_SCOPES
): Effect.Effect<McpRegisteredClient, CimdError> {
  return Effect.gen(function* () {
    if (!isHttpsClientIdUrl(clientIdUrl)) {
      return yield* Effect.fail(new CimdError({ reason: "client_id_not_https_url" }));
    }
    const raw = yield* fetchDocument(clientIdUrl);
    const doc = yield* parseCimdDocumentEffect(raw);
    const trusted = yield* trustedStore.get(clientIdUrl);
    const resolved = yield* resolveTrustedCimdClientEffect(clientIdUrl, doc, trusted);
    yield* trustedStore.upsert(resolved);
    return {
      clientId: clientIdUrl,
      defaultScope: [...defaultScope],
      redirectUris: [...doc.redirect_uris],
      defaultRole: "operator",
    } satisfies McpRegisteredClient;
  });
}

/**
 * Client registry that falls back to CIMD fetch for HTTPS `client_id` URLs.
 * When `writable` is set, successful resolutions are persisted for subsequent lookups.
 */
export function createCimdClientRegistry(
  base: McpClientRegistry,
  trustedStore: TrustedClientStore,
  options?: {
    readonly fetchDocument?: CimdDocumentFetch;
    readonly writable?: SecretStoreMcpClientRegistry;
    readonly defaultScope?: readonly string[];
  }
): McpClientRegistry {
  const fetchDocument = options?.fetchDocument ?? defaultCimdDocumentFetch;
  const defaultScope = options?.defaultScope ?? CIMD_DEFAULT_SCOPES;
  return {
    getClient: (clientId) =>
      Effect.gen(function* () {
        const existing = yield* base.getClient(clientId);
        if (existing) return existing;
        if (!isHttpsClientIdUrl(clientId)) return null;
        const registered = yield* resolveCimdRegisteredClientEffect(
          clientId,
          trustedStore,
          fetchDocument,
          defaultScope
        ).pipe(Effect.catch(() => Effect.succeed(null)));
        if (!registered) return null;
        if (options?.writable) {
          yield* options.writable.saveClient(registered);
        }
        return registered;
      }),
  };
}

export class CimdService extends Context.Service<
  CimdService,
  {
    readonly resolve: (
      clientIdUrl: string,
      documentJson: unknown
    ) => Effect.Effect<McpTrustedClientRecord, CimdError>;
    readonly resolveRegistered: (
      clientIdUrl: string
    ) => Effect.Effect<McpRegisteredClient, CimdError>;
  }
>()("clawql/CimdService") {}

export function cimdServiceLayer(
  store: TrustedClientStore,
  fetchDocument: CimdDocumentFetch = defaultCimdDocumentFetch
): Layer.Layer<CimdService> {
  return Layer.succeed(
    CimdService,
    CimdService.of({
      resolve: (clientIdUrl, documentJson) =>
        Effect.gen(function* () {
          if (!isHttpsClientIdUrl(clientIdUrl)) {
            return yield* Effect.fail(new CimdError({ reason: "client_id_not_https_url" }));
          }
          const doc = yield* parseCimdDocumentEffect(documentJson);
          const trusted = yield* store.get(clientIdUrl);
          return yield* resolveTrustedCimdClientEffect(clientIdUrl, doc, trusted);
        }),
      resolveRegistered: (clientIdUrl) =>
        resolveCimdRegisteredClientEffect(clientIdUrl, store, fetchDocument),
    })
  );
}
