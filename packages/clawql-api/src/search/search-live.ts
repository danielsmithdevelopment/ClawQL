import { Layer } from "effect";
import type { Context } from "effect";
import type { SkillRegistry } from "clawql-core";
import { loadSpec } from "../spec/spec-loader.js";
import { SearchService } from "../search-service.js";
import {
  searchClawqlOperationsEffect,
  type LoadSpecFn,
  type SearchCoreOptions,
} from "./search-core.js";

export type { LoadSpecFn };

export type MakeSearchLiveOptions = SearchCoreOptions;

/** Built-in SearchService layer using clawql-api spec-loader + skill index. */
export function makeSearchLive(
  loadSpecFn: LoadSpecFn = loadSpec,
  options?: MakeSearchLiveOptions
): Layer.Layer<SearchService> {
  return Layer.succeed(
    SearchService,
    SearchService.of({
      search: (input) => searchClawqlOperationsEffect(input, loadSpecFn, options),
    })
  );
}

/** Helper for hosts that already hold a SkillRegistry service. */
export function makeSearchLiveWithSkills(
  loadSpecFn: LoadSpecFn,
  skillRegistry: Context.Tag.Service<typeof SkillRegistry>
): Layer.Layer<SearchService> {
  return makeSearchLive(loadSpecFn, { skillRegistry });
}
