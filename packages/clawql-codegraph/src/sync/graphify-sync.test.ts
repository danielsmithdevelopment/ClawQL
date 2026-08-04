import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  applyReportCommunityNames,
  communityWikilinks,
  extractCommunitiesFromGraphJson,
  isNumberedClusterName,
} from "./graphify-communities.js";
import { detectBlindSpots } from "./blind-spots.js";
import { mergeCodeGraphs } from "./merge-graphs.js";
import { syncGraphify } from "./graphify-sync.js";
import { importGraphifyJson } from "../import/graphify-import.js";
import { FileCodeGraphStorage } from "../storage/file-storage.js";

describe("graphify communities", () => {
  it("detects numbered cluster names", () => {
    expect(isNumberedClusterName("Community 0")).toBe(true);
    expect(isNumberedClusterName("cluster_7")).toBe(true);
    expect(isNumberedClusterName("Authentication Layer")).toBe(false);
  });

  it("extracts communities from graph.json and skips numbered wikilinks", () => {
    const communities = extractCommunitiesFromGraphJson({
      nodes: [
        { id: "a", label: "auth", community: 0, source_file: "auth.ts" },
        { id: "b", label: "login", community: 0, source_file: "login.ts" },
        { id: "c", label: "db", community: 1, source_file: "db.ts" },
      ],
    });
    expect(communities).toHaveLength(2);
    expect(communities[0]?.name).toBe("Community 0");
    expect(communityWikilinks(communities)).toEqual([]);
  });

  it("uses report headings for named communities as wikilinks", () => {
    const base = extractCommunitiesFromGraphJson({
      nodes: [
        { id: "a", label: "auth", community: 0 },
        { id: "b", label: "db", community: 1 },
      ],
    });
    const named = applyReportCommunityNames(
      base,
      "## Community 0: Authentication Layer\n\n## Community 1: Data Access\n"
    );
    expect(named[0]?.name).toBe("Authentication Layer");
    expect(communityWikilinks(named)).toEqual(["Authentication Layer", "Data Access"]);
  });
});

describe("mergeCodeGraphs", () => {
  it("keeps base nodes and adds missing extras", () => {
    const base = importGraphifyJson(
      {
        nodes: [{ id: "a", label: "A", source_file: "a.ts", community: 0 }],
        links: [],
      },
      { graphId: "g", rootPath: "/tmp" }
    );
    const extra = importGraphifyJson(
      {
        nodes: [
          { id: "a", label: "A-overwrite", source_file: "a.ts" },
          { id: "b", label: "B", source_file: "b.ts" },
        ],
        links: [{ source: "a", target: "b", relation: "calls", confidence: "EXTRACTED" }],
      },
      { graphId: "g2", rootPath: "/tmp" }
    );
    const merged = mergeCodeGraphs(base, extra);
    expect(merged.nodes.a?.name).toBe("A");
    expect(merged.nodes.b?.name).toBe("B");
    expect(merged.edgeCount).toBe(1);
    expect(merged.nodes.a?.community).toBe(0);
  });
});

describe("syncGraphify", () => {
  let tmp: string | undefined;

  afterEach(async () => {
    if (tmp) await fs.rm(tmp, { recursive: true, force: true });
    tmp = undefined;
  });

  it("imports fixture graph, proposes vault ingest, and skips native in fast mode", async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "clawql-graphify-sync-"));
    const repo = path.join(tmp, "demo-repo");
    const out = path.join(repo, "graphify-out");
    await fs.mkdir(out, { recursive: true });
    await fs.mkdir(path.join(repo, "src"), { recursive: true });
    await fs.writeFile(path.join(repo, "src", "auth.ts"), "export function auth() {}\n", "utf8");
    await fs.writeFile(path.join(repo, "src", "orphan.py"), "def orphan():\n  pass\n", "utf8");

    const graph = {
      nodes: [
        {
          id: "auth",
          label: "auth",
          file_type: "code",
          source_file: "src/auth.ts",
          community: 0,
        },
      ],
      links: [],
    };
    await fs.writeFile(path.join(out, "graph.json"), JSON.stringify(graph), "utf8");
    await fs.writeFile(
      path.join(out, "GRAPH_REPORT.md"),
      "# Report\n\n## Community 0\n\nAuth only.\n",
      "utf8"
    );
    await fs.writeFile(path.join(out, "graph.html"), "<html></html>", "utf8");

    const storagePath = path.join(tmp, "codegraph.db.json");
    const result = await syncGraphify({
      rootPath: repo,
      graphId: "demo-sync",
      storagePath,
      skipGraphifyRun: true,
      mode: "fast",
      vaultIngest: true,
    });

    expect(result.graphifyRan).toBe(false);
    expect(result.importSummary.nodeCount).toBe(1);
    expect(result.nativeIndexRan).toBe(false);
    expect(result.artifacts.graphHtml).toContain("graph.html");
    expect(result.vaultIngest?.title).toMatch(/^Codegraph Architecture Report — demo-repo/);
    expect(result.vaultIngest?.wikilinks).toContain("Codebase Architecture");
    expect(result.vaultIngest?.wikilinks).toContain("demo-repo");
    expect(result.vaultIngest?.wikilinks).toContain("Codegraph Sync History");
    expect(result.vaultIngest?.toolOutputs).toContain("# Report");
    expect(result.blindSpots.nativeFillable.some((b) => b.extension === ".py")).toBe(true);

    const stored = await new FileCodeGraphStorage(storagePath).get("demo-sync");
    expect(stored?.nodes.auth?.community).toBe(0);
  });

  it("runs native merge in thorough mode when native-fillable blind spots exist", async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "clawql-graphify-sync-thorough-"));
    const repo = path.join(tmp, "demo-repo");
    const out = path.join(repo, "graphify-out");
    await fs.mkdir(out, { recursive: true });
    await fs.mkdir(path.join(repo, "src"), { recursive: true });
    await fs.writeFile(
      path.join(repo, "src", "covered.ts"),
      "export function covered() { return 1; }\n",
      "utf8"
    );
    await fs.writeFile(
      path.join(repo, "src", "missed.ts"),
      "export function missed() { return 2; }\n",
      "utf8"
    );

    await fs.writeFile(
      path.join(out, "graph.json"),
      JSON.stringify({
        nodes: [
          {
            id: "covered",
            label: "covered",
            file_type: "code",
            source_file: "src/covered.ts",
            community: 0,
          },
        ],
        links: [],
      }),
      "utf8"
    );

    const storagePath = path.join(tmp, "codegraph.db.json");
    // Zero coverage on .ts overall? covered.ts is in graph so coverage > 0.
    // Add a .py file with zero graph coverage to trigger native fillable.
    await fs.writeFile(path.join(repo, "src", "only_py.py"), "def only_py():\n  return 3\n", "utf8");

    const result = await syncGraphify({
      rootPath: repo,
      graphId: "thorough-sync",
      storagePath,
      skipGraphifyRun: true,
      mode: "thorough",
      vaultIngest: false,
      maxFiles: 50,
    });

    expect(result.nativeIndexRan).toBe(true);
    expect(result.nativeIndexReason).toMatch(/\.py/);
    expect(result.mergedSummary?.nodeCount).toBeGreaterThan(result.importSummary.nodeCount);
  });

  it("detectBlindSpots flags missing extensions", async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "clawql-blind-"));
    await fs.mkdir(path.join(tmp, "src"), { recursive: true });
    await fs.writeFile(path.join(tmp, "src", "a.ts"), "export const a = 1;\n", "utf8");
    await fs.writeFile(path.join(tmp, "src", "b.py"), "x = 1\n", "utf8");
    const doc = importGraphifyJson(
      {
        nodes: [{ id: "a", label: "a", source_file: "src/a.ts" }],
        links: [],
      },
      { graphId: "g", rootPath: tmp }
    );
    const report = await detectBlindSpots(tmp, doc);
    expect(report.blindSpots.some((b) => b.extension === ".py")).toBe(true);
    expect(report.blindSpots.some((b) => b.extension === ".ts")).toBe(false);
  });
});
