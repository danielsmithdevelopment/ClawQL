/**
 * Pulumi Automation API helpers — programmatic `pulumi up` for operator / CLI flows.
 *
 * Example (future `clawql operator provision`):
 *   await upDedicatedTenant({ workDir: 'infra/pulumi', tenantId: 'acme', ... })
 */
import { automation } from "@pulumi/pulumi";
import type { CloudTarget, ManagedTier, SyncProvider } from "./types.js";

const { LocalWorkspace } = automation;

export type AutomationStackConfig = {
  cloud: CloudTarget;
  tier: ManagedTier;
  tenantId?: string;
  syncBucket: string;
  syncProvider?: SyncProvider;
  syncPrefix?: string;
  /** Required for `aws` / `gcp`; omit for `cloudflare` R2-only stacks. */
  goldenImageId?: string;
  region?: string;
  instanceType?: string;
  useSsmSecrets?: boolean;
};

export type UpStackOptions = {
  /** Directory containing Pulumi.yaml (e.g. repo `infra/pulumi`). */
  workDir: string;
  stackName: string;
  config: AutomationStackConfig;
  /** Pulumi secrets (e.g. sync keys) — stored encrypted in stack state. */
  secrets?: Record<string, string>;
  onOutput?: (msg: string) => void;
};

function toPulumiConfig(cfg: AutomationStackConfig): Record<string, string> {
  const out: Record<string, string> = {
    "clawql:cloud": cfg.cloud,
    "clawql:tier": cfg.tier,
    "clawql:syncBucket": cfg.syncBucket,
    "clawql:syncProvider": cfg.syncProvider ?? "r2",
  };
  if (cfg.goldenImageId) out["clawql:goldenImageId"] = cfg.goldenImageId;
  if (cfg.tenantId) out["clawql:tenantId"] = cfg.tenantId;
  if (cfg.syncPrefix) out["clawql:syncPrefix"] = cfg.syncPrefix;
  if (cfg.region) out["clawql:region"] = cfg.region;
  if (cfg.instanceType) out["clawql:instanceType"] = cfg.instanceType;
  if (cfg.useSsmSecrets !== undefined) {
    out["clawql:useSsmSecrets"] = cfg.useSsmSecrets ? "true" : "false";
  }
  return out;
}

export async function createOrSelectStack(opts: UpStackOptions) {
  const stack = await LocalWorkspace.createOrSelectStack({
    stackName: opts.stackName,
    workDir: opts.workDir,
  });

  for (const [key, value] of Object.entries(toPulumiConfig(opts.config))) {
    await stack.setConfig(key, { value });
  }
  if (opts.secrets) {
    for (const [key, value] of Object.entries(opts.secrets)) {
      await stack.setConfig(key, { value, secret: true });
    }
  }
  return stack;
}

export async function upProvisionStack(opts: UpStackOptions) {
  const stack = await createOrSelectStack(opts);
  return stack.up({ onOutput: opts.onOutput ?? ((m) => process.stderr.write(`${m}\n`)) });
}

export async function previewProvisionStack(opts: UpStackOptions) {
  const stack = await createOrSelectStack(opts);
  return stack.preview({ onOutput: opts.onOutput });
}

/** Convenience: dedicated tier stack name convention. */
export function dedicatedStackName(tenantId: string): string {
  const safe = tenantId.replace(/[^a-zA-Z0-9-]/g, "-").toLowerCase();
  return `dedicated-${safe}`;
}
