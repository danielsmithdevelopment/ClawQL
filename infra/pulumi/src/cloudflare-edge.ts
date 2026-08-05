import * as cloudflare from "@pulumi/cloudflare";
import * as pulumi from "@pulumi/pulumi";
import type { ProvisionInputs } from "./types.js";

export type CloudflareEdgeOutputs = {
  vaultBucketName: pulumi.Output<string>;
  kvNamespaceId: pulumi.Output<string>;
  kvNamespaceTitle: pulumi.Output<string>;
  d1DatabaseId: pulumi.Output<string>;
  d1DatabaseName: pulumi.Output<string>;
  queueId: pulumi.Output<string>;
  queueName: pulumi.Output<string>;
  workerScriptName?: pulumi.Output<string>;
  /** Suggested Wrangler binding names for gateway Worker. */
  bindingHints: {
    vaultBucket: string;
    semanticCacheKv: string;
    tenantsD1: string;
    requestQueue: string;
  };
};

const EDGE_WORKER_STUB = `/**
 * ClawQL gateway routing Worker stub (Pulumi-provisioned).
 * Replace with full MCP + memory + tier routing before Phase 1 exit.
 * @see docs/deployment/hosted-live-bootstrap.md
 */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/healthz" || url.pathname === "/health") {
      return Response.json({
        ok: true,
        service: "clawql-gateway",
        profile: "edge",
        bindings: {
          vault: Boolean(env.CLAWQL_VAULT),
          cache: Boolean(env.CLAWQL_SEMANTIC_CACHE),
          tenants: Boolean(env.CLAWQL_TENANTS),
          queue: Boolean(env.CLAWQL_QUEUE),
        },
      });
    }
    // IDP proxy stub until AWS is provisioned for Shared+ tenants
    if (url.pathname.startsWith("/idp") || url.searchParams.get("tier") === "shared") {
      return Response.json(
        {
          error: "upgrade_required",
          message:
            "IDP tiers require AWS K3s/EKS. Provision idp-k3s or eks profile, then update routing.",
        },
        { status: 503 }
      );
    }
    return Response.json(
      {
        error: "not_implemented",
        message:
          "Edge MCP gateway logic not yet deployed. Bindings are ready — ship Worker handlers next.",
        docs: "docs/deployment/hosted-live-bootstrap.md",
      },
      { status: 501 }
    );
  },
};
`;

/**
 * Cloudflare edge stack for Developer/Teams launch (GTM Phase 1).
 * Provisions R2 vault, KV semantic cache, D1 tenants/audit, Queues, optional Worker stub.
 */
export function createCloudflareEdge(inputs: ProvisionInputs): CloudflareEdgeOutputs {
  if (!inputs.cloudflareAccountId) {
    throw new Error("cloudflare:accountId config is required for edge profile");
  }

  const accountId = inputs.cloudflareAccountId;
  const nameBase = (inputs.edgeNamePrefix ?? "clawql")
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/^-+|-+$/g, "");

  const vaultBucket = new cloudflare.R2Bucket("clawql-vault-prod", {
    accountId,
    name: inputs.syncBucket || `${nameBase}-vault-prod`,
    location: inputs.r2Location ?? "enam",
  });

  const kv = new cloudflare.WorkersKvNamespace("clawql-semantic-cache", {
    accountId,
    title: `${nameBase}-semantic-cache`,
  });

  const d1 = new cloudflare.D1Database("clawql-tenants", {
    accountId,
    name: `${nameBase}-tenants`,
    primaryLocationHint: inputs.d1LocationHint ?? "enam",
  });

  const queue = new cloudflare.Queue("clawql-edge-queue", {
    accountId,
    queueName: `${nameBase}-edge-requests`,
  });

  const bindingHints = {
    vaultBucket: "CLAWQL_VAULT",
    semanticCacheKv: "CLAWQL_SEMANTIC_CACHE",
    tenantsD1: "CLAWQL_TENANTS",
    requestQueue: "CLAWQL_QUEUE",
  };

  let workerScriptName: pulumi.Output<string> | undefined;
  if (inputs.deployWorkerStub) {
    const scriptName = inputs.workerScriptName ?? `${nameBase}-gateway`;
    const script = new cloudflare.WorkersScript("clawql-gateway-stub", {
      accountId,
      scriptName,
      content: EDGE_WORKER_STUB,
      mainModule: "index.js",
      compatibilityDate: "2026-06-01",
      bindings: [
        { name: bindingHints.vaultBucket, type: "r2_bucket", bucketName: vaultBucket.name },
        { name: bindingHints.semanticCacheKv, type: "kv_namespace", namespaceId: kv.id },
        { name: bindingHints.tenantsD1, type: "d1", id: d1.id },
        { name: bindingHints.requestQueue, type: "queue", queueName: queue.queueName },
      ],
    });
    workerScriptName = script.scriptName;
  }

  return {
    vaultBucketName: vaultBucket.name,
    kvNamespaceId: kv.id,
    kvNamespaceTitle: kv.title,
    d1DatabaseId: d1.id,
    d1DatabaseName: d1.name,
    queueId: queue.queueId,
    queueName: queue.queueName,
    workerScriptName,
    bindingHints,
  };
}
