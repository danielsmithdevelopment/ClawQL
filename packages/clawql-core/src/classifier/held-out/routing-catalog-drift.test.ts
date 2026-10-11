import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { digestCanonicalJson } from "../generate-capability-ontology.js";
import {
  FROZEN_ROUTING_MCP_TOOL_NAMES,
  FROZEN_V04_SOURCE_CATALOG_DIGEST,
  FROZEN_V06_SOURCE_CATALOG_DIGEST,
  LIVE_DEFAULT_CORE_MCP_TOOL_NAMES,
  diffRoutingCatalog,
  isFrozenFixtureOnlyMcpName,
  routingCatalogAlignedForProductionTrust,
} from "./routing-catalog-drift.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = join(here, "fixtures");

function loadCatalog(filename: string): unknown {
  return JSON.parse(readFileSync(join(fixtures, filename), "utf8")) as unknown;
}

describe("routing catalog drift (productionTrusted honesty)", () => {
  it("frozen v0.4 source catalog digest still matches FREEZE.md", () => {
    const catalog = loadCatalog("routing-fresh-v0.4-source-catalog.json");
    expect(digestCanonicalJson(catalog)).toBe(FROZEN_V04_SOURCE_CATALOG_DIGEST);
  });

  it("frozen v0.6 source catalog digest still matches FREEZE.md", () => {
    const catalog = loadCatalog("routing-fresh-v0.6-source-catalog.json");
    expect(digestCanonicalJson(catalog)).toBe(FROZEN_V06_SOURCE_CATALOG_DIGEST);
  });

  it("v0.4 and v0.6 share the same MCP tool ids (only catalogId/note differ)", () => {
    const v4 = loadCatalog("routing-fresh-v0.4-source-catalog.json") as {
      entries: Array<{ id: string; kind: string }>;
    };
    const v6 = loadCatalog("routing-fresh-v0.6-source-catalog.json") as {
      entries: Array<{ id: string; kind: string }>;
    };
    const mcpProduct = (c: typeof v4) =>
      c.entries
        .filter((e) => e.kind === "tool" && e.id.startsWith("mcp."))
        .map((e) => e.id.slice("mcp.".length))
        .filter((name) => !isFrozenFixtureOnlyMcpName(name))
        .sort();
    expect(mcpProduct(v4)).toEqual(mcpProduct(v6));
    expect(mcpProduct(v4)).toEqual([...FROZEN_ROUTING_MCP_TOOL_NAMES].sort());
  });

  it("live default-on Core catalog drifted — calibrated must stay false", () => {
    const drift = diffRoutingCatalog();
    expect(drift.missingFromLiveDefault).toEqual(
      expect.arrayContaining([
        "pageindex_build_tree",
        "clawql_think",
        "ouroboros_run_evolutionary_loop",
        "data_query",
        "sandbox_exec",
        "notify",
        "schedule",
        "ingest_external_knowledge",
        "knowledge_search_onyx",
      ])
    );
    expect(drift.extraInLiveDefault).toEqual(
      expect.arrayContaining([
        "resume",
        "sources_propose",
        "sources_approve",
        "read_around",
        "memory_sync",
      ])
    );
    expect(drift.liveDefaultCoreTools).toEqual([...LIVE_DEFAULT_CORE_MCP_TOOL_NAMES].sort());
    expect(drift.aligned).toBe(false);
    expect(routingCatalogAlignedForProductionTrust()).toBe(false);
  });
});
