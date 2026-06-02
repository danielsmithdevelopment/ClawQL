import { Context, Effect, Layer } from "effect";

/** MCP `search` pipeline (Phase 1 stub — wired to spec-search in clawql-mcp next). */
export type SearchInput = {
  readonly query: string;
  readonly limit?: number;
};

export type SearchOutput = {
  readonly results: readonly unknown[];
};

export class SearchService extends Context.Tag("clawql/SearchService")<
  SearchService,
  {
    readonly search: (input: SearchInput) => Effect.Effect<SearchOutput, Error>;
  }
>() {}

export const searchNotConfigured = SearchService.of({
  search: () =>
    Effect.fail(new Error("SearchService not configured — provide SearchLive in createClawQLApi")),
});

export const SearchNotConfiguredLive = Layer.succeed(SearchService, searchNotConfigured);
