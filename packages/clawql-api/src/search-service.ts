import { Context, Effect, Layer } from "effect";
import type { SearchInputDecoded } from "./schema/search-execute-schema.js";

/** MCP `search` pipeline input (from {@link SearchInputSchema}). */
export type SearchInput = SearchInputDecoded;

export type SearchOutput = {
  /** MCP `search` tool body text (from `formatSearchResults`). */
  readonly formattedText: string;
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
