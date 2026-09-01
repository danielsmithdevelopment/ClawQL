import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { Effect } from "effect";
import { createClawQLApi } from "../create-api.js";
import { createHandoffSkillPlugin, HANDOFF_SKILL_PLUGIN_ID } from "./handoff-plugin.js";
import { listProcessSkillIndex, resetProcessSkillsRegistryForTests } from "./process-skills.js";
import { SearchService } from "../search-service.js";
import type { LoadedSpec } from "../spec/spec-loader.js";
import type { Operation } from "../spec/operation-types.js";

const emptySpec = async (): Promise<LoadedSpec> => ({
  operations: [] as Operation[],
  rawSource: {},
  openapi: {
    openapi: "3.0.0",
    info: { title: "t", version: "1" },
    paths: {},
    components: {},
  },
  multi: false,
});

describe("handoff skill + unified search", () => {
  beforeEach(async () => {
    await resetProcessSkillsRegistryForTests();
  });
  afterEach(async () => {
    await resetProcessSkillsRegistryForTests();
  });

  it("registers session-handoff on install and surfaces in search", async () => {
    const api = createClawQLApi({
      plugins: [createHandoffSkillPlugin()],
      loadSpecFn: emptySpec,
    });
    expect(api.registry.list().some((p) => p.id === HANDOFF_SKILL_PLUGIN_ID)).toBe(true);
    const index = await listProcessSkillIndex();
    expect(index.some((s) => s.skillId === "session-handoff")).toBe(true);

    const out = await api.run(
      Effect.gen(function* () {
        const search = yield* SearchService;
        return yield* search.search({ query: "handoff session summarize", limit: 5 });
      })
    );
    const parsed = JSON.parse(out.formattedText) as {
      results: { kind?: string; skillId?: string }[];
    };
    expect(parsed.results.some((r) => r.kind === "skill" && r.skillId === "session-handoff")).toBe(
      true
    );
    await api.dispose();
  });
});
