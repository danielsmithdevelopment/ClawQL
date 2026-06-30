import { logMcpToolShape } from "clawql-api/mcp/tool-shape-log";
import type { Plugin } from "clawql-core";
import { Effect } from "effect";
import { z } from "zod";
import { handleClawqlCodeToolInput, type SandboxCodeToolInput } from "../bridge-client.js";

export const SANDBOX_PLUGIN_ID = "clawql-sandbox";

export const sandboxCodeSchema = {
  code: z
    .string()
    .describe(
      "Source code to run isolated. In Kubernetes: unset CLAWQL_SANDBOX_BACKEND defaults to auto (Kata → Docker → bridge → Seatbelt). " +
        "Off-cluster unset = Cloudflare bridge. Pin kata|bridge|macos-seatbelt|docker or use auto."
    ),
  language: z
    .enum(["python", "javascript", "shell"])
    .describe("python (python3), javascript (Node .mjs), or shell (posix sh script body)."),
  sessionId: z
    .string()
    .optional()
    .describe(
      "When persistenceMode is session or persistent, reuse the same id to keep a stable sandbox filesystem (Docker/Seatbelt; Kata Jobs are ephemeral)."
    ),
  persistenceMode: z
    .enum(["ephemeral", "session", "persistent"])
    .optional()
    .describe(
      "Overrides CLAWQL_SANDBOX_PERSISTENCE_MODE. ephemeral = new sandbox each call; session = per sessionId; persistent = one shared sandbox."
    ),
  timeoutMs: z
    .number()
    .int()
    .min(1000)
    .optional()
    .describe("Optional wall-clock limit in ms (capped by CLAWQL_SANDBOX_TIMEOUT_MS_MAX)."),
};

export async function handleSandboxExecToolInput(
  params: SandboxCodeToolInput
): Promise<{ content: { type: "text"; text: string }[] }> {
  logMcpToolShape("sandbox_exec", {
    language: params.language,
    codeLen: params.code.length,
    persistenceMode: params.persistenceMode,
    timeoutMs: params.timeoutMs,
  });
  return handleClawqlCodeToolInput(params);
}

export function createSandboxPlugin(): Plugin {
  return {
    id: SANDBOX_PLUGIN_ID,
    version: "0.1.0",
    kind: "default",
    onRegister: (api) =>
      Effect.gen(function* () {
        yield* api.registerMcpTool({
          name: "sandbox_exec",
          schema: sandboxCodeSchema,
          handler: (args) => handleSandboxExecToolInput(args as SandboxCodeToolInput),
        });
      }),
  };
}
