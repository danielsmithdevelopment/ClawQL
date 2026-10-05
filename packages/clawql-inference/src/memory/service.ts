/**
 * Memory gateway — Effect Tag wrapping clawql-memory for HTTP /memory.
 * REST façade only; enrichment lives in enrichment.ts (default off).
 */

import { Context, Effect, Layer } from "effect";
import { name, PrincipalId, VaultPath } from "clawql-gdp";
import {
  runMemoryIngest,
  type MemoryIngestInput,
  type MemoryIngestResult,
} from "clawql-memory/ingest/ingest";
import {
  runMemoryRecall,
  type MemoryRecallInput,
  type MemoryRecallResult,
} from "clawql-memory/recall/recall";
import { getObsidianVaultPath } from "clawql-memory/vault/config";
import { listVaultMarkdownRelPaths, readVaultTextFile } from "clawql-memory/recall/recall";
import { slugifyTitle } from "clawql-memory/ingest/slug";
import {
  eraseAuthorizedEffect,
  executeMemoryEraseAuthorizedEffect,
} from "clawql-memory/erase/erase";
import { keysEnforcementActive } from "../keys/store.js";
import { pathInMemoryScope } from "./scope.js";

export type MemoryListEntry = {
  readonly path: string;
  readonly slug: string;
};

export type MemoryGetResult = {
  readonly ok: true;
  readonly path: string;
  readonly slug: string;
  readonly content: string;
};

export type MemoryEraseResult =
  | {
      readonly ok: true;
      /** Request path (caller already knows it); WORM stores pathId only. */
      readonly path: string;
      readonly pathId?: string;
      readonly erased: true;
      readonly contentHash?: string;
      readonly erasedStores?: {
        vault: boolean;
        memoryDb: boolean;
        pgvector: boolean;
        ontology: boolean;
        cryptoKey?: boolean;
        pathMap?: boolean;
      };
      readonly denyListUpdated?: boolean;
      readonly exportNote?: string;
    }
  | { readonly ok: false; readonly error: string; readonly status: number };

export type MemoryScopeOpts = {
  /** When set, only Memory/<scope>/ is visible. */
  readonly scope?: string;
};

export class MemoryGatewayService extends Context.Service<
  MemoryGatewayService,
  {
    readonly ingest: (input: MemoryIngestInput) => Effect.Effect<MemoryIngestResult>;
    readonly search: (
      input: MemoryRecallInput,
      scope?: string
    ) => Effect.Effect<MemoryRecallResult>;
    readonly list: (
      scope?: string
    ) => Effect.Effect<{ ok: true; entries: MemoryListEntry[] } | { ok: false; error: string }>;
    readonly get: (
      slug: string,
      scope?: string
    ) => Effect.Effect<MemoryGetResult | MemoryEraseResult>;
    readonly erase: (
      slug: string,
      scope?: string,
      principalId?: string
    ) => Effect.Effect<MemoryEraseResult>;
  }
>()("clawql/inference/MemoryGatewayService") {}

function requireVault(): string {
  const vault = getObsidianVaultPath();
  if (!vault) {
    throw new Error("CLAWQL_OBSIDIAN_VAULT_PATH is not set");
  }
  return vault;
}

function slugFromPath(relPath: string): string {
  const base = relPath
    .replace(/^Memory\//, "")
    .replace(/\.md$/i, "")
    .replace(/\.cqk$/i, "");
  return base || relPath;
}

function resolveMemoryRelPath(slug: string, scope?: string): string {
  const cleaned = slug
    .trim()
    .replace(/^\/+/, "")
    .replace(/\.(md|cqk)$/i, "");
  if (cleaned.split("/").some((p) => p === "..")) {
    throw new Error("Invalid memory slug");
  }
  // Absolute Memory/… path from client
  if (cleaned.startsWith("Memory/")) {
    const rel = cleaned.endsWith(".md") || cleaned.endsWith(".cqk") ? cleaned : `${cleaned}.md`;
    if (scope && !pathInMemoryScope(rel, scope)) {
      throw new Error("Memory path outside key scope");
    }
    return rel;
  }
  // Scoped relative slug
  if (cleaned.includes("/")) {
    const rel = `Memory/${cleaned}.md`;
    if (scope && !pathInMemoryScope(rel, scope)) {
      throw new Error("Memory path outside key scope");
    }
    return rel;
  }
  const leaf = slugifyTitle(cleaned);
  if (scope) return `Memory/${scope}/${leaf}.md`;
  return `Memory/${leaf}.md`;
}

function filterScopedHits<T extends { path?: string; id?: string }>(
  hits: T[],
  scope?: string
): T[] {
  if (!scope) return hits;
  return hits.filter((h) => {
    const path = (typeof h.path === "string" ? h.path : h.id) || "";
    return pathInMemoryScope(path, scope);
  });
}

export const MemoryGatewayLive = Layer.succeed(MemoryGatewayService, {
  ingest: (input) =>
    Effect.tryPromise({
      try: () => runMemoryIngest(input),
      catch: (e) => (e instanceof Error ? e : new Error(String(e))),
    }).pipe(Effect.catch((e) => Effect.succeed({ ok: false as const, error: e.message }))),

  search: (input, scope) =>
    Effect.tryPromise({
      try: async () => {
        const result = await runMemoryRecall(input);
        if (!result.ok || !scope) return result;
        const results = filterScopedHits(result.results ?? [], scope);
        const hits = filterScopedHits(result.hits ?? [], scope);
        return { ...result, results, hits };
      },
      catch: (e) => (e instanceof Error ? e : new Error(String(e))),
    }).pipe(
      Effect.catch((e) =>
        Effect.succeed({
          ok: false as const,
          query: input.query,
          error: e.message,
          results: [],
        })
      )
    ),

  list: (scope) =>
    Effect.tryPromise({
      try: async () => {
        const vault = requireVault();
        const scanRoot = scope ? `Memory/${scope}` : "Memory";
        const paths = await listVaultMarkdownRelPaths(vault, scanRoot, 5000);
        return {
          ok: true as const,
          entries: paths.map((path) => ({ path, slug: slugFromPath(path) })),
        };
      },
      catch: (e) => (e instanceof Error ? e : new Error(String(e))),
    }).pipe(Effect.catch((e) => Effect.succeed({ ok: false as const, error: e.message }))),

  get: (slug, scope) =>
    Effect.tryPromise({
      try: async () => {
        const vault = requireVault();
        const rel = resolveMemoryRelPath(slug, scope);
        const content = await readVaultTextFile(vault, rel);
        return {
          ok: true as const,
          path: rel,
          slug: slugFromPath(rel),
          content,
        };
      },
      catch: (e) => (e instanceof Error ? e : new Error(String(e))),
    }).pipe(
      Effect.catch((e) => {
        const msg = e.message;
        const status = /ENOENT|no such file|outside key scope/i.test(msg) ? 404 : 502;
        return Effect.succeed({
          ok: false as const,
          error: msg,
          status,
        });
      })
    ),

  erase: (slug, scope, principalId) =>
    Effect.suspend(() => {
      let rel: string;
      try {
        rel = resolveMemoryRelPath(slug, scope);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        const status = /ENOENT|no such file|outside key scope/i.test(msg) ? 404 : 502;
        return Effect.succeed({
          ok: false as const,
          error: msg,
          status,
        } satisfies MemoryEraseResult);
      }
      const principal = (principalId ?? "anonymous").trim() || "anonymous";
      const keysOn = keysEnforcementActive();
      return name(PrincipalId(principal), VaultPath(rel), (namedPrincipal, namedPath) =>
        Effect.gen(function* () {
          const proof = yield* eraseAuthorizedEffect(namedPrincipal, namedPath, {
            principalId: principal,
            vaultPath: rel,
            memoryScope: scope ? `Memory/${scope}` : null,
            keysEnforcementActive: keysOn,
          });
          if (!proof) {
            return {
              ok: false as const,
              error: "EraseAuthorized proof failed",
              status: 403,
            };
          }
          const result = yield* executeMemoryEraseAuthorizedEffect(
            namedPrincipal,
            namedPath,
            proof,
            { path: rel }
          );
          if (!result.ok) {
            return {
              ok: false as const,
              error: result.error ?? "erase failed",
              status: /ENOENT|no such file/i.test(result.error ?? "") ? 404 : 502,
            };
          }
          return {
            ok: true as const,
            path: rel,
            pathId: result.pathId,
            erased: true as const,
            contentHash: result.contentHash,
            erasedStores: result.erased,
            denyListUpdated: result.denyListUpdated,
            exportNote: result.exportNote,
          };
        })
      );
    }),
});

export function runMemoryGatewayIngest(input: MemoryIngestInput): Promise<MemoryIngestResult> {
  return Effect.runPromise(
    Effect.gen(function* () {
      const svc = yield* MemoryGatewayService;
      return yield* svc.ingest(input);
    }).pipe(Effect.provide(MemoryGatewayLive))
  );
}

export function runMemoryGatewaySearch(
  input: MemoryRecallInput,
  scope?: string
): Promise<MemoryRecallResult> {
  return Effect.runPromise(
    Effect.gen(function* () {
      const svc = yield* MemoryGatewayService;
      return yield* svc.search(input, scope);
    }).pipe(Effect.provide(MemoryGatewayLive))
  );
}

export function runMemoryGatewayList(
  scope?: string
): Promise<{ ok: true; entries: MemoryListEntry[] } | { ok: false; error: string }> {
  return Effect.runPromise(
    Effect.gen(function* () {
      const svc = yield* MemoryGatewayService;
      return yield* svc.list(scope);
    }).pipe(Effect.provide(MemoryGatewayLive))
  );
}

export function runMemoryGatewayGet(
  slug: string,
  scope?: string
): Promise<MemoryGetResult | MemoryEraseResult> {
  return Effect.runPromise(
    Effect.gen(function* () {
      const svc = yield* MemoryGatewayService;
      return yield* svc.get(slug, scope);
    }).pipe(Effect.provide(MemoryGatewayLive))
  );
}

export function runMemoryGatewayErase(
  slug: string,
  scope?: string,
  principalId?: string
): Promise<MemoryEraseResult> {
  return Effect.runPromise(
    Effect.gen(function* () {
      const svc = yield* MemoryGatewayService;
      return yield* svc.erase(slug, scope, principalId);
    }).pipe(Effect.provide(MemoryGatewayLive))
  );
}
