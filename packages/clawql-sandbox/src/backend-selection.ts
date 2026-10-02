/**
 * Chooses **`sandbox_exec`** backend: explicit **`CLAWQL_SANDBOX_BACKEND`**, or **auto**
 * (**Agent Substrate** → **Kata** → **Docker** → **Cloudflare bridge** → **Seatbelt** on macOS).
 * @see docs/adr/0011-isolation-agent-substrate-sandbox-celld.md
 */

import { Effect } from "effect";
import {
  agentSubstrateReachableEffect,
  bridgeCredentialsConfiguredEffect,
  dockerCliReachableEffect,
  kataRuntimeReachableEffect,
  seatbeltBinaryPresentEffect,
} from "./capabilities.js";
import { inKubernetesCluster } from "./kata-kubernetes.js";
import type { SandboxExecBackendKind } from "./types.js";

/** `null` means **`CLAWQL_SANDBOX_BACKEND=auto`**. Unset on-cluster defaults to auto; off-cluster defaults to bridge. */
export type ExplicitSandboxBackend = SandboxExecBackendKind | null;

/** Injected probes (for tests); defaults use real capability checks. */
export type SandboxBackendAutoDeps = {
  agentSubstrate: () => Effect.Effect<boolean>;
  kata: () => Effect.Effect<boolean>;
  seatbelt: () => Effect.Effect<boolean>;
  docker: () => Effect.Effect<boolean>;
  bridge: () => Effect.Effect<boolean>;
};

export const defaultSandboxBackendAutoDeps: SandboxBackendAutoDeps = {
  agentSubstrate: agentSubstrateReachableEffect,
  kata: kataRuntimeReachableEffect,
  seatbelt: seatbeltBinaryPresentEffect,
  docker: dockerCliReachableEffect,
  bridge: bridgeCredentialsConfiguredEffect,
};

export function parseExplicitSandboxBackendEnvEffect(): Effect.Effect<ExplicitSandboxBackend> {
  return Effect.sync(() => {
    const v = process.env.CLAWQL_SANDBOX_BACKEND?.trim().toLowerCase();
    if (!v) {
      return inKubernetesCluster() ? null : "bridge";
    }
    if (v === "auto") return null;
    if (
      v === "agent-substrate" ||
      v === "substrate" ||
      v === "agentsubstrate" ||
      v === "cloud-hypervisor" ||
      v === "gvisor"
    ) {
      return "agent-substrate";
    }
    if (v === "kata" || v === "kata-containers" || v === "kata-qemu") return "kata";
    if (v === "bridge" || v === "cloudflare") return "bridge";
    if (v === "macos-seatbelt" || v === "seatbelt") return "macos-seatbelt";
    if (v === "docker" || v === "container" || v === "orbstack" || v === "podman") return "docker";
    return inKubernetesCluster() ? null : "bridge";
  });
}

/** Sync façade for env parsing at host edges. */
export function parseExplicitSandboxBackendEnv(): ExplicitSandboxBackend {
  return Effect.runSync(parseExplicitSandboxBackendEnvEffect());
}

export const SANDBOX_AUTO_NONE_ERROR =
  "No sandbox_exec backend available after auto-selection (Agent Substrate → Kata → Docker → bridge → Seatbelt). " +
  "Configure one of: Agent Substrate (CLAWQL_SANDBOX_AGENT_SUBSTRATE_ENABLED=1 or URL+token; ADR 0011), " +
  "Kata RuntimeClass in-cluster (CLAWQL_SANDBOX_KATA_ENABLED=1), a working `docker`/`podman` CLI " +
  "(see CLAWQL_SANDBOX_DOCKER_BIN), Cloudflare bridge (CLAWQL_SANDBOX_BRIDGE_URL + CLAWQL_CLOUDFLARE_SANDBOX_API_TOKEN), " +
  "or macOS `/usr/bin/sandbox-exec`. Set CLAWQL_SANDBOX_BACKEND=auto for automatic selection, or " +
  "agent-substrate|kata|bridge|macos-seatbelt|docker to pin.";

export type SandboxBackendChoice =
  { ok: true; backend: SandboxExecBackendKind } | { ok: false; error: string };

export function resolveSandboxBackendChoiceEffect(
  explicit: ExplicitSandboxBackend,
  deps: SandboxBackendAutoDeps = defaultSandboxBackendAutoDeps
): Effect.Effect<SandboxBackendChoice> {
  return Effect.gen(function* () {
    if (explicit === "agent-substrate") return { ok: true as const, backend: "agent-substrate" };
    if (explicit === "kata") return { ok: true as const, backend: "kata" };
    if (explicit === "bridge") return { ok: true as const, backend: "bridge" };
    if (explicit === "macos-seatbelt") return { ok: true as const, backend: "macos-seatbelt" };
    if (explicit === "docker") return { ok: true as const, backend: "docker" };

    if (yield* deps.agentSubstrate()) return { ok: true as const, backend: "agent-substrate" };
    if (yield* deps.kata()) return { ok: true as const, backend: "kata" };
    if (yield* deps.docker()) return { ok: true as const, backend: "docker" };
    if (yield* deps.bridge()) return { ok: true as const, backend: "bridge" };
    if (yield* deps.seatbelt()) return { ok: true as const, backend: "macos-seatbelt" };

    return { ok: false as const, error: SANDBOX_AUTO_NONE_ERROR };
  });
}

/** Promise façade for callers that still await backend selection. */
export async function resolveSandboxBackendChoice(
  explicit: ExplicitSandboxBackend,
  deps?: SandboxBackendAutoDeps
): Promise<SandboxBackendChoice> {
  return Effect.runPromise(resolveSandboxBackendChoiceEffect(explicit, deps));
}
