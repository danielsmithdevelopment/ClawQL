#!/usr/bin/env node
/**
 * Draft oracle golds for Track B CodeGraph prove keys on the ClawQL monorepo.
 * Indexes clawql-codegraph + clawql-memory + clawql-core (dogfood scope + core).
 * Writes design/codegraph-prove-keys.oracle.json (machine assist; human must sign).
 *
 * NON-FUNCTIONAL since 8.0.0: clawql-codegraph was purged (Track B retest:
 * tie_purge vs working grep). Golds were already generated and committed under
 * design/codegraph-prove-keys.oracle.json — this script is kept only as a historical
 * record of how they were drafted. See docs/backlog/post-8.0-codegraph-revisit.md.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { writeFile, mkdir } from "node:fs/promises";
import {
  indexRepository,
  impactAnalysis,
  exploreGraph,
  shortestPath,
} from "clawql-codegraph";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../..");
const outDir = path.join(here, "../design");

const ROOTS = [
  path.join(repoRoot, "packages/clawql-codegraph/src"),
  path.join(repoRoot, "packages/clawql-memory/src"),
  path.join(repoRoot, "packages/clawql-core/src"),
  path.join(repoRoot, "packages/clawql-api/src"),
];

const SEEDS = [
  {
    id: "cg-prove-01",
    job: "impact",
    seed: "impactAnalysis",
    question:
      "Using the code graph (not grep), list the TypeScript symbols within depth 2 that depend on `impactAnalysis` (callers / importers). Name at least the service wrapper and the test that exercises it.",
    why_grep_fails:
      "String grep finds the definition and imports, but does not rank inbound blast radius or distinguish call vs mention in comments/docs; depth-2 dependents need the reverse edge walk.",
  },
  {
    id: "cg-prove-02",
    job: "impact",
    seed: "fireHook",
    question:
      "What is the upstream blast radius (depth ≤2) of renaming `fireHook`? List distinct package areas (files) that would need updates beyond the definition file.",
    why_grep_fails:
      "`fireHook` appears in many packages; grep dumps every string hit including tests/docs without a dependency-ordered impact set.",
  },
  {
    id: "cg-prove-03",
    job: "impact",
    seed: "createMemoryPlugin",
    question:
      "List depth-≤2 dependents of `createMemoryPlugin` (who wires or calls the memory plugin factory).",
    why_grep_fails:
      "The name appears in plugin docs and tests; inbound callers across packages need the reverse edge walk, not a string dump.",
  },
  {
    id: "cg-prove-04",
    job: "impact",
    seed: "queryGraph",
    question:
      "What is the depth-≤2 blast radius of `queryGraph`? Name dependents in explore/service/recall layers.",
    why_grep_fails:
      "`queryGraph` is a common-looking name; grep cannot separate live call edges from prose or distinguish explore vs recall wrappers.",
  },
  {
    id: "cg-prove-05",
    job: "impact",
    seed: "splitMarkdownSections",
    question:
      "Who depends on `splitMarkdownSections` (depth ≤2)? List impacted symbol names and files.",
    why_grep_fails:
      "Grep finds the export and direct imports, but misses re-exports / Effect wrappers and over-includes comment mentions.",
  },
  {
    id: "cg-prove-06",
    job: "explore",
    seed: "indexRepository",
    question:
      "Using one-shot explore, summarize `indexRepository`: primary file, notable neighbors (imports/calls), and top blast-radius hits.",
    why_grep_fails:
      "Explore aggregates explain + neighbors + impact; a single grep cannot assemble that neighborhood.",
  },
  {
    id: "cg-prove-07",
    job: "impact",
    seed: "reciprocalRankFusion",
    question:
      "List depth-≤2 dependents of `reciprocalRankFusion` (who would break if its signature changed).",
    why_grep_fails:
      "Need inbound edges across hybrid recall; string search confuses with RRF prose in design docs.",
  },
  {
    id: "cg-prove-08",
    job: "impact",
    seed: "defineProviderPlugin",
    question:
      "List depth-≤2 dependents of `defineProviderPlugin` across provider packages.",
    why_grep_fails:
      "Dozens of providers call the helper; the prove job is the dependency set / files to touch on signature change, not finding the definition.",
  },
  {
    id: "cg-prove-09",
    job: "impact",
    seed: "linkTypeScriptCrossFile",
    question:
      "What symbols/files sit in the depth-2 blast radius of `linkTypeScriptCrossFile`?",
    why_grep_fails:
      "Indexer pipeline wiring is multi-hop; grep of the name understates callers through sync/index entrypoints.",
  },
  {
    id: "cg-prove-10",
    job: "impact",
    seed: "grantsWithinAtr",
    question:
      "List depth-≤2 dependents of `grantsWithinAtr` across packages.",
    why_grep_fails:
      "ATR helpers are re-exported and called from visibility/hook paths; grep cannot separate live edges from design text.",
  },
  {
    id: "cg-prove-11",
    job: "explore",
    seed: "codegraphImpact",
    question:
      "Explore `codegraphImpact` (MCP handler): which service method does it call, and which files appear in its neighborhood?",
    why_grep_fails:
      "Handler → Effect service → impactAnalysis is a cross-file chain; grep of the handler name stops at the handler file.",
  },
  {
    id: "cg-prove-12",
    job: "impact",
    seed: "bm25Score",
    question:
      "List depth-≤2 dependents of `bm25Score` (ranker wrappers / Effect layers that would break on a scoring change).",
    why_grep_fails:
      "Grep finds the function and nearby helpers; the prove job is the inbound blast radius used for a safe rename.",
  },
];

async function mergeDocs(docs) {
  const nodes = {};
  const edges = [];
  for (const d of docs) {
    Object.assign(nodes, d.nodes);
    edges.push(...d.edges);
  }
  const adjacency = {};
  for (const e of edges) {
    (adjacency[e.from] ??= []).push(e.to);
  }
  return {
    graphId: "clawql-prove-draft",
    rootPath: repoRoot,
    builtAt: new Date().toISOString(),
    nodeCount: Object.keys(nodes).length,
    edgeCount: edges.length,
    nodes,
    edges,
    adjacency,
  };
}

async function main() {
  const docs = [];
  for (const root of ROOTS) {
    const r = await indexRepository({
      rootPath: root,
      graphId: path.basename(path.dirname(root)),
      maxFiles: 400,
    });
    const doc = r?.nodes ? r : r?.document || r?.doc;
    if (doc?.nodes) docs.push(doc);
  }
  if (docs.length === 0) {
    console.error("No documents indexed");
    process.exit(1);
  }
  const doc = await mergeDocs(docs);
  console.error(JSON.stringify({ nodeCount: doc.nodeCount, edgeCount: doc.edgeCount }));

  const keys = [];
  for (const s of SEEDS) {
    const row = {
      id: s.id,
      repo: "danielsmithdevelopment/ClawQL",
      roots: ROOTS.map((r) => path.relative(repoRoot, r)),
      job: s.job,
      question: s.question,
      why_grep_fails: s.why_grep_fails,
      gold: null,
      oracle_notes: "",
    };
    if (s.job === "impact") {
      const impact = impactAnalysis(doc, s.seed, 2, 40);
      row.gold = {
        seed: s.seed,
        seedNodeId: impact.seedNodeId,
        impacted_names: impact.impacted.map((h) => h.name).slice(0, 20),
        files: impact.files.slice(0, 20),
      };
      row.oracle_notes = `impact depth=2 n=${impact.impacted.length}`;
    } else if (s.job === "path") {
      const p = shortestPath(doc, s.from, s.to);
      row.gold = {
        from: s.from,
        to: s.to,
        found: p.found,
        path_names: (p.path || []).map((n) => n.name || n.nodeId || n),
      };
      row.oracle_notes = `path found=${p.found} len=${(p.path || []).length}`;
    } else if (s.job === "explore") {
      const ex = exploreGraph(doc, s.seed);
      row.gold = {
        seed: s.seed,
        primary: ex.primary?.node?.name ?? null,
        primary_file: ex.primary?.node?.filePath ?? null,
        neighbor_names: (ex.neighbors || []).slice(0, 12).map((n) => n.name || n.node?.name),
        impact_names: (ex.impact?.impacted || []).slice(0, 12).map((h) => h.name),
      };
      row.oracle_notes = "explore one-shot";
    }
    // Reject if oracle empty (grep-soluble risk / missing symbol)
    const empty =
      !row.gold ||
      (row.gold.impacted_names && row.gold.impacted_names.length === 0 && s.job === "impact") ||
      (s.job === "path" && !row.gold.found);
    row.machine_ok = !empty;
    keys.push(row);
  }

  await mkdir(outDir, { recursive: true });
  const outPath = path.join(outDir, "codegraph-prove-keys.oracle.json");
  await writeFile(
    outPath,
    JSON.stringify(
      {
        generated_at: new Date().toISOString(),
        graph: { nodeCount: doc.nodeCount, edgeCount: doc.edgeCount },
        keys,
        note: "Machine assist only — human must verify golds and why_grep_fails before spend.",
      },
      null,
      2
    ) + "\n"
  );
  console.log(
    JSON.stringify(
      {
        ok: true,
        out: outPath,
        keys: keys.length,
        machine_ok: keys.filter((k) => k.machine_ok).length,
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
