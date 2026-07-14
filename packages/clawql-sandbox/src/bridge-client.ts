/**
 * Calls a Cloudflare Worker that runs @cloudflare/sandbox (SDK is Workers-only).
 * Deploy: cloudflare/sandbox-bridge/
 *
 * **Unset `CLAWQL_SANDBOX_BACKEND`:** Cloudflare bridge only (legacy). **`CLAWQL_SANDBOX_BACKEND=auto`:** Seatbelt → Docker → bridge.
 * Or pin **`bridge`**, **`macos-seatbelt`**, **`docker`**, etc.
 */

import { defaultPersistence, parseTimeoutMs } from "./shared.js";
import type { SandboxBridgeResponse, SandboxCodeToolInput } from "./types.js";

export type {
  SandboxBridgeResponse,
  SandboxCodeToolInput,
  SandboxLanguage,
  SandboxPersistenceMode,
  SandboxExecBackendKind,
} from "./types.js";

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

/**
 * Promise façade for callers that still import the bridge module entry.
 * Prefer plugin {@link handleSandboxExecToolInput} / {@link executeSandboxExecEffect}.
 */
export async function handleClawqlCodeToolInput(
  params: SandboxCodeToolInput
): Promise<{ content: { type: "text"; text: string }[] }> {
  const { Effect } = await import("effect");
  const { executeSandboxExecEffect } = await import("./effect/sandbox-exec-effect.js");
  return Effect.runPromise(executeSandboxExecEffect(params));
}
