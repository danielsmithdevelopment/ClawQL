import fs from "node:fs/promises";
import path from "node:path";
import { graphifyJsonPath } from "../config/backend.js";
import type { GraphifyGraphJson } from "../import/graphify-import.js";
import {
  documentSummary,
  importGraphifyFromPath,
  type IndexRepoResult,
} from "../indexer/index-repo.js";
import { storageFromPath } from "../storage/file-storage.js";
import { detectBlindSpots, type BlindSpotReport } from "./blind-spots.js";
import {
  applyReportCommunityNames,
  communityWikilinks,
  extractCommunitiesFromGraphJson,
  type GraphifyCommunity,
} from "./graphify-communities.js";
import { syncCodeGraph, type CodeGraphVaultIngestProposal } from "./codegraph-sync.js";

export type GraphifySyncMode = "fast" | "thorough";

/** @deprecated Prefer {@link CodeGraphVaultIngestProposal} from codegraph-sync. */
export type GraphifyVaultIngestProposal = CodeGraphVaultIngestProposal;

export type GraphifySyncResult = {
  readonly mode: GraphifySyncMode;
  readonly repoRoot: string;
  readonly repoName: string;
  /** Always false — Python Graphify CLI is no longer spawned. */
  readonly graphifyRan: false;
  readonly artifacts: {
    readonly graphJson?: string;
    readonly graphHtml?: string;
    readonly reportMd?: string;
  };
  readonly importSummary: IndexRepoResult;
  readonly blindSpots: BlindSpotReport;
  readonly nativeIndexRan: boolean;
  readonly nativeIndexReason?: string;
  readonly communities: readonly GraphifyCommunity[];
  readonly vaultIngest?: CodeGraphVaultIngestProposal;
  readonly graphHtmlPath?: string;
  /** When no graph.json was found, native {@link syncCodeGraph} ran instead. */
  readonly fellBackToNative?: boolean;
};

export type GraphifySyncOptions = {
  readonly rootPath?: string;
  readonly graphId?: string;
  readonly storagePath?: string;
  readonly mode?: GraphifySyncMode;
  /** @deprecated Ignored — native indexer is the only engine. */
  readonly catchBlindSpots?: boolean;
  /** @deprecated Ignored. */
  readonly forceNative?: boolean;
  /**
   * When true (default), only import existing Graphify/`graph.json` artifacts.
   * If none exist, falls back to native {@link syncCodeGraph}.
   * Spawning the Python Graphify CLI is no longer supported.
   */
  readonly skipGraphifyRun?: boolean;
  readonly outDir?: string;
  /** @deprecated Ignored — Python CLI spawn removed. */
  readonly graphifyCmd?: string;
  readonly vaultIngest?: boolean;
  readonly maxFiles?: number;
};

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

export async function resolveGraphifyArtifacts(options: {
  repoRoot: string;
  outDir?: string;
}): Promise<{
  outDir: string;
  graphJson?: string;
  graphHtml?: string;
  reportMd?: string;
}> {
  const candidates: string[] = [];
  if (options.outDir?.trim()) candidates.push(path.resolve(options.outDir.trim()));
  const envJson = graphifyJsonPath();
  if (envJson) candidates.push(path.dirname(path.resolve(envJson)));
  candidates.push(path.join(options.repoRoot, "graphify-out"));
  candidates.push(path.join(options.repoRoot, "codegraph-out"));
  candidates.push(options.repoRoot);

  for (const dir of candidates) {
    const graphJson = path.join(dir, "graph.json");
    if (await pathExists(graphJson)) {
      const reportMd = path.join(dir, "GRAPH_REPORT.md");
      const graphHtml = path.join(dir, "graph.html");
      return {
        outDir: dir,
        graphJson,
        reportMd: (await pathExists(reportMd)) ? reportMd : undefined,
        graphHtml: (await pathExists(graphHtml)) ? graphHtml : undefined,
      };
    }
  }

  const outDir = options.outDir?.trim()
    ? path.resolve(options.outDir.trim())
    : path.join(options.repoRoot, "graphify-out");
  return { outDir };
}

function buildVaultProposal(input: {
  repoName: string;
  date: string;
  importSummary: IndexRepoResult;
  communities: readonly GraphifyCommunity[];
  blindSpots: BlindSpotReport;
  reportMd: string | undefined;
  mode: GraphifySyncMode;
}): CodeGraphVaultIngestProposal {
  const title = `Codegraph Architecture Report — ${input.repoName} (${input.date})`;
  const clusterLinks = communityWikilinks(input.communities);
  const wikilinks = [
    "Codebase Architecture",
    input.repoName,
    "Codegraph Sync History",
    ...clusterLinks,
  ];

  const communityLines =
    input.communities.length === 0
      ? ["- (no communities found in graph.json)"]
      : input.communities.map((c) => {
          const samples = c.sampleLabels.length
            ? ` — e.g. ${c.sampleLabels.slice(0, 4).join(", ")}`
            : "";
          return `- **${c.name}** (id=${c.id}, nodes=${c.nodeCount})${samples}`;
        });

  const insights = [
    `## Sync summary`,
    `- Source: **imported graph.json** (external Graphify or prior export)`,
    `- Mode: **${input.mode}**`,
    `- Nodes: **${input.importSummary.nodeCount}** · Edges: **${input.importSummary.edgeCount}**`,
    ``,
    `## Communities`,
    ...communityLines,
  ].join("\n");

  return {
    title,
    type: "runbook",
    description: `Imported architecture graph for ${input.repoName} on ${input.date}`,
    insights,
    wikilinks,
    append: true,
    tags: ["clawql-codegraph", "graphify-import", "architecture"],
    toolOutputs:
      input.reportMd?.trim() ||
      `_No GRAPH_REPORT.md alongside graph.json; communities derived from graph.json only._`,
  };
}

/**
 * Optional bridge: import an existing Graphify (or clawql-exported) `graph.json`.
 * Does **not** spawn Python. If no artifacts exist, falls back to native {@link syncCodeGraph}.
 */
export async function syncGraphify(options: GraphifySyncOptions = {}): Promise<GraphifySyncResult> {
  const mode: GraphifySyncMode = options.mode === "thorough" ? "thorough" : "fast";
  const repoRoot = path.resolve(
    options.rootPath?.trim() ||
      process.env.CLAWQL_CODEGRAPH_ROOT?.trim() ||
      process.cwd()
  );
  const repoName = path.basename(repoRoot) || "repo";
  const outDirHint =
    options.outDir?.trim() ||
    process.env.CLAWQL_CODEGRAPH_GRAPHIFY_OUT_DIR?.trim() ||
    undefined;

  if (options.graphifyCmd?.trim()) {
    throw new Error(
      "codegraph_sync_graphify no longer spawns the Graphify CLI (no Python dependency). " +
        "Use codegraph_sync for the native TypeScript pipeline, or pass an existing graph.json via outDir / CLAWQL_CODEGRAPH_GRAPHIFY_JSON."
    );
  }

  const artifacts = await resolveGraphifyArtifacts({ repoRoot, outDir: outDirHint });
  if (!artifacts.graphJson) {
    const native = await syncCodeGraph({
      rootPath: repoRoot,
      graphId: options.graphId,
      storagePath: options.storagePath,
      mode,
      vaultIngest: options.vaultIngest,
      maxFiles: options.maxFiles,
    });
    return {
      mode,
      repoRoot,
      repoName,
      graphifyRan: false,
      artifacts: {
        graphJson: native.artifacts.graphJson,
        graphHtml: native.artifacts.graphHtml,
        reportMd: native.artifacts.reportMd,
      },
      importSummary: native.summary,
      blindSpots: native.blindSpots,
      nativeIndexRan: true,
      nativeIndexReason: "no graph.json found; native codegraph_sync",
      communities: native.communities,
      vaultIngest: native.vaultIngest,
      graphHtmlPath: native.artifacts.graphHtml,
      fellBackToNative: true,
    };
  }

  const storage = storageFromPath(options.storagePath);
  const doc = await importGraphifyFromPath({
    jsonPath: artifacts.graphJson,
    graphId: options.graphId,
    rootPath: repoRoot,
  });
  await storage.put(doc);
  const importSummary = documentSummary(doc);

  const raw = JSON.parse(await fs.readFile(artifacts.graphJson, "utf8")) as GraphifyGraphJson;
  let reportText: string | undefined;
  if (artifacts.reportMd) {
    try {
      reportText = await fs.readFile(artifacts.reportMd, "utf8");
    } catch {
      reportText = undefined;
    }
  }

  const communities = applyReportCommunityNames(
    extractCommunitiesFromGraphJson(raw),
    reportText
  );
  const blindSpots = await detectBlindSpots(repoRoot, doc, { maxFiles: options.maxFiles });
  const date = new Date().toISOString().slice(0, 10);
  const vaultIngest =
    options.vaultIngest === false
      ? undefined
      : buildVaultProposal({
          repoName,
          date,
          importSummary,
          communities,
          blindSpots,
          reportMd: reportText,
          mode,
        });

  return {
    mode,
    repoRoot,
    repoName,
    graphifyRan: false,
    artifacts: {
      graphJson: artifacts.graphJson,
      graphHtml: artifacts.graphHtml,
      reportMd: artifacts.reportMd,
    },
    importSummary,
    blindSpots,
    nativeIndexRan: false,
    communities,
    vaultIngest,
    graphHtmlPath: artifacts.graphHtml,
    fellBackToNative: false,
  };
}
