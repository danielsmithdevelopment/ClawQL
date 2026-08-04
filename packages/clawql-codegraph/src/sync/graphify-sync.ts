import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { graphifyJsonPath } from "../config/backend.js";
import type { GraphifyGraphJson } from "../import/graphify-import.js";
import {
  documentSummary,
  importGraphifyFromPath,
  indexRepository,
  type IndexRepoResult,
} from "../indexer/index-repo.js";
import { storageFromPath } from "../storage/file-storage.js";
import type { CodeGraphDocument } from "../types.js";
import { detectBlindSpots, type BlindSpotReport } from "./blind-spots.js";
import {
  applyReportCommunityNames,
  communityWikilinks,
  extractCommunitiesFromGraphJson,
  type GraphifyCommunity,
} from "./graphify-communities.js";
import { mergeCodeGraphs } from "./merge-graphs.js";

const execFileAsync = promisify(execFile);

export type GraphifySyncMode = "fast" | "thorough";

export type GraphifyVaultIngestProposal = {
  readonly title: string;
  readonly type: string;
  readonly description: string;
  readonly insights: string;
  readonly wikilinks: readonly string[];
  readonly append: true;
  readonly tags: readonly string[];
  readonly toolOutputs: string;
};

export type GraphifySyncResult = {
  readonly mode: GraphifySyncMode;
  readonly repoRoot: string;
  readonly repoName: string;
  readonly graphifyRan: boolean;
  readonly graphifyCmd?: string;
  readonly artifacts: {
    readonly graphJson?: string;
    readonly graphHtml?: string;
    readonly reportMd?: string;
  };
  readonly importSummary: IndexRepoResult;
  readonly blindSpots: BlindSpotReport;
  readonly nativeIndexRan: boolean;
  readonly nativeIndexReason?: string;
  readonly mergedSummary?: IndexRepoResult;
  readonly communities: readonly GraphifyCommunity[];
  readonly vaultIngest?: GraphifyVaultIngestProposal;
  readonly graphHtmlPath?: string;
};

export type GraphifySyncOptions = {
  readonly rootPath?: string;
  readonly graphId?: string;
  readonly storagePath?: string;
  /** `fast` = Graphify + import (+ optional vault). `thorough` = also catch blind spots with native index when fillable. */
  readonly mode?: GraphifySyncMode;
  /** When true, run native index if native-fillable blind spots exist (even in fast mode). */
  readonly catchBlindSpots?: boolean;
  /** Always run native index after import and merge (overrides blind-spot gate). */
  readonly forceNative?: boolean;
  /** Skip spawning Graphify; import existing artifacts (tests / pre-built graphs). */
  readonly skipGraphifyRun?: boolean;
  /** Directory containing graph.json / GRAPH_REPORT.md / graph.html (defaults to `{root}/graphify-out`). */
  readonly outDir?: string;
  /** Shell command; `{repoRoot}` and `{outDir}` substituted. Defaults to env or `graphify .`. */
  readonly graphifyCmd?: string;
  /** Build vault ingest proposal (default true). Caller (MemoryPlugin) runs `memory_ingest`. */
  readonly vaultIngest?: boolean;
  readonly maxFiles?: number;
};

function defaultGraphifySyncCommand(): string {
  return (
    process.env.CLAWQL_CODEGRAPH_GRAPHIFY_SYNC_CMD?.trim() ||
    process.env.CLAWQL_CODEGRAPH_GRAPHIFY_REFRESH_CMD?.trim() ||
    'graphify .'
  );
}

function substituteCmd(template: string, repoRoot: string, outDir: string): string {
  return template.replaceAll("{repoRoot}", repoRoot).replaceAll("{outDir}", outDir);
}

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

async function runGraphifyCli(cmd: string, repoRoot: string): Promise<void> {
  await execFileAsync("sh", ["-c", cmd], {
    cwd: repoRoot,
    timeout: 600_000,
    maxBuffer: 16 * 1024 * 1024,
    env: process.env,
  });
}

function buildVaultProposal(input: {
  repoName: string;
  date: string;
  importSummary: IndexRepoResult;
  communities: readonly GraphifyCommunity[];
  blindSpots: BlindSpotReport;
  reportMd: string | undefined;
  mode: GraphifySyncMode;
  nativeIndexRan: boolean;
}): GraphifyVaultIngestProposal {
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
      ? ["- (no Leiden communities found in graph.json)"]
      : input.communities.map((c) => {
          const samples = c.sampleLabels.length ? ` — e.g. ${c.sampleLabels.slice(0, 4).join(", ")}` : "";
          return `- **${c.name}** (id=${c.id}, nodes=${c.nodeCount})${samples}`;
        });

  const blindLines =
    input.blindSpots.blindSpots.length === 0
      ? ["- none detected"]
      : input.blindSpots.blindSpots.map(
          (b) =>
            `- \`${b.extension}\`: ${b.repoFiles} repo files, ${b.graphFiles} in graph (coverage ${(b.coverage * 100).toFixed(0)}%)${b.nativeIndexable ? " [native-fillable]" : ""}`
        );

  const insights = [
    `## Sync summary`,
    `- Mode: **${input.mode}**`,
    `- Nodes: **${input.importSummary.nodeCount}** · Edges: **${input.importSummary.edgeCount}**`,
    `- Native blind-spot pass: **${input.nativeIndexRan ? "yes" : "no"}**`,
    ``,
    `## Leiden communities`,
    ...communityLines,
    ``,
    `## Blind spots (extension coverage)`,
    ...blindLines,
  ].join("\n");

  const toolOutputs =
    input.reportMd?.trim() ||
    `_No GRAPH_REPORT.md found. Communities derived from graph.json only._`;

  return {
    title,
    type: "runbook",
    description: `Graphify → codegraph sync for ${input.repoName} on ${input.date}`,
    insights,
    wikilinks,
    append: true,
    tags: ["clawql-codegraph", "graphify-sync", "architecture"],
    toolOutputs,
  };
}

/**
 * Consolidated Graphify → `codegraph_import_graphify` → optional native merge → vault proposal.
 * Does **not** call `memory_ingest` (keeps `clawql-codegraph` free of a memory dependency).
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

  let graphifyRan = false;
  let graphifyCmd: string | undefined;

  if (!options.skipGraphifyRun) {
    const resolvedOut = await resolveGraphifyArtifacts({ repoRoot, outDir: outDirHint });
    const template = options.graphifyCmd?.trim() || defaultGraphifySyncCommand();
    graphifyCmd = substituteCmd(template, repoRoot, resolvedOut.outDir);
    await runGraphifyCli(graphifyCmd, repoRoot);
    graphifyRan = true;
  }

  const artifacts = await resolveGraphifyArtifacts({ repoRoot, outDir: outDirHint });
  if (!artifacts.graphJson) {
    throw new Error(
      `Graphify sync: graph.json not found under ${artifacts.outDir} (set outDir, CLAWQL_CODEGRAPH_GRAPHIFY_JSON, or run Graphify first)`
    );
  }

  const storage = storageFromPath(options.storagePath);
  let doc = await importGraphifyFromPath({
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

  const catchBlindSpots =
    options.catchBlindSpots === true || (options.catchBlindSpots !== false && mode === "thorough");
  const forceNative = options.forceNative === true;

  let nativeIndexRan = false;
  let nativeIndexReason: string | undefined;
  let mergedSummary: IndexRepoResult | undefined;

  const shouldNative =
    forceNative || (catchBlindSpots && blindSpots.nativeFillable.length > 0);

  if (shouldNative) {
    nativeIndexReason = forceNative
      ? "forceNative"
      : `native-fillable blind spots: ${blindSpots.nativeFillable.map((b) => b.extension).join(", ")}`;
    const prevBackend = process.env.CLAWQL_CODEGRAPH_BACKEND;
    process.env.CLAWQL_CODEGRAPH_BACKEND = "native";
    try {
      const nativeDoc = await indexRepository({
        rootPath: repoRoot,
        graphId: `${importSummary.graphId}-native-pass`,
        maxFiles: options.maxFiles,
      });
      doc = mergeCodeGraphs(doc, nativeDoc, {
        graphId: importSummary.graphId,
        rootPath: repoRoot,
      });
      await storage.put(doc);
      mergedSummary = documentSummary(doc);
      nativeIndexRan = true;
    } finally {
      if (prevBackend === undefined) delete process.env.CLAWQL_CODEGRAPH_BACKEND;
      else process.env.CLAWQL_CODEGRAPH_BACKEND = prevBackend;
    }
  }

  const date = new Date().toISOString().slice(0, 10);
  const wantVault = options.vaultIngest !== false;
  const vaultIngest = wantVault
    ? buildVaultProposal({
        repoName,
        date,
        importSummary: mergedSummary ?? importSummary,
        communities,
        blindSpots,
        reportMd: reportText,
        mode,
        nativeIndexRan,
      })
    : undefined;

  return {
    mode,
    repoRoot,
    repoName,
    graphifyRan,
    graphifyCmd,
    artifacts: {
      graphJson: artifacts.graphJson,
      graphHtml: artifacts.graphHtml,
      reportMd: artifacts.reportMd,
    },
    importSummary,
    blindSpots,
    nativeIndexRan,
    nativeIndexReason,
    mergedSummary,
    communities,
    vaultIngest,
    graphHtmlPath: artifacts.graphHtml,
  };
}
