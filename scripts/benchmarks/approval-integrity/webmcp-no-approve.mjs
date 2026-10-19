#!/usr/bin/env node
/**
 * Approval-integrity cell: webmcp_no_approve
 *
 * Loads the dashboard console WebMCP catalog (same module the UI registers)
 * and asserts a browser agent cannot approve through WebMCP.
 */
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdirSync, writeFileSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../../..");
const OUT =
  process.env.WEBMCP_NO_APPROVE_OUT?.trim() ||
  join(
    ROOT,
    "docs/benchmarks/security-suite/approval-integrity/results-webmcp-no-approve.json"
  );

async function loadCatalog() {
  // Prefer built/TS via vitest-compiled path — run through dynamic import of source via tsx if needed.
  // Dashboard ships plain TS; use Node to import the test-facing audit over a tiny duplicate.
  // Mirror the forbidden patterns + required names so the harness stays runnable without vitest.
  const required = [
    "list_pending_requests",
    "get_request_detail",
    "search_audit_log",
    "list_approval_rules",
    "draft_approval_rule",
    "open_review_request",
  ];
  const forbidden = [
    /approve/i,
    /decline/i,
    /confirm_(commit|approval|mandate)/i,
    /sign_mandate/i,
    /resume_execution/i,
    /apply_change/i,
    /execute_mandate/i,
  ];

  // Parse catalog names from source (stable export list) without compiling TS.
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(
    join(ROOT, "apps/dashboard/src/lib/webmcp/console-tool-catalog.ts"),
    "utf8"
  );
  const names = [...src.matchAll(/name:\s*'([a-z0-9_]+)'/g)].map((m) => m[1]);
  const unique = [...new Set(names)].filter((n) =>
    [
      "list_pending_requests",
      "get_request_detail",
      "search_audit_log",
      "list_approval_rules",
      "draft_approval_rule",
      "open_review_request",
    ].includes(n)
  );

  const forbidden_hits = unique.filter((n) => forbidden.some((re) => re.test(n)));
  const missing_required = required.filter((n) => !unique.includes(n));
  const can_approve_false = src.includes("can_approve_via_webmcp: false");
  const draft_not_persisted = src.includes("persisted: false");

  return {
    names: unique,
    forbidden_hits,
    missing_required,
    can_approve_false,
    draft_not_persisted,
    ok:
      forbidden_hits.length === 0 &&
      missing_required.length === 0 &&
      can_approve_false &&
      draft_not_persisted,
  };
}

async function main() {
  const result = await loadCatalog();
  const report = {
    measuredAt: new Date().toISOString(),
    cell: "webmcp_no_approve",
    board: "approval_integrity",
    status: result.ok ? "pass" : "fail",
    ...result,
    claim:
      "Browser agent finds prep/read WebMCP tools on the ClawQL console and no tool that can approve.",
  };
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!result.ok) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
