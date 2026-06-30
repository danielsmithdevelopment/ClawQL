/**
 * Chooses **`sandbox_exec`** backend: explicit **`CLAWQL_SANDBOX_BACKEND`**, or **auto**
 * (**Kata** → **Docker** → **Cloudflare bridge** → **Seatbelt** on macOS).
 */

import {
  bridgeCredentialsConfigured,
  dockerCliReachable,
  kataRuntimeReachable,
  seatbeltBinaryPresent,
} from "./capabilities.js";
import { inKubernetesCluster } from "./kata-kubernetes.js";
import type { SandboxExecBackendKind } from "./types.js";

/** `null` means **`CLAWQL_SANDBOX_BACKEND=auto`** (Kata → Docker → bridge → Seatbelt). Unset on-cluster defaults to auto; off-cluster defaults to bridge. */
export type ExplicitSandboxBackend = SandboxExecBackendKind | null;

/** Injected probes (for tests); defaults use real capability checks. */
export type SandboxBackendAutoDeps = {
  kata: () => Promise<boolean>;
  seatbelt: () => boolean;
  docker: () => Promise<boolean>;
  bridge: () => boolean;
};

export const defaultSandboxBackendAutoDeps: SandboxBackendAutoDeps = {
  kata: kataRuntimeReachable,
  seatbelt: seatbeltBinaryPresent,
  docker: dockerCliReachable,
  bridge: bridgeCredentialsConfigured,
};

export function parseExplicitSandboxBackendEnv(): ExplicitSandboxBackend {
  const v = process.env.CLAWQL_SANDBOX_BACKEND?.trim().toLowerCase();
  if (!v) {
    return inKubernetesCluster() ? null : "bridge";
  }
  if (v === "auto") return null;
  if (v === "kata" || v === "kata-containers" || v === "kata-qemu") return "kata";
  if (v === "bridge" || v === "cloudflare") return "bridge";
  if (v === "macos-seatbelt" || v === "seatbelt") return "macos-seatbelt";
  if (v === "docker" || v === "container" || v === "orbstack" || v === "podman") return "docker";
  return inKubernetesCluster() ? null : "bridge";
}

export const SANDBOX_AUTO_NONE_ERROR =
  "No sandbox_exec backend available after auto-selection (Kata → Docker → bridge → Seatbelt). " +
  "Configure one of: Kata RuntimeClass in-cluster (CLAWQL_SANDBOX_KATA_ENABLED=1), a working `docker`/`podman` CLI " +
  "(see CLAWQL_SANDBOX_DOCKER_BIN), Cloudflare bridge (CLAWQL_SANDBOX_BRIDGE_URL + CLAWQL_CLOUDFLARE_SANDBOX_API_TOKEN), " +
  "or macOS `/usr/bin/sandbox-exec`. Set CLAWQL_SANDBOX_BACKEND=auto for automatic selection, or kata|bridge|macos-seatbelt|docker to pin.";

export async function resolveSandboxBackendChoice(
  explicit: ExplicitSandboxBackend,
  deps: SandboxBackendAutoDeps = defaultSandboxBackendAutoDeps
): Promise<{ ok: true; backend: SandboxExecBackendKind } | { ok: false; error: string }> {
  if (explicit === "kata") return { ok: true, backend: "kata" };
  if (explicit === "bridge") return { ok: true, backend: "bridge" };
  if (explicit === "macos-seatbelt") return { ok: true, backend: "macos-seatbelt" };
  if (explicit === "docker") return { ok: true, backend: "docker" };

  if (await deps.kata()) return { ok: true, backend: "kata" };
  if (await deps.docker()) return { ok: true, backend: "docker" };
  if (deps.bridge()) return { ok: true, backend: "bridge" };
  if (deps.seatbelt()) return { ok: true, backend: "macos-seatbelt" };

  return { ok: false, error: SANDBOX_AUTO_NONE_ERROR };
}
