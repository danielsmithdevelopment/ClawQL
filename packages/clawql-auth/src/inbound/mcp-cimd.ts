/**
 * MCP OAuth §3 — Client ID Metadata Documents (CIMD) + trusted-client list.
 *
 * A client_id that is an HTTPS URL is fetched, validated, and must appear on
 * the operator trusted-client list (or allowlist). Fail closed.
 */

import { createHash } from "node:crypto";
import { Context, Data, Effect, Layer } from "effect";
import type { McpTrustedClientRecord } from "./mcp-oauth.js";

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

export class CimdService extends Context.Service<
  CimdService,
  {
    readonly resolve: (
      clientIdUrl: string,
      documentJson: unknown
    ) => Effect.Effect<McpTrustedClientRecord, CimdError>;
  }
>()("clawql/CimdService") {}

export function cimdServiceLayer(store: TrustedClientStore): Layer.Layer<CimdService> {
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
    })
  );
}
