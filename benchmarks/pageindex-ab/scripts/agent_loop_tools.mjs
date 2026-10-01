/**
 * In-process tools for Track B agent-loop freeze (grep / read_around / codegraph_*).
 * Used by run_agent_loop_freeze.mjs — not a full MCP server.
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

// clawql-codegraph was purged in 8.0.0 (Track B retest: tie_purge vs working grep).
// This module keeps codegraph_* tool defs for archive/replay of prior Track B
// results, but the live path now returns a clear error instead of importing the
// deleted package. See docs/backlog/post-8.0-codegraph-revisit.md.
const CODEGRAPH_PURGED_ERROR =
  "error: clawql-codegraph purged (8.0.0) — see docs/backlog/post-8.0-codegraph-revisit.md";

const ROOTS = [
  "packages/clawql-memory/src",
  "packages/clawql-core/src",
  "packages/clawql-api/src",
];

export function resolveRepoRoot(fromDir) {
  return path.resolve(fromDir, "../../..");
}

/**
 * @deprecated clawql-codegraph was purged in 8.0.0. Always throws — kept so callers
 * (run_agent_loop_freeze.mjs) get a clear diagnostic instead of a missing-module crash.
 */
export async function ensureCodeGraph(_repoRoot) {
  throw new Error(CODEGRAPH_PURGED_ERROR);
}

export const TOOL_DEFS = {
  grep: {
    type: "function",
    function: {
      name: "grep",
      description: "Search repo source with ripgrep (fixed string or regex).",
      parameters: {
        type: "object",
        properties: {
          pattern: { type: "string" },
          glob: { type: "string", description: "optional glob e.g. **/*.ts" },
          max_matches: { type: "integer", default: 40 },
        },
        required: ["pattern"],
      },
    },
  },
  read_around: {
    type: "function",
    function: {
      name: "read_around",
      description: "Read a source file (optionally a line window).",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Repo-relative or absolute path" },
          start_line: { type: "integer" },
          end_line: { type: "integer" },
        },
        required: ["path"],
      },
    },
  },
  codegraph_query: {
    type: "function",
    function: {
      name: "codegraph_query",
      description: "Query the code graph for a symbol / path fragment.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string" },
          limit: { type: "integer", default: 12 },
        },
        required: ["query"],
      },
    },
  },
  codegraph_impact: {
    type: "function",
    function: {
      name: "codegraph_impact",
      description: "Upstream blast radius (dependents) for a seed symbol.",
      parameters: {
        type: "object",
        properties: {
          seedQuery: { type: "string" },
          depth: { type: "integer", default: 2 },
          limit: { type: "integer", default: 24 },
        },
        required: ["seedQuery"],
      },
    },
  },
  codegraph_explore: {
    type: "function",
    function: {
      name: "codegraph_explore",
      description: "One-shot explore: explain + neighbors + impact for a symbol.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string" },
          impactDepth: { type: "integer", default: 2 },
        },
        required: ["query"],
      },
    },
  },
  codegraph_neighbors: {
    type: "function",
    function: {
      name: "codegraph_neighbors",
      description: "Neighbors of a graph node id from codegraph_query.",
      parameters: {
        type: "object",
        properties: {
          nodeId: { type: "string" },
          limit: { type: "integer", default: 20 },
        },
        required: ["nodeId"],
      },
    },
  },
  codegraph_path: {
    type: "function",
    function: {
      name: "codegraph_path",
      description: "Shortest path between two symbols/concepts.",
      parameters: {
        type: "object",
        properties: {
          from: { type: "string" },
          to: { type: "string" },
        },
        required: ["from", "to"],
      },
    },
  },
};

function clip(s, n = 12000) {
  const t = String(s ?? "");
  return t.length <= n ? t : t.slice(0, n) + "\n…[truncated]";
}

export function runTool(name, args, ctx) {
  const { repoRoot } = ctx;
  if (isCodegraphTool(name)) {
    return CODEGRAPH_PURGED_ERROR;
  }
  if (name === "grep") {
    const pattern = String(args.pattern || "");
    if (!pattern) return "error: grep requires pattern";
    const max = Number(args.max_matches || 40);
    // Prefer caller paths; default to the four Track B packages (exist under repoRoot).
    const searchRoots = Array.isArray(args.paths) && args.paths.length
      ? args.paths.map(String)
      : ROOTS;
    for (const root of searchRoots) {
      const abs = path.isAbsolute(root) ? root : path.join(repoRoot, root);
      if (!fs.existsSync(abs)) {
        return `error: grep search root missing: ${root} (repoRoot=${repoRoot})`;
      }
    }
    const rgArgs = ["-n", "--no-heading", "-S", "--", pattern, ...searchRoots];
    if (args.glob) rgArgs.splice(0, 0, "-g", String(args.glob));
    const r = spawnSync("rg", rgArgs, {
      cwd: repoRoot,
      encoding: "utf8",
      maxBuffer: 4 * 1024 * 1024,
    });
    if (r.error) {
      return `error: failed to spawn rg (${r.error.message}). Is ripgrep installed on PATH?`;
    }
    // rg exit 0 = matches, 1 = no matches, 2 = error
    if (r.status === 2 || (r.status !== 0 && r.status !== 1)) {
      return clip(
        `error: rg exit ${r.status}\n${r.stderr || r.stdout || "(no stderr)"}`
      );
    }
    const lines = String(r.stdout || "")
      .split("\n")
      .filter(Boolean)
      .slice(0, max);
    if (!lines.length) {
      return `(no matches for ${JSON.stringify(pattern)} under ${searchRoots.join(", ")})`;
    }
    return clip(lines.join("\n"));
  }
  if (name === "read_around") {
    let p = String(args.path || "");
    if (!path.isAbsolute(p)) p = path.join(repoRoot, p);
    if (!p.startsWith(repoRoot)) return "error: path outside repo";
    if (!fs.existsSync(p)) return `error: missing file ${args.path}`;
    const st = fs.statSync(p);
    if (st.isDirectory()) {
      return `error: path is a directory (not a file): ${path.relative(repoRoot, p)}`;
    }
    const text = fs.readFileSync(p, "utf8");
    const lines = text.split("\n");
    let start = args.start_line != null ? Math.max(1, Number(args.start_line)) : 1;
    let end =
      args.end_line != null ? Math.min(lines.length, Number(args.end_line)) : lines.length;
    if (args.start_line == null && args.end_line == null) {
      // default window: first 200 lines
      end = Math.min(lines.length, 200);
    }
    const body = lines
      .slice(start - 1, end)
      .map((ln, i) => `${start + i}| ${ln}`)
      .join("\n");
    return clip(`// file: ${path.relative(repoRoot, p)}\n${body}`);
  }
  return `error: unknown tool ${name}`;
}

export function openAiToolsForArm(armTools) {
  return armTools.map((n) => TOOL_DEFS[n]).filter(Boolean);
}

export function isCodegraphTool(name) {
  return String(name || "").startsWith("codegraph_");
}
