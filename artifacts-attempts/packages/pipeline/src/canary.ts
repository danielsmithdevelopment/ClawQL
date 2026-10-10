/**
 * Dry-run canary deployment status.
 * Live path swaps this for Workers deployments API / wrangler versions deploy.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export type CanaryStatus = {
  mode: "dry-run" | "live";
  strategy: "percentage";
  versions: Array<{ versionId: string; percentage: number; label: string }>;
  /** Rollback trigger copied from the release manifest (forced rollback UI is cut). */
  rollbackTrigger: string;
  recordedAt: string;
  note: string;
};

export function writeCanaryStatus(
  path: string,
  input: {
    canaryPercent: number;
    versionId: string;
    previousVersionId?: string;
    rollbackTrigger: string;
  }
): CanaryStatus {
  const previous = 100 - input.canaryPercent;
  const status: CanaryStatus = {
    mode: "dry-run",
    strategy: "percentage",
    versions: [
      {
        versionId: input.previousVersionId ?? "prev_stable",
        percentage: previous,
        label: "previous",
      },
      {
        versionId: input.versionId,
        percentage: input.canaryPercent,
        label: "canary",
      },
    ],
    rollbackTrigger: input.rollbackTrigger,
    recordedAt: new Date().toISOString(),
    note: "Dry-run only. Live deploy: POST /accounts/.../workers/scripts/.../deployments with strategy percentage.",
  };
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(status, null, 2));
  return status;
}

/** Validate a canary status payload (gate / verify / judge smoke). */
export function assertCanaryStatus(
  status: CanaryStatus,
  opts?: { expectPercent?: number; expectMode?: CanaryStatus["mode"] }
): { ok: true } | { ok: false; reason: string } {
  const expectMode = opts?.expectMode ?? "dry-run";
  const expectPercent = opts?.expectPercent ?? 10;
  if (status.mode !== expectMode) {
    return { ok: false, reason: `mode ${status.mode} !== ${expectMode}` };
  }
  if (status.strategy !== "percentage") {
    return { ok: false, reason: `strategy ${status.strategy} !== percentage` };
  }
  const canary = status.versions.find((v) => v.label === "canary");
  if (!canary) return { ok: false, reason: "missing canary version slice" };
  if (canary.percentage !== expectPercent) {
    return { ok: false, reason: `canary ${canary.percentage}% !== ${expectPercent}%` };
  }
  const previous = status.versions.find((v) => v.label === "previous");
  if (previous && previous.percentage + canary.percentage !== 100) {
    return { ok: false, reason: "version percentages must total 100" };
  }
  if (!status.rollbackTrigger || !status.rollbackTrigger.includes("error_rate")) {
    return { ok: false, reason: "rollbackTrigger must mention error_rate" };
  }
  return { ok: true };
}
