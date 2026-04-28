/**
 * Chooses **`sandbox_exec`** backend: explicit **`CLAWQL_SANDBOX_BACKEND`**, or **auto**
 * (**Seatbelt** → **Docker** → **Cloudflare bridge**).
 */

import {
  bridgeCredentialsConfigured,
  dockerCliReachable,
  seatbeltBinaryPresent,
} from "./sandbox-capabilities.js";
import type { SandboxExecBackendKind } from "./sandbox-types.js";

/** `null` means **`CLAWQL_SANDBOX_BACKEND=auto`** (Seatbelt → Docker → bridge). Unset env defaults to **`bridge`** (non-breaking). */
export type ExplicitSandboxBackend = SandboxExecBackendKind | null;

/** Injected probes (for tests); defaults use real capability checks. */
export type SandboxBackendAutoDeps = {
  seatbelt: () => boolean;
  docker: () => Promise<boolean>;
  bridge: () => boolean;
};

export const defaultSandboxBackendAutoDeps: SandboxBackendAutoDeps = {
  seatbelt: seatbeltBinaryPresent,
  docker: dockerCliReachable,
  bridge: bridgeCredentialsConfigured,
};

export function parseExplicitSandboxBackendEnv(): ExplicitSandboxBackend {
  const v = process.env.CLAWQL_SANDBOX_BACKEND?.trim().toLowerCase();
  if (!v) return "bridge";
  if (v === "auto") return null;
  if (v === "bridge" || v === "cloudflare") return "bridge";
  if (v === "macos-seatbelt" || v === "seatbelt") return "macos-seatbelt";
  if (v === "docker" || v === "container" || v === "orbstack" || v === "podman") return "docker";
  return "bridge";
}

export const SANDBOX_AUTO_NONE_ERROR =
  "No sandbox_exec backend available after auto-selection (Seatbelt → Docker → bridge). " +
  "Install/configure one of: macOS `/usr/bin/sandbox-exec`, a working `docker`/`podman` CLI " +
  "(see CLAWQL_SANDBOX_DOCKER_BIN), or set CLAWQL_SANDBOX_BRIDGE_URL + CLAWQL_CLOUDFLARE_SANDBOX_API_TOKEN. " +
  "Set CLAWQL_SANDBOX_BACKEND=auto for automatic selection, or bridge|macos-seatbelt|docker to pin a backend.";

export async function resolveSandboxBackendChoice(
  explicit: ExplicitSandboxBackend,
  deps: SandboxBackendAutoDeps = defaultSandboxBackendAutoDeps
): Promise<{ ok: true; backend: SandboxExecBackendKind } | { ok: false; error: string }> {
  if (explicit === "bridge") return { ok: true, backend: "bridge" };
  if (explicit === "macos-seatbelt") return { ok: true, backend: "macos-seatbelt" };
  if (explicit === "docker") return { ok: true, backend: "docker" };

  if (deps.seatbelt()) return { ok: true, backend: "macos-seatbelt" };
  if (await deps.docker()) return { ok: true, backend: "docker" };
  if (deps.bridge()) return { ok: true, backend: "bridge" };

  return { ok: false, error: SANDBOX_AUTO_NONE_ERROR };
}
