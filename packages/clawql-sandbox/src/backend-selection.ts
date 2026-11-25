/**
 * Chooses **`sandbox_exec`** backend: explicit **`CLAWQL_SANDBOX_BACKEND`**, or **auto**
 * (**Agent Substrate** → **Kata** → **Docker** → **Seatbelt** on macOS → **Cloudflare bridge** last).
 * Unset always means **auto** (local backends first). Pin `bridge` explicitly for Cloudflare.
 * The regulated tier refuses the Cloudflare bridge.
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
import type { SandboxExecBackendKind } from "./types.js";

/** `null` means **`CLAWQL_SANDBOX_BACKEND=auto`**. Unset defaults to auto (local backends first); pin `bridge` explicitly for Cloudflare. */
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
      // Prefer auto (Agent Substrate → Kata → Docker → Seatbelt → bridge) everywhere (audit 3.07).
      return null;
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
    return null;
  });
}

/** Sync façade for env parsing at host edges. */
export function parseExplicitSandboxBackendEnv(): ExplicitSandboxBackend {
  return Effect.runSync(parseExplicitSandboxBackendEnvEffect());
}

export const SANDBOX_AUTO_NONE_ERROR =
  "No sandbox_exec backend available after auto-selection (Agent Substrate → Kata → Docker → Seatbelt → bridge). " +
  "Configure one of: Agent Substrate (CLAWQL_SANDBOX_AGENT_SUBSTRATE_ENABLED=1 or URL+token; ADR 0011), " +
  "Kata RuntimeClass in-cluster (CLAWQL_SANDBOX_KATA_ENABLED=1), a working `docker`/`podman` CLI " +
  "(see CLAWQL_SANDBOX_DOCKER_BIN), macOS `/usr/bin/sandbox-exec`, or Cloudflare bridge " +
  "(CLAWQL_SANDBOX_BRIDGE_URL + CLAWQL_CLOUDFLARE_SANDBOX_API_TOKEN; pin CLAWQL_SANDBOX_BACKEND=bridge). " +
  "Set CLAWQL_SANDBOX_BACKEND=auto for automatic selection, or agent-substrate|kata|bridge|macos-seatbelt|docker to pin.";

export const SANDBOX_REGULATED_BRIDGE_ERROR =
  "CLAWQL_TIER=regulated refuses the Cloudflare sandbox bridge. " +
  "Use a local backend (docker|macos-seatbelt|kata|agent-substrate) or CLAWQL_SANDBOX_BACKEND=auto.";

export type SandboxBackendChoice =
  { ok: true; backend: SandboxExecBackendKind } | { ok: false; error: string };

function tierIsRegulated(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.CLAWQL_TIER?.trim().toLowerCase() === "regulated";
}

export function resolveSandboxBackendChoiceEffect(
  explicit: ExplicitSandboxBackend,
  deps: SandboxBackendAutoDeps = defaultSandboxBackendAutoDeps,
  env: NodeJS.ProcessEnv = process.env
): Effect.Effect<SandboxBackendChoice> {
  return Effect.gen(function* () {
    const regulated = tierIsRegulated(env);

    if (explicit === "agent-substrate") return { ok: true as const, backend: "agent-substrate" };
    if (explicit === "kata") return { ok: true as const, backend: "kata" };
    if (explicit === "bridge") {
      if (regulated) return { ok: false as const, error: SANDBOX_REGULATED_BRIDGE_ERROR };
      return { ok: true as const, backend: "bridge" };
    }
    if (explicit === "macos-seatbelt") return { ok: true as const, backend: "macos-seatbelt" };
    if (explicit === "docker") return { ok: true as const, backend: "docker" };

    if (yield* deps.agentSubstrate()) return { ok: true as const, backend: "agent-substrate" };
    if (yield* deps.kata()) return { ok: true as const, backend: "kata" };
    if (yield* deps.docker()) return { ok: true as const, backend: "docker" };
    // Local macOS Seatbelt before Cloudflare bridge (audit 3.07).
    if (yield* deps.seatbelt()) return { ok: true as const, backend: "macos-seatbelt" };
    if (!regulated && (yield* deps.bridge())) return { ok: true as const, backend: "bridge" };

    return {
      ok: false as const,
      error: regulated ? SANDBOX_REGULATED_BRIDGE_ERROR : SANDBOX_AUTO_NONE_ERROR,
    };
  });
}

/** Promise façade for callers that still await backend selection. */
export async function resolveSandboxBackendChoice(
  explicit: ExplicitSandboxBackend,
  deps?: SandboxBackendAutoDeps,
  env?: NodeJS.ProcessEnv
): Promise<SandboxBackendChoice> {
  return Effect.runPromise(resolveSandboxBackendChoiceEffect(explicit, deps, env));
}
