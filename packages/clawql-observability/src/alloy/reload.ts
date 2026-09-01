/**
 * Alloy reload hooks after `applyAlloyConfigEffect` writes a River file.
 * Prefer SIGHUP for local/compose Alloy; Kubernetes rollout for in-cluster Alloy Deployments.
 */

import { Effect } from "effect";

import { ObservabilityError } from "../errors.js";

export type AlloySighupReloadConfig = {
  /** Process id of Grafana Alloy (`alloy run …`). */
  readonly pid: number;
  readonly signal?: NodeJS.Signals;
};

export type AlloyKubernetesReloadConfig = {
  readonly namespace: string;
  readonly deployment: string;
  /** Injectable for tests — defaults to `kubectl rollout restart`. */
  readonly exec?: (
    command: string,
    args: readonly string[]
  ) => Effect.Effect<void, ObservabilityError>;
};

const defaultKubectlExec = (
  command: string,
  args: readonly string[]
): Effect.Effect<void, ObservabilityError> =>
  Effect.tryPromise({
    try: async () => {
      const { spawn } = await import("node:child_process");
      await new Promise<void>((resolve, reject) => {
        const child = spawn(command, [...args], { stdio: ["ignore", "pipe", "pipe"] });
        let stderr = "";
        child.stderr?.on("data", (chunk: Buffer) => {
          stderr += chunk.toString("utf8");
        });
        child.on("error", reject);
        child.on("close", (code) => {
          if (code === 0) resolve();
          else reject(new Error(stderr.trim() || `kubectl exited ${code}`));
        });
      });
    },
    catch: (cause) =>
      new ObservabilityError({
        reason: "Alloy Kubernetes rollout restart failed",
        cause,
      }),
  });

/** Send SIGHUP to a local Alloy process so it reloads River config. */
export const reloadAlloyViaSighupEffect = (
  config: AlloySighupReloadConfig
): Effect.Effect<void, ObservabilityError> =>
  Effect.try({
    try: () => {
      if (!Number.isInteger(config.pid) || config.pid <= 0) {
        throw new Error(`invalid Alloy pid: ${config.pid}`);
      }
      process.kill(config.pid, config.signal ?? "SIGHUP");
    },
    catch: (cause) =>
      new ObservabilityError({
        reason: `Alloy SIGHUP failed for pid ${config.pid}`,
        cause,
      }),
  });

/** Restart an Alloy Deployment so pods pick up a ConfigMap-mounted River file. */
export const reloadAlloyViaKubernetesRolloutEffect = (
  config: AlloyKubernetesReloadConfig
): Effect.Effect<void, ObservabilityError> => {
  const exec = config.exec ?? defaultKubectlExec;
  return exec("kubectl", [
    "rollout",
    "restart",
    `deployment/${config.deployment}`,
    "-n",
    config.namespace,
  ]);
};

export type ResolveAlloyReloadFromEnvResult = {
  readonly reload?: () => Effect.Effect<void, ObservabilityError>;
  readonly mode: "none" | "sighup" | "kubernetes";
};

/**
 * Build an Alloy reload hook from env:
 * - `CLAWQL_ALLOY_RELOAD_PID` → SIGHUP
 * - `CLAWQL_ALLOY_RELOAD_K8S_DEPLOYMENT` (+ optional `_NAMESPACE`, default `observability`) → kubectl rollout
 */
export const resolveAlloyReloadFromEnvEffect = (
  env: NodeJS.ProcessEnv = process.env
): Effect.Effect<ResolveAlloyReloadFromEnvResult> =>
  Effect.sync(() => {
    const pidRaw = env.CLAWQL_ALLOY_RELOAD_PID?.trim();
    if (pidRaw) {
      const pid = Number.parseInt(pidRaw, 10);
      if (Number.isInteger(pid) && pid > 0) {
        return {
          mode: "sighup" as const,
          reload: () => reloadAlloyViaSighupEffect({ pid }),
        };
      }
    }

    const deployment = env.CLAWQL_ALLOY_RELOAD_K8S_DEPLOYMENT?.trim();
    if (deployment) {
      const namespace = env.CLAWQL_ALLOY_RELOAD_K8S_NAMESPACE?.trim() || "observability";
      return {
        mode: "kubernetes" as const,
        reload: () =>
          reloadAlloyViaKubernetesRolloutEffect({
            namespace,
            deployment,
          }),
      };
    }

    return { mode: "none" as const };
  });
