import { buildReleaseManifest, type BundleFile, type ReleaseManifest } from "@artifacts-attempts/manifest";

export type ReleaseInput = {
  version: string;
  files: BundleFile[];
  taskId: string;
  attemptId: string;
  fork: string;
  commit: string;
  canaryPercent: number;
  dryRun?: boolean;
};

export type ReleaseOutput = {
  manifest: ReleaseManifest;
  arweaveId: string;
  dryRun: boolean;
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
  return {
    dryRun,
    arweaveId,
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
