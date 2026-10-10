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
