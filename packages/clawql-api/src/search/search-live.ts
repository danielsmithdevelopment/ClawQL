import { Effect, Layer } from "effect";
import { loadSpec } from "../spec/spec-loader.js";
import { formatSearchResults, searchOperations } from "../spec/spec-search.js";
import { SearchService } from "../search-service.js";

export type LoadSpecFn = typeof loadSpec;

/** Built-in SearchService layer using clawql-api spec-loader + spec-search. */
export function makeSearchLive(loadSpecFn: LoadSpecFn = loadSpec): Layer.Layer<SearchService> {
  return Layer.succeed(
    SearchService,
    SearchService.of({
      search: ({ query, limit }) =>
        Effect.tryPromise(async () => {
          const { operations } = await loadSpecFn();
          const results = searchOperations(operations, query, limit ?? 5);
          return { formattedText: formatSearchResults(results) };
        }),
    })
  );
}
