/**
 * ClawQL documentation index for Core `search` (`kind: "doc"`) and optional
 * `docs_search` MCP tool. Pattern mirrors apps/docs WebMCP `clawql.docs.search`
 * without FlexSearch — keyword scoring over a JSON fixture/index.
 *
 * Load order: `CLAWQL_DOCS_INDEX_PATH` → bundled `fixtures/docs-index.json` when present.
 */

import { readFileSync, existsSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Context, Effect, Layer } from "effect";
import { tokenize } from "../spec/spec-search.js";

export type DocsIndexEntry = {
  readonly url: string;
  readonly title: string;
  readonly content: string;
  readonly pageTitle?: string;
};

export type DocsIndex = {
  readonly version: number;
  readonly baseUrl: string;
  readonly entries: readonly DocsIndexEntry[];
};

export type DocSearchResult = {
  readonly kind: "doc";
  readonly url: string;
  readonly title: string;
  readonly pageTitle?: string;
  readonly score: number;
  readonly matchedOn: string[];
  readonly baseUrl: string;
};

type RawIndex = {
  version?: number;
  baseUrl?: string;
  entries?: Array<{
    url?: string;
    title?: string;
    content?: string;
    pageTitle?: string;
  }>;
  /** apps/docs-style pages with section tuples. */
  pages?: Array<{
    url?: string;
    sections?: Array<[string, string | null, string[]]>;
  }>;
};

function packageFixturesDir(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  // dist/search → ../../fixtures ; src/search → ../../fixtures
  return resolve(here, "../../fixtures");
}

/** Resolve index path: env override, else bundled fixture when it exists. */
export function resolveDocsIndexPath(env: NodeJS.ProcessEnv = process.env): string | null {
  const explicit = env.CLAWQL_DOCS_INDEX_PATH?.trim();
  if (explicit) {
    return isAbsolute(explicit) ? explicit : resolve(process.cwd(), explicit);
  }
  const bundled = join(packageFixturesDir(), "docs-index.json");
  if (existsSync(bundled)) return bundled;
  return null;
}

export function parseDocsIndexJson(raw: string): DocsIndex {
  const parsed = JSON.parse(raw) as RawIndex;
  const baseUrl = (parsed.baseUrl?.trim() || "https://docs.clawql.com").replace(/\/$/, "");
  const entries: DocsIndexEntry[] = [];

  if (Array.isArray(parsed.entries)) {
    for (const e of parsed.entries) {
      if (!e?.url || !e?.title) continue;
      entries.push({
        url: e.url.startsWith("/") ? e.url : `/${e.url}`,
        title: e.title,
        content: e.content ?? "",
        pageTitle: e.pageTitle,
      });
    }
  }

  if (Array.isArray(parsed.pages)) {
    for (const page of parsed.pages) {
      if (!page?.url || !Array.isArray(page.sections)) continue;
      const pageTitle = page.sections[0]?.[0];
      for (const section of page.sections) {
        const [title, hash, contentParts] = section;
        if (!title) continue;
        const url = page.url + (hash ? `#${hash}` : "");
        entries.push({
          url,
          title,
          content: [title, ...(contentParts ?? [])].join("\n"),
          pageTitle: hash && pageTitle ? pageTitle : undefined,
        });
      }
    }
  }

  return {
    version: typeof parsed.version === "number" ? parsed.version : 1,
    baseUrl,
    entries,
  };
}

export const loadDocsIndexEffect = (
  path: string | null = resolveDocsIndexPath()
): Effect.Effect<DocsIndex | null, Error> =>
  Effect.try({
    try: () => {
      if (!path || !existsSync(path)) return null;
      return parseDocsIndexJson(readFileSync(path, "utf8"));
    },
    catch: (cause) =>
      cause instanceof Error ? cause : new Error(`Failed to load docs index: ${String(cause)}`),
  });

const DOC_WEIGHTS = {
  titleExact: 6,
  titlePartial: 3,
  url: 4,
  contentExact: 2,
  contentPartial: 1,
};

/** Score a single docs entry (pure). */
export function scoreDocsEntry(
  entry: DocsIndexEntry,
  query: string
): { score: number; matchedOn: string[] } {
  const terms = tokenize(query);
  if (terms.length === 0) return { score: 0, matchedOn: [] };

  let score = 0;
  const matchedOn: string[] = [];
  const titleLower = entry.title.toLowerCase();
  const urlLower = entry.url.toLowerCase();
  const contentLower = entry.content.toLowerCase();
  const titleWords = tokenize(titleLower);
  const contentWords = tokenize(contentLower);

  for (const term of terms) {
    if (titleWords.includes(term)) {
      score += DOC_WEIGHTS.titleExact;
      matchedOn.push(`title:${entry.title}`);
    } else if (titleLower.includes(term)) {
      score += DOC_WEIGHTS.titlePartial;
      matchedOn.push("title(partial)");
    }
    if (urlLower.includes(term)) {
      score += DOC_WEIGHTS.url;
      matchedOn.push(`url:${entry.url}`);
    }
    if (contentWords.includes(term)) {
      score += DOC_WEIGHTS.contentExact;
      matchedOn.push("content");
    } else if (contentLower.includes(term)) {
      score += DOC_WEIGHTS.contentPartial;
      matchedOn.push("content(partial)");
    }
  }

  return { score, matchedOn: [...new Set(matchedOn)] };
}

/** Search a loaded index; returns hits sorted by score. */
export function searchDocsIndex(index: DocsIndex, query: string, limit = 5): DocSearchResult[] {
  const results: DocSearchResult[] = [];
  for (const entry of index.entries) {
    const { score, matchedOn } = scoreDocsEntry(entry, query);
    if (score > 0) {
      results.push({
        kind: "doc",
        url: entry.url,
        title: entry.title,
        pageTitle: entry.pageTitle,
        score,
        matchedOn,
        baseUrl: index.baseUrl,
      });
    }
  }
  return results.sort((a, b) => b.score - a.score).slice(0, limit);
}

export const searchDocsIndexEffect = (
  index: DocsIndex,
  query: string,
  limit = 5
): Effect.Effect<DocSearchResult[]> => Effect.sync(() => searchDocsIndex(index, query, limit));

/**
 * Load index (if any) and search. Returns empty when no index is configured.
 */
export const searchClawqlDocsEffect = (
  query: string,
  limit = 5,
  env: NodeJS.ProcessEnv = process.env
): Effect.Effect<DocSearchResult[], Error> =>
  Effect.gen(function* () {
    const index = yield* loadDocsIndexEffect(resolveDocsIndexPath(env));
    if (!index) return [];
    return yield* searchDocsIndexEffect(index, query, limit);
  });

export class DocsIndexService extends Context.Service<
  DocsIndexService,
  {
    readonly resolvePath: (env?: NodeJS.ProcessEnv) => Effect.Effect<string | null>;
    readonly load: (path?: string | null) => Effect.Effect<DocsIndex | null, Error>;
    readonly search: (
      query: string,
      limit?: number,
      env?: NodeJS.ProcessEnv
    ) => Effect.Effect<DocSearchResult[], Error>;
  }
>()("clawql/DocsIndexService") {}

export const DocsIndexLive = Layer.succeed(
  DocsIndexService,
  DocsIndexService.of({
    resolvePath: (env) => Effect.sync(() => resolveDocsIndexPath(env)),
    load: (path) => loadDocsIndexEffect(path),
    search: (query, limit, env) => searchClawqlDocsEffect(query, limit ?? 5, env),
  })
);
