import { Layer } from "effect";
import { loadSpec } from "../spec/spec-loader.js";
import { SearchService } from "../search-service.js";
import { searchClawqlOperationsEffect, type LoadSpecFn } from "./search-core.js";

export type { LoadSpecFn };

/** Built-in SearchService layer using clawql-api spec-loader + spec-search. */
export function makeSearchLive(loadSpecFn: LoadSpecFn = loadSpec): Layer.Layer<SearchService> {
  return Layer.succeed(
    SearchService,
    SearchService.of({
      search: (input) => searchClawqlOperationsEffect(input, loadSpecFn),
    })
  );
}
