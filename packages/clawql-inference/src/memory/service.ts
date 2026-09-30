/**
 * Memory gateway — Effect Tag wrapping clawql-memory for HTTP /memory.
 * REST façade only; enrichment lives in enrichment.ts (default off).
 */

import { unlink } from "node:fs/promises";
import { Context, Effect, Layer } from "effect";
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
import { resolveVaultPath } from "clawql-memory/vault/utils";
import { slugifyTitle } from "clawql-memory/ingest/slug";

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
  | { readonly ok: true; readonly path: string; readonly erased: true }
  | { readonly ok: false; readonly error: string; readonly status: number };

export class MemoryGatewayService extends Context.Tag("clawql/inference/MemoryGatewayService")<
  MemoryGatewayService,
  {
    readonly ingest: (input: MemoryIngestInput) => Effect.Effect<MemoryIngestResult>;
    readonly search: (input: MemoryRecallInput) => Effect.Effect<MemoryRecallResult>;
    readonly list: () => Effect.Effect<
      { ok: true; entries: MemoryListEntry[] } | { ok: false; error: string }
    >;
    readonly get: (slug: string) => Effect.Effect<MemoryGetResult | MemoryEraseResult>;
    readonly erase: (slug: string) => Effect.Effect<MemoryEraseResult>;
  }
>() {}

function requireVault(): string {
  const vault = getObsidianVaultPath();
  if (!vault) {
    throw new Error("CLAWQL_OBSIDIAN_VAULT_PATH is not set");
  }
  return vault;
}

function slugFromPath(relPath: string): string {
  const base = relPath.replace(/^Memory\//, "").replace(/\.md$/i, "");
  return base || relPath;
}

function resolveMemoryRelPath(slug: string): string {
  const cleaned = slug.trim().replace(/^\/+/, "").replace(/\.md$/i, "");
  const safe = cleaned.includes("/") ? cleaned : `Memory/${cleaned || slugifyTitle(cleaned)}.md`;
  // Always constrain to Memory/
  if (!safe.startsWith("Memory/")) {
    return `Memory/${slugifyTitle(cleaned)}.md`;
  }
  if (safe.split("/").some((p) => p === "..")) {
    throw new Error("Invalid memory slug");
  }
  return safe.endsWith(".md") ? safe : `${safe}.md`;
}

export const MemoryGatewayLive = Layer.succeed(MemoryGatewayService, {
  ingest: (input) =>
    Effect.tryPromise({
      try: () => runMemoryIngest(input),
      catch: (e) => (e instanceof Error ? e : new Error(String(e))),
    }).pipe(Effect.catchAll((e) => Effect.succeed({ ok: false as const, error: e.message }))),

  search: (input) =>
    Effect.tryPromise({
      try: () => runMemoryRecall(input),
      catch: (e) => (e instanceof Error ? e : new Error(String(e))),
    }).pipe(
      Effect.catchAll((e) =>
        Effect.succeed({
          ok: false as const,
          query: input.query,
          error: e.message,
          results: [],
        })
      )
    ),

  list: () =>
    Effect.tryPromise({
      try: async () => {
        const vault = requireVault();
        const paths = await listVaultMarkdownRelPaths(vault, "Memory", 5000);
        return {
          ok: true as const,
          entries: paths.map((path) => ({ path, slug: slugFromPath(path) })),
        };
      },
      catch: (e) => (e instanceof Error ? e : new Error(String(e))),
    }).pipe(Effect.catchAll((e) => Effect.succeed({ ok: false as const, error: e.message }))),

  get: (slug) =>
    Effect.tryPromise({
      try: async () => {
        const vault = requireVault();
        const rel = resolveMemoryRelPath(slug);
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
      Effect.catchAll((e) => {
        const msg = e.message;
        const status = /ENOENT|no such file/i.test(msg) ? 404 : 502;
        return Effect.succeed({
          ok: false as const,
          error: msg,
          status,
        });
      })
    ),

  erase: (slug) =>
    Effect.tryPromise({
      try: async () => {
        const vault = requireVault();
        const rel = resolveMemoryRelPath(slug);
        const abs = resolveVaultPath(vault, rel);
        await unlink(abs);
        return { ok: true as const, path: rel, erased: true as const };
      },
      catch: (e) => (e instanceof Error ? e : new Error(String(e))),
    }).pipe(
      Effect.catchAll((e) => {
        const msg = e.message;
        const status = /ENOENT|no such file/i.test(msg) ? 404 : 502;
        return Effect.succeed({
          ok: false as const,
          error: msg,
          status,
        });
      })
    ),
});

export function runMemoryGatewayIngest(input: MemoryIngestInput): Promise<MemoryIngestResult> {
  return Effect.runPromise(
    Effect.gen(function* () {
      const svc = yield* MemoryGatewayService;
      return yield* svc.ingest(input);
    }).pipe(Effect.provide(MemoryGatewayLive))
  );
}

export function runMemoryGatewaySearch(input: MemoryRecallInput): Promise<MemoryRecallResult> {
  return Effect.runPromise(
    Effect.gen(function* () {
      const svc = yield* MemoryGatewayService;
      return yield* svc.search(input);
    }).pipe(Effect.provide(MemoryGatewayLive))
  );
}

export function runMemoryGatewayList(): Promise<
  { ok: true; entries: MemoryListEntry[] } | { ok: false; error: string }
> {
  return Effect.runPromise(
    Effect.gen(function* () {
      const svc = yield* MemoryGatewayService;
      return yield* svc.list();
    }).pipe(Effect.provide(MemoryGatewayLive))
  );
}

export function runMemoryGatewayGet(slug: string): Promise<MemoryGetResult | MemoryEraseResult> {
  return Effect.runPromise(
    Effect.gen(function* () {
      const svc = yield* MemoryGatewayService;
      return yield* svc.get(slug);
    }).pipe(Effect.provide(MemoryGatewayLive))
  );
}

export function runMemoryGatewayErase(slug: string): Promise<MemoryEraseResult> {
  return Effect.runPromise(
    Effect.gen(function* () {
      const svc = yield* MemoryGatewayService;
      return yield* svc.erase(slug);
    }).pipe(Effect.provide(MemoryGatewayLive))
  );
}
