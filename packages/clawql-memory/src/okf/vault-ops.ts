/**
 * Vault walk operations: OKF v0.2 migrate, lint, and simple query.
 */

import { readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { getObsidianVaultPath } from "../vault/config.js";
import { listVaultMarkdownRelPaths } from "../vault/slug-index.js";
import { writeVaultTextFileAtomic } from "../vault/utils.js";
import { migrateOkfFrontmatterToV02, parseVaultFrontmatter } from "./frontmatter.js";
import { lintOkfMarkdown, type OkfLintIssue } from "./lint.js";
import { emitMemoryWormEvent } from "./worm-events.js";
import { OKF_FORMAT_VERSION, type OkfStatus } from "./types.js";

export type VaultOpsOptions = {
  vault?: string;
  scanRoot?: string;
  maxFiles?: number;
  dryRun?: boolean;
  json?: boolean;
  checkStale?: boolean;
  requireWormRef?: boolean;
  knownAgentIds?: string[];
  openPrs?: boolean;
  /** Filter expression for query, e.g. `verified.by != human AND type == decision` */
  filter?: string;
  okfVersion?: string;
};

function resolveVault(opts: VaultOpsOptions): string {
  const fromOpts = opts.vault?.trim();
  if (fromOpts) return fromOpts;
  const env = getObsidianVaultPath();
  if (env) return env;
  throw new Error("Vault path required: pass --vault DIR or set CLAWQL_OBSIDIAN_VAULT_PATH");
}

function scanRoot(opts: VaultOpsOptions): string {
  if (opts.scanRoot !== undefined) return opts.scanRoot;
  const v = process.env.CLAWQL_MEMORY_RECALL_SCAN_ROOT;
  if (v === undefined) return "Memory";
  const t = v.trim();
  return t === "" ? "" : t;
}

async function loadVaultNotes(
  vaultAbs: string,
  root: string,
  maxFiles: number
): Promise<Array<{ rel: string; text: string }>> {
  const rels = await listVaultMarkdownRelPaths(vaultAbs, root, maxFiles);
  const out: Array<{ rel: string; text: string }> = [];
  for (const rel of rels) {
    const b = basename(rel).toLowerCase();
    if (b === "index.md" || b === "log.md" || b.startsWith("_index_")) continue;
    try {
      const text = await readFile(join(vaultAbs, rel), "utf8");
      out.push({ rel, text });
    } catch {
      /* skip unreadable */
    }
  }
  return out;
}

export type MigrateResult = {
  ok: boolean;
  vault: string;
  scanned: number;
  migrated: number;
  unchanged: number;
  dryRun: boolean;
  files: string[];
};

/** Non-destructive OKF v0.2 frontmatter migration across the vault. */
export async function migrateVaultToOkfV02(opts: VaultOpsOptions = {}): Promise<MigrateResult> {
  const version = (opts.okfVersion ?? "0.2").trim();
  if (version !== "0.2" && version !== OKF_FORMAT_VERSION) {
    throw new Error(`Unsupported --okf-version ${JSON.stringify(version)} (only 0.2)`);
  }
  const vault = resolveVault(opts);
  const root = scanRoot(opts);
  const maxFiles = opts.maxFiles ?? 50_000;
  const notes = await loadVaultNotes(vault, root, maxFiles);
  const files: string[] = [];
  let migrated = 0;
  let unchanged = 0;

  for (const note of notes) {
    const titleFallback = basename(note.rel).replace(/\.(md|cqk)$/i, "");
    const next = migrateOkfFrontmatterToV02(note.text, titleFallback);
    if (next === note.text) {
      unchanged++;
      continue;
    }
    migrated++;
    files.push(note.rel);
    if (!opts.dryRun) {
      await writeVaultTextFileAtomic(vault, note.rel, next);
      await emitMemoryWormEvent({
        kind: "MEMORY_MIGRATED",
        at: new Date().toISOString(),
        path: note.rel,
        detail: { okf_version: OKF_FORMAT_VERSION },
      });
    }
  }

  return {
    ok: true,
    vault,
    scanned: notes.length,
    migrated,
    unchanged,
    dryRun: Boolean(opts.dryRun),
    files,
  };
}

export type LintResult = {
  ok: boolean;
  vault: string;
  scanned: number;
  issues: OkfLintIssue[];
  stalePaths: string[];
  openPrBodies?: Array<{ path: string; title: string; body: string }>;
};

/** Lint all vault notes for OKF v0.2 trust-signal issues. */
export async function lintVaultOkf(opts: VaultOpsOptions = {}): Promise<LintResult> {
  const vault = resolveVault(opts);
  const root = scanRoot(opts);
  const maxFiles = opts.maxFiles ?? 50_000;
  const notes = await loadVaultNotes(vault, root, maxFiles);
  const issues: OkfLintIssue[] = [];
  const stalePaths: string[] = [];

  for (const note of notes) {
    const requireWorm = opts.requireWormRef === true || note.rel.toLowerCase().endsWith(".cqk");
    const fileIssues = lintOkfMarkdown(note.text, {
      path: note.rel,
      checkStale: opts.checkStale !== false,
      requireWormRef: requireWorm,
      knownAgentIds: opts.knownAgentIds,
    });
    for (const issue of fileIssues) {
      issues.push(issue);
      if (issue.code === "okf.stale_after_passed") stalePaths.push(note.rel);
    }
  }

  const errors = issues.filter((i) => i.severity === "error");
  let openPrBodies: LintResult["openPrBodies"];
  if (opts.openPrs && stalePaths.length > 0) {
    openPrBodies = [...new Set(stalePaths)].map((path) => ({
      path,
      title: `chore(vault): review stale OKF entry ${path}`,
      body: [
        `## Stale OKF entry`,
        ``,
        `\`${path}\` has \`stale_after\` in the past while \`status\` is still \`current\`.`,
        ``,
        `Please review: set \`status: stale|superseded|retracted\`, update content, or extend \`stale_after\`.`,
        ``,
        `Generated by \`clawql memory lint --check-stale --open-prs\`.`,
      ].join("\n"),
    }));
  }

  return {
    ok: errors.length === 0,
    vault,
    scanned: notes.length,
    issues,
    stalePaths: [...new Set(stalePaths)],
    openPrBodies,
  };
}

type QueryRow = {
  path: string;
  type?: string;
  status?: string;
  verifiedBy?: string;
  title?: string;
  correlationId?: string;
};

function matchSimpleFilter(row: QueryRow, filter: string): boolean {
  const expr = filter.trim();
  if (!expr) return true;
  // Support AND-joined equality / != on a small field set (blog example).
  const parts = expr.split(/\s+AND\s+/i).map((p) => p.trim());
  for (const part of parts) {
    const m = part.match(/^(verified\.by|type|status)\s*(==|!=)\s*(.+)$/i);
    if (!m) {
      throw new Error(
        `Unsupported filter fragment ${JSON.stringify(part)} (use verified.by|type|status with ==|!=)`
      );
    }
    const field = m[1]!.toLowerCase();
    const op = m[2]!;
    let expected = m[3]!.trim();
    if (
      (expected.startsWith('"') && expected.endsWith('"')) ||
      (expected.startsWith("'") && expected.endsWith("'"))
    ) {
      expected = expected.slice(1, -1);
    }
    const actual =
      field === "verified.by"
        ? (row.verifiedBy ?? "")
        : field === "type"
          ? (row.type ?? "")
          : (row.status ?? "");
    const eq = actual === expected;
    if (op === "==" ? !eq : eq) return false;
  }
  return true;
}

export type QueryResult = {
  ok: boolean;
  vault: string;
  count: number;
  rows: QueryRow[];
};

/** Query vault notes by simple OKF frontmatter filters. */
export async function queryVaultOkf(opts: VaultOpsOptions = {}): Promise<QueryResult> {
  const vault = resolveVault(opts);
  const root = scanRoot(opts);
  const maxFiles = opts.maxFiles ?? 50_000;
  const notes = await loadVaultNotes(vault, root, maxFiles);
  const rows: QueryRow[] = [];

  for (const note of notes) {
    const fm = parseVaultFrontmatter(note.text);
    const verified =
      fm.verified && typeof fm.verified === "object" && !Array.isArray(fm.verified)
        ? (fm.verified as Record<string, unknown>)
        : undefined;
    const row: QueryRow = {
      path: note.rel,
      type: typeof fm.type === "string" ? fm.type : undefined,
      status: typeof fm.status === "string" ? (fm.status as OkfStatus) : undefined,
      verifiedBy: typeof verified?.by === "string" ? verified.by : undefined,
      title: typeof fm.title === "string" ? fm.title : undefined,
      correlationId: typeof fm.correlation_id === "string" ? fm.correlation_id : undefined,
    };
    if (matchSimpleFilter(row, opts.filter ?? "")) {
      rows.push(row);
    }
  }

  return { ok: true, vault, count: rows.length, rows };
}

/** Build a map of correlation_id → OKF trust fields for export filtering. */
export async function loadOkfTrustByCorrelationId(opts: VaultOpsOptions = {}): Promise<
  Map<
    string,
    {
      path: string;
      status?: string;
      verifiedBy?: string;
      staleAfter?: string;
    }
  >
> {
  const vault = resolveVault(opts);
  const root = scanRoot(opts);
  const maxFiles = opts.maxFiles ?? 50_000;
  const notes = await loadVaultNotes(vault, root, maxFiles);
  const map = new Map<
    string,
    { path: string; status?: string; verifiedBy?: string; staleAfter?: string }
  >();
  for (const note of notes) {
    const fm = parseVaultFrontmatter(note.text);
    const cid = typeof fm.correlation_id === "string" ? fm.correlation_id.trim() : "";
    if (!cid) continue;
    const verified =
      fm.verified && typeof fm.verified === "object" && !Array.isArray(fm.verified)
        ? (fm.verified as Record<string, unknown>)
        : undefined;
    map.set(cid, {
      path: note.rel,
      status: typeof fm.status === "string" ? fm.status : undefined,
      verifiedBy: typeof verified?.by === "string" ? verified.by : undefined,
      staleAfter: typeof fm.stale_after === "string" ? fm.stale_after : undefined,
    });
  }
  return map;
}
