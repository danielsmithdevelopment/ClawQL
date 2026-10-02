/**
 * sandbox_exec backend: ephemeral Jobs/Pods on Kubernetes with Kata Containers runtimeClass.
 * Uses in-cluster ServiceAccount token (no kubectl / @kubernetes/client-node dependency).
 */

import { randomUUID } from "node:crypto";
import fs from "node:fs";
import https from "node:https";
import { Duration, Effect } from "effect";
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
  runtimeClassAvailable: (client: KataKubernetesClient) => Effect.Effect<boolean>;
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

function clientRequestEffect(
  client: KataKubernetesClient,
  method: string,
  path: string,
  body?: unknown
): Effect.Effect<{ status: number; body: string }, unknown> {
  return Effect.tryPromise({
    try: () => client.request(method, path, body),
    catch: (cause) => cause,
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

export function kataRuntimeClassAvailableEffect(
  client: KataKubernetesClient
): Effect.Effect<boolean> {
  return Effect.gen(function* () {
    const name = kataRuntimeClassName();
    const res = yield* clientRequestEffect(
      client,
      "GET",
      `/apis/node.k8s.io/v1/runtimeclasses/${name}`
    ).pipe(Effect.catch(() => Effect.succeed({ status: 0, body: "" })));
    return res.status === 200;
  });
}

/** Promise façade for capability probes that still await a boolean. */
export async function kataRuntimeClassAvailable(client: KataKubernetesClient): Promise<boolean> {
  return Effect.runPromise(kataRuntimeClassAvailableEffect(client));
}

export const defaultKataSandboxDeps: KataSandboxDeps = {
  client: createInClusterKataClient,
  runtimeClassAvailable: kataRuntimeClassAvailableEffect,
};

function failResponse(error: string): SandboxBridgeResponse {
  return {
    stdout: "",
    stderr: "",
    exitCode: -1,
    success: false,
    error,
  };
}

/**
 * Run a sandbox_exec snippet as an ephemeral Kata Job.
 * Soft-fails into {@link SandboxBridgeResponse} (Effect success channel).
 */
export function callKataSandboxEffect(
  input: SandboxCodeToolInput,
  deps: KataSandboxDeps = defaultKataSandboxDeps
): Effect.Effect<SandboxBridgeResponse> {
  return Effect.gen(function* () {
    const client = deps.client();
    if (!client) {
      return failResponse(
        "Kata sandbox backend requires in-cluster Kubernetes credentials (ServiceAccount token). " +
          "Set CLAWQL_SANDBOX_KATA_ENABLED=1 only when running inside a cluster with RBAC for Jobs."
      );
    }
    if (!(yield* deps.runtimeClassAvailable(client))) {
      return failResponse(
        `Kata RuntimeClass ${kataRuntimeClassName()} is not available in this cluster.`
      );
    }

    const timeoutMs = parseTimeoutMs(input.timeoutMs);
    const ns = client.namespace();
    const suffix = sanitizeK8sName(randomUUID());
    const cmName = `clawql-sandbox-cm-${suffix}`;
    const jobName = `clawql-sandbox-${suffix}`;
    const rel = snippetFilename(input.language);
    const serviceAccount = process.env.CLAWQL_SANDBOX_KATA_SERVICE_ACCOUNT?.trim();

    const cleanup = () =>
      Effect.gen(function* () {
        yield* clientRequestEffect(
          client,
          "DELETE",
          `/apis/batch/v1/namespaces/${ns}/jobs/${jobName}`
        ).pipe(Effect.catch(() => Effect.void));
        yield* clientRequestEffect(
          client,
          "DELETE",
          `/api/v1/namespaces/${ns}/configmaps/${cmName}`
        ).pipe(Effect.catch(() => Effect.void));
      });

    const run = Effect.gen(function* () {
      const cmRes = yield* clientRequestEffect(
        client,
        "POST",
        `/api/v1/namespaces/${ns}/configmaps`,
        {
          apiVersion: "v1",
          kind: "ConfigMap",
          metadata: { name: cmName, labels: { "clawql.dev/sandbox": "true" } },
          data: { [rel]: input.code },
        }
      );
      if (cmRes.status < 200 || cmRes.status >= 300) {
        return {
          stdout: "",
          stderr: cmRes.body.slice(0, 4000),
          exitCode: -1,
          success: false,
          error: `Failed to create sandbox ConfigMap (HTTP ${cmRes.status})`,
        } satisfies SandboxBridgeResponse;
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

      const jobRes = yield* clientRequestEffect(
        client,
        "POST",
        `/apis/batch/v1/namespaces/${ns}/jobs`,
        jobBody
      );
      if (jobRes.status < 200 || jobRes.status >= 300) {
        yield* clientRequestEffect(
          client,
          "DELETE",
          `/api/v1/namespaces/${ns}/configmaps/${cmName}`
        ).pipe(Effect.catch(() => Effect.void));
        return {
          stdout: "",
          stderr: jobRes.body.slice(0, 4000),
          exitCode: -1,
          success: false,
          error: `Failed to create sandbox Job (HTTP ${jobRes.status})`,
        } satisfies SandboxBridgeResponse;
      }

      const deadline = Date.now() + timeoutMs;
      let podName: string | undefined;
      while (Date.now() < deadline) {
        const statusRes = yield* clientRequestEffect(
          client,
          "GET",
          `/apis/batch/v1/namespaces/${ns}/jobs/${jobName}/status`
        ).pipe(Effect.catch(() => Effect.succeed({ status: 0, body: "" })));
        if (statusRes.status === 200) {
          const status = JSON.parse(statusRes.body) as {
            status?: { succeeded?: number; failed?: number };
          };
          if ((status.status?.succeeded ?? 0) > 0 || (status.status?.failed ?? 0) > 0) break;
        }
        const podsRes = yield* clientRequestEffect(
          client,
          "GET",
          `/api/v1/namespaces/${ns}/pods?labelSelector=job-name%3D${jobName}`
        ).pipe(Effect.catch(() => Effect.succeed({ status: 0, body: "" })));
        if (podsRes.status === 200) {
          const pods = JSON.parse(podsRes.body) as {
            items?: { metadata?: { name?: string } }[];
          };
          podName = pods.items?.[0]?.metadata?.name;
        }
        yield* Effect.sleep(Duration.millis(500));
      }

      if (!podName) {
        yield* cleanup();
        return failResponse(`Timed out waiting for Kata sandbox Job ${jobName}`);
      }

      const logsRes = yield* clientRequestEffect(
        client,
        "GET",
        `/api/v1/namespaces/${ns}/pods/${podName}/log?container=sandbox`
      ).pipe(Effect.catch(() => Effect.succeed({ status: 0, body: "" })));
      const podRes = yield* clientRequestEffect(
        client,
        "GET",
        `/api/v1/namespaces/${ns}/pods/${podName}/status`
      ).pipe(Effect.catch(() => Effect.succeed({ status: 0, body: "" })));
      let exitCode = 0;
      if (podRes.status === 200) {
        const pod = JSON.parse(podRes.body) as {
          status?: { containerStatuses?: { state?: { terminated?: { exitCode?: number } } }[] };
        };
        exitCode = pod.status?.containerStatuses?.[0]?.state?.terminated?.exitCode ?? -1;
      }

      yield* cleanup();
      return {
        stdout: logsRes.status === 200 ? logsRes.body : "",
        stderr: logsRes.status === 200 ? "" : logsRes.body.slice(0, 4000),
        exitCode,
        success: exitCode === 0,
        sandboxId: jobName,
        backend: "kata" as const,
      } satisfies SandboxBridgeResponse;
    });

    return yield* run.pipe(
      Effect.catch((e) =>
        Effect.gen(function* () {
          yield* cleanup();
          const msg = e instanceof Error ? e.message : String(e);
          return failResponse(msg);
        })
      )
    );
  });
}

/** Promise façade for callers that still await the Kata backend. */
export async function callKataSandbox(
  input: SandboxCodeToolInput,
  deps?: KataSandboxDeps
): Promise<SandboxBridgeResponse> {
  return Effect.runPromise(callKataSandboxEffect(input, deps));
}
