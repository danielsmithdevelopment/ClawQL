import { buildReleaseManifest, type BundleFile, type ReleaseManifest } from "@artifacts-attempts/manifest";
import {
  buildGradualDeployRequest,
  type GradualDeployRequest,
} from "./canary.js";

export type ReleaseInput = {
  version: string;
  files: BundleFile[];
  taskId: string;
  attemptId: string;
  fork: string;
  commit: string;
  canaryPercent: number;
  dryRun?: boolean;
  /** Workers script version id for the canary slice (defaults from commit). */
  versionId?: string;
  previousVersionId?: string;
};

export type ReleaseOutput = {
  manifest: ReleaseManifest;
  arweaveId: string;
  dryRun: boolean;
  /** Offline Cloudflare gradual-deploy body (POST when credentials exist). */
  gradualDeploy: GradualDeployRequest;
};

export function prepareRelease(input: ReleaseInput): ReleaseOutput {
  const manifest = buildReleaseManifest({
    version: input.version,
    files: input.files,
    canaryPercent: input.canaryPercent,
    buildEnvironment: {
      type: "artifacts-fork",
      fork: input.fork,
      commit: input.commit,
      taskId: input.taskId,
      attemptId: input.attemptId,
      createdAt: new Date().toISOString(),
    },
  });
  const dryRun = input.dryRun !== false;
  const arweaveId = dryRun ? `local_${manifest.merkleRoot.slice(0, 16)}` : "pending_upload";
  const versionId = input.versionId ?? `ver_${input.commit.slice(0, 12)}`;
  const gradualDeploy = buildGradualDeployRequest({
    canaryPercent: input.canaryPercent,
    versionId,
    previousVersionId: input.previousVersionId,
  });
  return {
    dryRun,
    arweaveId,
    gradualDeploy,
    manifest: {
      ...manifest,
      permanence: {
        arweave: {
          txId: arweaveId,
          gateway: dryRun ? "file://.local/arweave" : "https://arweave.net",
        },
      },
    },
  };
}
