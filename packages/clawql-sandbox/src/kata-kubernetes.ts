/**
 * sandbox_exec backend: ephemeral Jobs/Pods on Kubernetes with Kata Containers runtimeClass.
 * Uses in-cluster ServiceAccount token (no kubectl / @kubernetes/client-node dependency).
 */

import { randomUUID } from "node:crypto";
import fs from "node:fs";
import https from "node:https";
import type { SandboxBridgeResponse, SandboxCodeToolInput, SandboxLanguage } from "./types.js";
import { parseTimeoutMs, snippetFilename } from "./shared.js";

export type KataKubernetesClient = {
  request: (
    method: string,
    path: string,
    body?: unknown
  ) => Promise<{ status: number; body: string }>;
  namespace: () => string;
};

export type KataSandboxDeps = {
  client: () => KataKubernetesClient | undefined;
  runtimeClassAvailable: (client: KataKubernetesClient) => Promise<boolean>;
};

function readFileOrUndefined(path: string): string | undefined {
  try {
    return fs.readFileSync(path, "utf8").trim();
  } catch {
    return undefined;
  }
}

export function inKubernetesCluster(): boolean {
  return Boolean(process.env.KUBERNETES_SERVICE_HOST?.trim());
}

export function kataRuntimeClassName(): string {
  return (
    process.env.CLAWQL_SANDBOX_KATA_RUNTIME_CLASS?.trim() ||
    process.env.CLAWQL_KATA_RUNTIME_CLASS?.trim() ||
    "kata-qemu"
  );
}

export function kataSandboxNamespace(): string {
  return (
    process.env.CLAWQL_SANDBOX_KATA_NAMESPACE?.trim() ||
    readFileOrUndefined("/var/run/secrets/kubernetes.io/serviceaccount/namespace") ||
    "default"
  );
}

export function kataSandboxEnabled(): boolean {
  const v = process.env.CLAWQL_SANDBOX_KATA_ENABLED?.trim().toLowerCase();
  if (v === "0" || v === "false" || v === "no") return false;
  if (v === "1" || v === "true" || v === "yes") return true;
  return inKubernetesCluster();
}

function k8sBaseUrl(): string | undefined {
  const host = process.env.KUBERNETES_SERVICE_HOST?.trim();
  if (!host) return undefined;
  const port = process.env.KUBERNETES_SERVICE_PORT?.trim() || "443";
  return `https://${host}:${port}`;
}

function httpsRequest(
  url: string,
  method: string,
  headers: Record<string, string>,
  body?: string
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const ca = readFileOrUndefined("/var/run/secrets/kubernetes.io/serviceaccount/ca.crt");
    const req = https.request(
      {
        hostname: parsed.hostname,
        port: parsed.port || 443,
        path: `${parsed.pathname}${parsed.search}`,
        method,
        headers: {
          ...headers,
          ...(body ? { "Content-Length": Buffer.byteLength(body) } : {}),
        },
        ca,
        rejectUnauthorized: Boolean(ca),
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => {
          data += chunk.toString("utf8");
        });
        res.on("end", () => resolve({ status: res.statusCode ?? 0, body: data }));
      }
    );
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

export function createInClusterKataClient(): KataKubernetesClient | undefined {
  const base = k8sBaseUrl();
  const token = readFileOrUndefined("/var/run/secrets/kubernetes.io/serviceaccount/token");
  if (!base || !token) return undefined;

  return {
    namespace: kataSandboxNamespace,
    request: async (method, path, body) => {
      const payload = body === undefined ? undefined : JSON.stringify(body);
      return httpsRequest(
        `${base}${path}`,
        method,
        {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        payload
      );
    },
  };
}

function imageForLanguage(language: SandboxLanguage): string {
  switch (language) {
    case "python":
      return process.env.CLAWQL_SANDBOX_KATA_IMAGE_PYTHON?.trim() || "python:3.12-alpine";
    case "javascript":
      return process.env.CLAWQL_SANDBOX_KATA_IMAGE_NODE?.trim() || "node:22-alpine";
    case "shell":
      return process.env.CLAWQL_SANDBOX_KATA_IMAGE_SHELL?.trim() || "alpine:3.21";
    default:
      return "alpine:3.21";
  }
}

function innerCommand(language: SandboxLanguage): string[] {
  const rel = snippetFilename(language);
  switch (language) {
    case "python":
      return ["python3", `/workspace/${rel}`];
    case "javascript":
      return ["node", `/workspace/${rel}`];
    case "shell":
      return ["sh", `/workspace/${rel}`];
    default:
      return ["sh", `/workspace/${rel}`];
  }
}

function sanitizeK8sName(id: string): string {
  return id
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/^-+/, "")
    .slice(0, 52);
}

async function sleep(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

export async function kataRuntimeClassAvailable(client: KataKubernetesClient): Promise<boolean> {
  const name = kataRuntimeClassName();
  const res = await client.request("GET", `/apis/node.k8s.io/v1/runtimeclasses/${name}`);
  return res.status === 200;
}

export const defaultKataSandboxDeps: KataSandboxDeps = {
  client: createInClusterKataClient,
  runtimeClassAvailable: kataRuntimeClassAvailable,
};

export async function callKataSandbox(
  input: SandboxCodeToolInput,
  deps: KataSandboxDeps = defaultKataSandboxDeps
): Promise<SandboxBridgeResponse> {
  const client = deps.client();
  if (!client) {
    return {
      stdout: "",
      stderr: "",
      exitCode: -1,
      success: false,
      error:
        "Kata sandbox backend requires in-cluster Kubernetes credentials (ServiceAccount token). " +
        "Set CLAWQL_SANDBOX_KATA_ENABLED=1 only when running inside a cluster with RBAC for Jobs.",
    };
  }
  if (!(await deps.runtimeClassAvailable(client))) {
    return {
      stdout: "",
      stderr: "",
      exitCode: -1,
      success: false,
      error: `Kata RuntimeClass ${kataRuntimeClassName()} is not available in this cluster.`,
    };
  }

  const timeoutMs = parseTimeoutMs(input.timeoutMs);
  const ns = client.namespace();
  const suffix = sanitizeK8sName(randomUUID());
  const cmName = `clawql-sandbox-cm-${suffix}`;
  const jobName = `clawql-sandbox-${suffix}`;
  const rel = snippetFilename(input.language);
  const serviceAccount = process.env.CLAWQL_SANDBOX_KATA_SERVICE_ACCOUNT?.trim();

  const cleanup = async () => {
    await client.request("DELETE", `/apis/batch/v1/namespaces/${ns}/jobs/${jobName}`);
    await client.request("DELETE", `/api/v1/namespaces/${ns}/configmaps/${cmName}`);
  };

  try {
    const cmRes = await client.request("POST", `/api/v1/namespaces/${ns}/configmaps`, {
      apiVersion: "v1",
      kind: "ConfigMap",
      metadata: { name: cmName, labels: { "clawql.dev/sandbox": "true" } },
      data: { [rel]: input.code },
    });
    if (cmRes.status < 200 || cmRes.status >= 300) {
      return {
        stdout: "",
        stderr: cmRes.body.slice(0, 4000),
        exitCode: -1,
        success: false,
        error: `Failed to create sandbox ConfigMap (HTTP ${cmRes.status})`,
      };
    }

    const jobBody: Record<string, unknown> = {
      apiVersion: "batch/v1",
      kind: "Job",
      metadata: { name: jobName, labels: { "clawql.dev/sandbox": "true" } },
      spec: {
        ttlSecondsAfterFinished: 120,
        backoffLimit: 0,
        template: {
          metadata: { labels: { "clawql.dev/sandbox": "true", "job-name": jobName } },
          spec: {
            runtimeClassName: kataRuntimeClassName(),
            restartPolicy: "Never",
            ...(serviceAccount ? { serviceAccountName: serviceAccount } : {}),
            containers: [
              {
                name: "sandbox",
                image: imageForLanguage(input.language),
                command: innerCommand(input.language),
                volumeMounts: [{ name: "code", mountPath: "/workspace" }],
              },
            ],
            volumes: [{ name: "code", configMap: { name: cmName } }],
          },
        },
      },
    };

    const jobRes = await client.request("POST", `/apis/batch/v1/namespaces/${ns}/jobs`, jobBody);
    if (jobRes.status < 200 || jobRes.status >= 300) {
      await client.request("DELETE", `/api/v1/namespaces/${ns}/configmaps/${cmName}`);
      return {
        stdout: "",
        stderr: jobRes.body.slice(0, 4000),
        exitCode: -1,
        success: false,
        error: `Failed to create sandbox Job (HTTP ${jobRes.status})`,
      };
    }

    const deadline = Date.now() + timeoutMs;
    let podName: string | undefined;
    while (Date.now() < deadline) {
      const statusRes = await client.request(
        "GET",
        `/apis/batch/v1/namespaces/${ns}/jobs/${jobName}/status`
      );
      if (statusRes.status === 200) {
        const status = JSON.parse(statusRes.body) as {
          status?: { succeeded?: number; failed?: number };
        };
        if ((status.status?.succeeded ?? 0) > 0 || (status.status?.failed ?? 0) > 0) break;
      }
      const podsRes = await client.request(
        "GET",
        `/api/v1/namespaces/${ns}/pods?labelSelector=job-name%3D${jobName}`
      );
      if (podsRes.status === 200) {
        const pods = JSON.parse(podsRes.body) as { items?: { metadata?: { name?: string } }[] };
        podName = pods.items?.[0]?.metadata?.name;
      }
      await sleep(500);
    }

    if (!podName) {
      await cleanup();
      return {
        stdout: "",
        stderr: "",
        exitCode: -1,
        success: false,
        error: `Timed out waiting for Kata sandbox Job ${jobName}`,
      };
    }

    const logsRes = await client.request(
      "GET",
      `/api/v1/namespaces/${ns}/pods/${podName}/log?container=sandbox`
    );
    const podRes = await client.request("GET", `/api/v1/namespaces/${ns}/pods/${podName}/status`);
    let exitCode = 0;
    if (podRes.status === 200) {
      const pod = JSON.parse(podRes.body) as {
        status?: { containerStatuses?: { state?: { terminated?: { exitCode?: number } } }[] };
      };
      exitCode = pod.status?.containerStatuses?.[0]?.state?.terminated?.exitCode ?? -1;
    }

    await cleanup();
    return {
      stdout: logsRes.status === 200 ? logsRes.body : "",
      stderr: logsRes.status === 200 ? "" : logsRes.body.slice(0, 4000),
      exitCode,
      success: exitCode === 0,
      sandboxId: jobName,
      backend: "kata",
    };
  } catch (e: unknown) {
    await cleanup().catch(() => undefined);
    const msg = e instanceof Error ? e.message : String(e);
    return {
      stdout: "",
      stderr: "",
      exitCode: -1,
      success: false,
      error: msg,
    };
  }
}
