import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { assignLouvainCommunities, type CodeGraphCommunity } from "../analyze/cluster.js";
import { renderGraphHtml } from "../analyze/html-export.js";
import { renderArchitectureReport } from "../analyze/report.js";
import { documentSummary, indexRepository, type IndexRepoResult } from "../indexer/index-repo.js";
import { storageFromPath } from "../storage/file-storage.js";
import { communityWikilinks } from "./graphify-communities.js";
import { detectBlindSpots, type BlindSpotReport } from "./blind-spots.js";

const execFileAsync = promisify(execFile);

export type CodeGraphSyncMode = "fast" | "thorough";

export type CodeGraphVaultIngestProposal = {
  readonly title: string;
  readonly type: string;
  readonly description: string;
  readonly insights: string;
  readonly wikilinks: readonly string[];
  readonly append: true;
  readonly tags: readonly string[];
  readonly toolOutputs: string;
};

export type CodeGraphSyncResult = {
  readonly mode: CodeGraphSyncMode;
  readonly repoRoot: string;
  readonly repoName: string;
  readonly engine: "native";
  readonly summary: IndexRepoResult;
  readonly blindSpots: BlindSpotReport;
  readonly communities: readonly CodeGraphCommunity[];
  readonly modularity: number;
  readonly artifacts: {
    readonly outDir: string;
    readonly graphJson: string;
    readonly reportMd: string;
    readonly graphHtml: string;
  };
  readonly vaultIngest?: CodeGraphVaultIngestProposal;
};

export type CodeGraphSyncOptions = {
  readonly rootPath?: string;
  readonly graphId?: string;
  readonly storagePath?: string;
  /** Reserved for future deeper passes; currently both modes run full native index + cluster. */
  readonly mode?: CodeGraphSyncMode;
  /** Write graph.json / GRAPH_REPORT.md / graph.html (default `{root}/codegraph-out`). */
  readonly outDir?: string;
  /** Build vault ingest proposal (default true). */
  readonly vaultIngest?: boolean;
  readonly maxFiles?: number;
  /** Write interactive HTML (default true). */
  readonly writeHtml?: boolean;
};

async function tryGitHead(repoRoot: string): Promise<string | undefined> {
  try {
    const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"], {
      cwd: repoRoot,
      timeout: 5_000,
    });
    return stdout.trim() || undefined;
  } catch {
    return undefined;
  }
}

function buildVaultProposal(input: {
  repoName: string;
  date: string;
  summary: IndexRepoResult;
  communities: readonly CodeGraphCommunity[];
  blindSpots: BlindSpotReport;
  reportMd: string;
  mode: CodeGraphSyncMode;
  modularity: number;
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
      ? ["- (no communities)"]
      : input.communities.map((c) => {
          const samples = c.sampleLabels.length
            ? ` — e.g. ${c.sampleLabels.slice(0, 4).join(", ")}`
            : "";
          return `- **${c.name}** (id=${c.id}, nodes=${c.nodeCount})${samples}`;
        });

  const blindLines =
    input.blindSpots.blindSpots.length === 0
      ? ["- none detected"]
      : input.blindSpots.blindSpots.map(
          (b) =>
            `- \`${b.extension}\`: ${b.repoFiles} repo files, ${b.graphFiles} in graph (coverage ${(b.coverage * 100).toFixed(0)}%)${b.nativeIndexable ? " [native]" : " [needs language extractor]"}`
        );

  const insights = [
    `## Sync summary`,
    `- Engine: **native TypeScript** (clawql-codegraph)`,
    `- Mode: **${input.mode}**`,
    `- Nodes: **${input.summary.nodeCount}** · Edges: **${input.summary.edgeCount}**`,
    `- Louvain modularity: **${input.modularity.toFixed(3)}**`,
    ``,
    `## Communities`,
    ...communityLines,
    ``,
    `## Blind spots (extension coverage)`,
    ...blindLines,
  ].join("\n");

  return {
    title,
    type: "runbook",
    description: `Native codegraph sync for ${input.repoName} on ${input.date}`,
    insights,
    wikilinks,
    append: true,
    tags: ["clawql-codegraph", "codegraph-sync", "architecture"],
    toolOutputs: input.reportMd,
  };
}

/**
 * Native TypeScript pipeline: index → Louvain cluster → report/HTML artifacts → vault proposal.
 * No Python / Graphify CLI dependency.
 */
export async function syncCodeGraph(
  options: CodeGraphSyncOptions = {}
): Promise<CodeGraphSyncResult> {
  const mode: CodeGraphSyncMode = options.mode === "thorough" ? "thorough" : "fast";
  const repoRoot = path.resolve(
    options.rootPath?.trim() ||
      process.env.CLAWQL_CODEGRAPH_ROOT?.trim() ||
      process.cwd()
  );
  const repoName = path.basename(repoRoot) || "repo";
  const outDir = path.resolve(
    options.outDir?.trim() ||
      process.env.CLAWQL_CODEGRAPH_OUT_DIR?.trim() ||
      path.join(repoRoot, "codegraph-out")
  );

  const prevBackend = process.env.CLAWQL_CODEGRAPH_BACKEND;
  process.env.CLAWQL_CODEGRAPH_BACKEND = "native";
  let indexed;
  try {
    indexed = await indexRepository({
      rootPath: repoRoot,
      graphId: options.graphId,
      maxFiles: options.maxFiles ?? (mode === "thorough" ? 20_000 : undefined),
    });
  } finally {
    if (prevBackend === undefined) delete process.env.CLAWQL_CODEGRAPH_BACKEND;
    else process.env.CLAWQL_CODEGRAPH_BACKEND = prevBackend;
  }

  const clustered = assignLouvainCommunities(indexed);
  const storage = storageFromPath(options.storagePath);
  await storage.put(clustered.document);
  const summary = documentSummary(clustered.document);

  const commit = await tryGitHead(repoRoot);
  const reportMd = renderArchitectureReport({
    repoName,
    document: clustered.document,
    communities: clustered.communities,
    modularity: clustered.modularity,
    algorithm: clustered.algorithm,
    commit,
  });

  await fs.mkdir(outDir, { recursive: true });
  const graphJsonPath = path.join(outDir, "graph.json");
  const reportPath = path.join(outDir, "GRAPH_REPORT.md");
  const htmlPath = path.join(outDir, "graph.html");

  // Portable node-link export (compatible with codegraph_import_graphify shape).
  const exportJson = {
    directed: true,
    multigraph: false,
    graph: { generator: "clawql-codegraph", algorithm: "louvain" },
    nodes: Object.values(clustered.document.nodes).map((n) => ({
      id: n.id,
      label: n.name,
      file_type: "code",
      source_file: n.filePath,
      source_location: n.startLine != null ? `L${n.startLine}` : undefined,
      community: n.community,
      community_name: n.community != null ? `Community ${n.community}` : undefined,
    })),
    links: clustered.document.edges.map((e) => ({
      source: e.from,
      target: e.to,
      relation: e.kind,
      confidence: e.confidence,
    })),
  };
  await fs.writeFile(graphJsonPath, JSON.stringify(exportJson, null, 2), "utf8");
  await fs.writeFile(reportPath, reportMd, "utf8");

  if (options.writeHtml !== false) {
    const html = renderGraphHtml({
      document: clustered.document,
      communities: clustered.communities,
      title: `${repoName} codegraph`,
    });
    await fs.writeFile(htmlPath, html, "utf8");
  }

  const blindSpots = await detectBlindSpots(repoRoot, clustered.document, {
    maxFiles: options.maxFiles,
  });

  const date = new Date().toISOString().slice(0, 10);
  const vaultIngest =
    options.vaultIngest === false
      ? undefined
      : buildVaultProposal({
          repoName,
          date,
          summary,
          communities: clustered.communities,
          blindSpots,
          reportMd,
          mode,
          modularity: clustered.modularity,
        });

  return {
    mode,
    repoRoot,
    repoName,
    engine: "native",
    summary,
    blindSpots,
    communities: clustered.communities,
    modularity: clustered.modularity,
    artifacts: {
      outDir,
      graphJson: graphJsonPath,
      reportMd: reportPath,
      graphHtml: htmlPath,
    },
    vaultIngest,
  };
}
