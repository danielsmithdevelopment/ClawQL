import { Context, Data, Effect, Layer } from "effect";
import { buildPageIndexFromMarkdown } from "../builder.js";
import {
  defaultPageIndexStoragePath,
  FilePageIndexStorage,
  type PageIndexStorage,
} from "../storage/file-storage.js";
import { synthesizePageIndex, traversePageIndex } from "../traversal.js";
import type { PageIndexDocument } from "../types.js";

export class PageIndexError extends Data.TaggedError("PageIndexError")<{
  readonly reason: string;
  readonly cause?: unknown;
}> {}

export class PageIndexService extends Context.Tag("clawql/PageIndexService")<
  PageIndexService,
  {
    readonly buildFromMarkdown: (
      docId: string,
      markdown: string
    ) => Effect.Effect<PageIndexDocument, PageIndexError>;
    readonly traverse: (
      doc: PageIndexDocument,
      query: string
    ) => Effect.Effect<ReturnType<typeof traversePageIndex>, PageIndexError>;
    readonly synthesize: (
      doc: PageIndexDocument,
      query: string
    ) => Effect.Effect<ReturnType<typeof synthesizePageIndex>, PageIndexError>;
    readonly put: (doc: PageIndexDocument) => Effect.Effect<void, PageIndexError>;
    readonly get: (docId: string) => Effect.Effect<PageIndexDocument | null, PageIndexError>;
    readonly list: () => Effect.Effect<string[], PageIndexError>;
    readonly delete: (docId: string) => Effect.Effect<boolean, PageIndexError>;
  }
>() {}

function fromPromise<A>(reason: string, task: () => Promise<A>) {
  return Effect.tryPromise({
    try: task,
    catch: (cause) => new PageIndexError({ reason, cause }),
  });
}

export function makePageIndexServiceLive(storagePath: string): Layer.Layer<PageIndexService> {
  const storage: PageIndexStorage = new FilePageIndexStorage(storagePath);
  return Layer.succeed(
    PageIndexService,
    PageIndexService.of({
      buildFromMarkdown: (docId, markdown) =>
        Effect.sync(() => buildPageIndexFromMarkdown(docId, markdown)),
      traverse: (doc, query) => Effect.sync(() => traversePageIndex(doc, query)),
      synthesize: (doc, query) => Effect.sync(() => synthesizePageIndex(doc, query)),
      put: (doc) => fromPromise("pageindex put failed", () => storage.put(doc)),
      get: (docId) => fromPromise("pageindex get failed", () => storage.get(docId)),
      list: () => fromPromise("pageindex list failed", () => storage.list()),
      delete: (docId) => fromPromise("pageindex delete failed", () => storage.delete(docId)),
    })
  );
}

export function pageIndexServiceLive(baseDir: string): Layer.Layer<PageIndexService> {
  return makePageIndexServiceLive(defaultPageIndexStoragePath(baseDir));
}

export function runPageIndexEffect<A, E>(
  program: Effect.Effect<A, E, PageIndexService>,
  baseDir: string
): Promise<A> {
  return Effect.runPromise(program.pipe(Effect.provide(pageIndexServiceLive(baseDir))));
}
