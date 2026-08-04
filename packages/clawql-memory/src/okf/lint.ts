/**
 * OKF v0.2 frontmatter lint for vault notes.
 *
 * ClawQL promotes optional OKF v0.2 trust fields to recommended/required via lint:
 * - `status` must be a valid enum when present
 * - `stale_after` must be a parseable ISO date; past dates require `status: stale` (or supersession)
 * - `verified.method` / `verified.by` must be recognized when present
 * - `.cqk` notes should carry `worm_ref` (ClawQL extension)
 */

import { parseVaultFrontmatter, type ParsedFrontmatter } from "./frontmatter.js";
import {
  OKF_STATUS_VALUES,
  OKF_VERIFIED_BY_VALUES,
  OKF_VERIFIED_METHOD_VALUES,
  type OkfStatus,
} from "./types.js";

export type OkfLintSeverity = "error" | "warning";

export type OkfLintIssue = {
  severity: OkfLintSeverity;
  code: string;
  message: string;
  path?: string;
};

export type OkfLintOptions = {
  /** Require `worm_ref` (ClawQL extension — typical for `.cqk`). */
  requireWormRef?: boolean;
  /** When true, past `stale_after` without `status: stale|superseded|retracted` is an error. */
  checkStale?: boolean;
  /** Known agent ids for `generated.by` (optional allow-list). */
  knownAgentIds?: string[];
  now?: Date;
};

function asString(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

function asStatus(v: unknown): OkfStatus | undefined {
  const s = asString(v);
  return OKF_STATUS_VALUES.includes(s as OkfStatus) ? (s as OkfStatus) : undefined;
}

export function lintOkfFrontmatter(
  fm: ParsedFrontmatter,
  options: OkfLintOptions = {}
): OkfLintIssue[] {
  const issues: OkfLintIssue[] = [];
  const now = options.now?.getTime() ?? Date.now();

  const type = asString(fm.type)?.trim();
  if (!type) {
    issues.push({
      severity: "error",
      code: "okf.missing_type",
      message: "OKF required field `type` is missing",
    });
  }

  const statusRaw = asString(fm.status);
  if (statusRaw != null && statusRaw !== "" && !asStatus(statusRaw)) {
    issues.push({
      severity: "error",
      code: "okf.invalid_status",
      message: `status must be one of: ${OKF_STATUS_VALUES.join(", ")} (got ${JSON.stringify(statusRaw)})`,
    });
  }

  const staleAfter = asString(fm.stale_after)?.trim();
  if (staleAfter) {
    const t = Date.parse(staleAfter);
    if (!Number.isFinite(t)) {
      issues.push({
        severity: "error",
        code: "okf.invalid_stale_after",
        message: `stale_after must be an ISO-8601 timestamp (got ${JSON.stringify(staleAfter)})`,
      });
    } else if (options.checkStale !== false && t < now) {
      const status = asStatus(fm.status);
      if (status === "current" || status == null) {
        issues.push({
          severity: "warning",
          code: "okf.stale_after_passed",
          message: `stale_after ${staleAfter} is in the past; set status to stale, superseded, or retract`,
        });
      }
    }
  }

  const verified = fm.verified;
  if (verified && typeof verified === "object" && !Array.isArray(verified)) {
    const v = verified as Record<string, unknown>;
    const by = asString(v.by);
    if (by && !OKF_VERIFIED_BY_VALUES.includes(by as (typeof OKF_VERIFIED_BY_VALUES)[number])) {
      issues.push({
        severity: "warning",
        code: "okf.unknown_verified_by",
        message: `verified.by "${by}" is non-standard (expected human|evaluator|agent)`,
      });
    }
    const method = asString(v.method);
    if (
      method &&
      !OKF_VERIFIED_METHOD_VALUES.includes(method as (typeof OKF_VERIFIED_METHOD_VALUES)[number])
    ) {
      issues.push({
        severity: "warning",
        code: "okf.unknown_verified_method",
        message: `verified.method "${method}" is non-standard (expected pr-review|evaluator|auto)`,
      });
    }
  }

  const generated = fm.generated;
  if (generated && typeof generated === "object" && !Array.isArray(generated)) {
    const g = generated as Record<string, unknown>;
    const by = asString(g.by);
    if (by && options.knownAgentIds?.length && !options.knownAgentIds.includes(by)) {
      issues.push({
        severity: "warning",
        code: "okf.unknown_agent",
        message: `generated.by "${by}" is not in the known agent identity list`,
      });
    }
  }

  if (options.requireWormRef) {
    const worm = fm.worm_ref;
    if (worm === undefined || worm === "") {
      issues.push({
        severity: "error",
        code: "okf.missing_worm_ref",
        message: "ClawQL `.cqk` notes require worm_ref (hash or null)",
      });
    }
  }

  return issues;
}

export function lintOkfMarkdown(
  markdown: string,
  options: OkfLintOptions & { path?: string } = {}
): OkfLintIssue[] {
  const fm = parseVaultFrontmatter(markdown);
  return lintOkfFrontmatter(fm, options).map((i) =>
    options.path ? { ...i, path: options.path } : i
  );
}
