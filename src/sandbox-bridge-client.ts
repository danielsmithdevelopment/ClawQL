/**
 * Calls a Cloudflare Worker that runs @cloudflare/sandbox (SDK is Workers-only).
 * Deploy: cloudflare/sandbox-bridge/
 *
 * **Unset `CLAWQL_SANDBOX_BACKEND`:** Cloudflare bridge only (legacy). **`CLAWQL_SANDBOX_BACKEND=auto`:** Seatbelt → Docker → bridge.
 * Or pin **`bridge`**, **`macos-seatbelt`**, **`docker`**, etc.
 */

import {
  parseExplicitSandboxBackendEnv,
  resolveSandboxBackendChoice,
} from "./sandbox-backend-selection.js";
import { callDockerSandbox } from "./sandbox-container.js";
import { callMacosSeatbeltSandbox } from "./sandbox-macos-seatbelt.js";
import { defaultPersistence, parseTimeoutMs } from "./sandbox-shared.js";
import type { SandboxBridgeResponse, SandboxCodeToolInput } from "./sandbox-types.js";

export type {
  SandboxBridgeResponse,
  SandboxCodeToolInput,
  SandboxLanguage,
  SandboxPersistenceMode,
  SandboxExecBackendKind,
} from "./sandbox-types.js";

export async function callSandboxBridge(
  input: SandboxCodeToolInput
): Promise<SandboxBridgeResponse> {
  const base = process.env.CLAWQL_SANDBOX_BRIDGE_URL?.trim();
  const token = process.env.CLAWQL_CLOUDFLARE_SANDBOX_API_TOKEN?.trim();
  if (!base) {
    return {
      stdout: "",
      stderr: "",
      exitCode: -1,
      success: false,
      error:
        "CLAWQL_SANDBOX_BRIDGE_URL is not set. Deploy the Worker in cloudflare/sandbox-bridge/ and set this to its origin (e.g. https://clawql-sandbox.your-subdomain.workers.dev).",
    };
  }
  if (!token) {
    return {
      stdout: "",
      stderr: "",
      exitCode: -1,
      success: false,
      error:
        "CLAWQL_CLOUDFLARE_SANDBOX_API_TOKEN is not set. Use the same value as the Worker BRIDGE_SECRET (wrangler secret put BRIDGE_SECRET).",
    };
  }
  const url = new URL("exec", base.endsWith("/") ? base : `${base}/`);
  const persistenceMode = input.persistenceMode ?? defaultPersistence();
  const acct = process.env.CLAWQL_CLOUDFLARE_ACCOUNT_ID?.trim();
  const timeoutMs = parseTimeoutMs(input.timeoutMs);
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    };
    if (acct) headers["CF-Account-ID"] = acct;

    const res = await fetch(url.toString(), {
      method: "POST",
      headers,
      body: JSON.stringify({
        code: input.code,
        language: input.language,
        sessionId: input.sessionId,
        persistenceMode,
      }),
      signal: controller.signal,
    });
    const text = await res.text();
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(text) as Record<string, unknown>;
    } catch {
      return {
        stdout: "",
        stderr: text.slice(0, 4000),
        exitCode: -1,
        success: false,
        error: `Bridge returned non-JSON (HTTP ${res.status})`,
      };
    }
    if (!res.ok) {
      return {
        stdout: "",
        stderr: typeof data.stderr === "string" ? data.stderr : "",
        exitCode: -1,
        success: false,
        error: typeof data.error === "string" ? data.error : `HTTP ${res.status}`,
      };
    }
    return {
      stdout: String(data.stdout ?? ""),
      stderr: String(data.stderr ?? ""),
      exitCode: Number(data.exitCode ?? -1),
      success: Boolean(data.success),
      sandboxId: typeof data.sandboxId === "string" ? data.sandboxId : undefined,
    };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    const aborted = e instanceof Error && e.name === "AbortError";
    return {
      stdout: "",
      stderr: "",
      exitCode: -1,
      success: false,
      error: aborted ? `Timed out after ${timeoutMs}ms` : msg,
    };
  } finally {
    clearTimeout(id);
  }
}

export async function handleClawqlCodeToolInput(
  params: SandboxCodeToolInput
): Promise<{ content: { type: "text"; text: string }[] }> {
  const explicit = parseExplicitSandboxBackendEnv();
  const choice = await resolveSandboxBackendChoice(explicit);
  if (!choice.ok) {
    const err: SandboxBridgeResponse = {
      stdout: "",
      stderr: "",
      exitCode: -1,
      success: false,
      error: choice.error,
    };
    return {
      content: [{ type: "text", text: JSON.stringify(err, null, 2) }],
    };
  }

  let result: SandboxBridgeResponse;
  if (choice.backend === "macos-seatbelt") {
    result = await callMacosSeatbeltSandbox(params);
  } else if (choice.backend === "docker") {
    result = await callDockerSandbox(params);
  } else {
    result = { ...(await callSandboxBridge(params)), backend: "bridge" };
  }
  return {
    content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
  };
}
