import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
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

const FALLBACK_WORKER_STUB = `/**
 * Fallback only — prefer cloudflare/gateway/dist/index.js (full Phase 1 gateway).
 */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/healthz" || url.pathname === "/health" || url.pathname === "/status") {
      return Response.json({ ok: true, service: "clawql-gateway", profile: "edge", fallback: true });
    }
    return Response.json({
      error: "gateway_bundle_missing",
      message: "Build cloudflare/gateway (npm run build) before pulumi up.",
      docs: "docs/deployment/hosted-live-bootstrap.md",
    }, { status: 501 });
  },
};
`;

function loadGatewayWorkerModule(): { content: string; source: string } {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(here, "../../../cloudflare/gateway/dist/index.js"),
    path.resolve(process.cwd(), "../../cloudflare/gateway/dist/index.js"),
    path.resolve(process.cwd(), "cloudflare/gateway/dist/index.js"),
    path.resolve(process.cwd(), "../cloudflare/gateway/dist/index.js"),
  ];
  for (const file of candidates) {
    if (existsSync(file)) {
      return { content: readFileSync(file, "utf8"), source: file };
    }
  }
  return { content: FALLBACK_WORKER_STUB, source: "fallback-stub" };
}

/**
 * Cloudflare edge stack for Developer/Teams launch (GTM Phase 1).
 * Provisions R2 vault, KV semantic cache, D1 tenants/audit, Queues, optional gateway Worker.
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
    const { content, source } = loadGatewayWorkerModule();
    pulumi.log.info(`Deploying clawql-gateway Worker module from ${source}`);
    const scriptName = inputs.workerScriptName ?? `${nameBase}-gateway`;
    const script = new cloudflare.WorkersScript("clawql-gateway", {
      accountId,
      scriptName,
      content,
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
