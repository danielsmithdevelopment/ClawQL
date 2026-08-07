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
  /** Provisioning profile (defaults from cloud when omitted). */
  profile?: import("./profiles.js").ProvisionProfile;
  tier: ManagedTier;
  tenantId?: string;
  syncBucket: string;
  syncProvider?: SyncProvider;
  syncPrefix?: string;
  /** Required for `aws` / `gcp` golden-host; omit for cloudflare / idp-k3s. */
  goldenImageId?: string;
  region?: string;
  instanceType?: string;
  useSsmSecrets?: boolean;
  deployWorkerStub?: boolean;
  /** Edge Phase 2 — Worker plain_text binding CLAWQL_IDP_PROXY_ORIGIN. */
  idpProxyOrigin?: string;
  eksClusterName?: string;
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
  if (cfg.profile) out["clawql:profile"] = cfg.profile;
  if (cfg.goldenImageId) out["clawql:goldenImageId"] = cfg.goldenImageId;
  if (cfg.tenantId) out["clawql:tenantId"] = cfg.tenantId;
  if (cfg.syncPrefix) out["clawql:syncPrefix"] = cfg.syncPrefix;
  if (cfg.region) out["clawql:region"] = cfg.region;
  if (cfg.instanceType) out["clawql:instanceType"] = cfg.instanceType;
  if (cfg.useSsmSecrets !== undefined) {
    out["clawql:useSsmSecrets"] = cfg.useSsmSecrets ? "true" : "false";
  }
  if (cfg.deployWorkerStub !== undefined) {
    out["clawql:deployWorkerStub"] = cfg.deployWorkerStub ? "true" : "false";
  }
  if (cfg.idpProxyOrigin) out["clawql:idpProxyOrigin"] = cfg.idpProxyOrigin;
  if (cfg.eksClusterName) out["clawql:eksClusterName"] = cfg.eksClusterName;
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

/** Stack name helpers for live profiles. */
export function edgeStackName(env = "prod"): string {
  return `edge-${env}`;
}

export function idpK3sStackName(tenantId?: string): string {
  return tenantId
    ? `idp-k3s-${tenantId.replace(/[^a-zA-Z0-9-]/g, "-").toLowerCase()}`
    : "idp-k3s-bootstrap";
}

export function eksStackName(env = "prod"): string {
  return `eks-${env}`;
}
