import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { assignLouvainCommunities } from "../analyze/cluster.js";
import { rankGodNodes, renderArchitectureReport } from "../analyze/report.js";
import { importGraphifyJson } from "../import/graphify-import.js";
import { syncCodeGraph } from "./codegraph-sync.js";
import { syncGraphify } from "./graphify-sync.js";

describe("assignLouvainCommunities", () => {
  it("labels communities and god nodes on a tiny graph", () => {
    const doc = importGraphifyJson(
      {
        nodes: [
          { id: "a", label: "auth" },
          { id: "b", label: "login" },
          { id: "c", label: "db" },
          { id: "d", label: "orphan" },
        ],
        links: [
          { source: "a", target: "b", relation: "calls", confidence: "EXTRACTED" },
          { source: "b", target: "c", relation: "calls", confidence: "EXTRACTED" },
          { source: "a", target: "c", relation: "calls", confidence: "EXTRACTED" },
        ],
      },
      { graphId: "tiny", rootPath: "/tmp" }
    );
    const clustered = assignLouvainCommunities(doc);
    expect(clustered.communities.length).toBeGreaterThan(0);
    expect(clustered.document.nodes.a?.community).toBeDefined();
    const gods = rankGodNodes(clustered.document, 3);
    expect(gods[0]!.degree).toBeGreaterThan(0);
    const report = renderArchitectureReport({
      repoName: "tiny",
      document: clustered.document,
      communities: clustered.communities,
      modularity: clustered.modularity,
      algorithm: clustered.algorithm,
    });
    expect(report).toContain("God Nodes");
    expect(report).toContain("clawql-codegraph");
  });
});

describe("syncCodeGraph", () => {
  let tmp: string | undefined;

  afterEach(async () => {
    if (tmp) await fs.rm(tmp, { recursive: true, force: true });
    tmp = undefined;
  });

  it("indexes a tiny TS repo, writes artifacts, and proposes vault ingest", async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "clawql-native-sync-"));
    const repo = path.join(tmp, "demo");
    await fs.mkdir(path.join(repo, "src"), { recursive: true });
    await fs.writeFile(
      path.join(repo, "src", "a.ts"),
      "export function alpha() { return beta(); }\nexport function beta() { return 1; }\n",
      "utf8"
    );
    await fs.writeFile(
      path.join(repo, "src", "b.ts"),
      'import { alpha } from "./a.js";\nexport function gamma() { return alpha(); }\n',
      "utf8"
    );

    const storagePath = path.join(tmp, "codegraph.db.json");
    const outDir = path.join(tmp, "out");
    const result = await syncCodeGraph({
      rootPath: repo,
      graphId: "demo-native",
      storagePath,
      outDir,
      vaultIngest: true,
      maxFiles: 20,
    });

    expect(result.engine).toBe("native");
    expect(result.summary.nodeCount).toBeGreaterThan(0);
    expect(result.communities.length).toBeGreaterThan(0);
    expect(result.vaultIngest?.wikilinks).toContain("Codebase Architecture");
    expect(result.vaultIngest?.tags).toContain("codegraph-sync");

    const report = await fs.readFile(result.artifacts.reportMd, "utf8");
    expect(report).toContain("Graph Report");
    const html = await fs.readFile(result.artifacts.graphHtml, "utf8");
    expect(html).toContain("vis-network");
    const json = JSON.parse(await fs.readFile(result.artifacts.graphJson, "utf8"));
    expect(json.nodes.length).toBe(result.summary.nodeCount);
  });
});

describe("syncGraphify bridge", () => {
  let tmp: string | undefined;

  afterEach(async () => {
    if (tmp) await fs.rm(tmp, { recursive: true, force: true });
    tmp = undefined;
  });

  it("falls back to native when no graph.json exists", async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "clawql-graphify-fallback-"));
    const repo = path.join(tmp, "demo");
    await fs.mkdir(path.join(repo, "src"), { recursive: true });
    await fs.writeFile(path.join(repo, "src", "x.ts"), "export const x = 1;\n", "utf8");
    const result = await syncGraphify({
      rootPath: repo,
      graphId: "fallback",
      storagePath: path.join(tmp, "cg.json"),
      vaultIngest: false,
      maxFiles: 10,
    });
    expect(result.fellBackToNative).toBe(true);
    expect(result.graphifyRan).toBe(false);
    expect(result.nativeIndexRan).toBe(true);
    expect(result.importSummary.nodeCount).toBeGreaterThan(0);
  });

  it("rejects graphifyCmd (no Python spawn)", async () => {
    await expect(
      syncGraphify({ rootPath: "/tmp", graphifyCmd: "graphify ." })
    ).rejects.toThrow(/no longer spawns/);
  });
});
