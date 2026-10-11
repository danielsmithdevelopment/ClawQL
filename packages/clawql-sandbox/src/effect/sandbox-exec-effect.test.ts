import { Effect } from "effect";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SandboxCodeToolInput } from "../bridge-client.js";
import * as backendSelection from "../backend-selection.js";
import {
  executeSandboxExecEffect,
  runSandboxBackend,
  runSandboxBackendEffect,
} from "./sandbox-exec-effect.js";
import { SandboxExecService, sandboxExecLiveLayer } from "./sandbox-exec-service.js";
import { runSandboxEffect, sandboxExecProgram } from "./sandbox-effect-runtime.js";

vi.mock("../backend-selection.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../backend-selection.js")>();
  return {
    ...actual,
    resolveSandboxBackendChoiceEffect: vi.fn(() =>
      Effect.succeed({
        ok: true as const,
        backend: "bridge" as const,
      })
    ),
    parseExplicitSandboxBackendEnvEffect: vi.fn(() => Effect.succeed("bridge" as const)),
  };
});

vi.mock("../bridge-client.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../bridge-client.js")>();
  return {
    ...actual,
    callSandboxBridgeEffect: vi.fn((params: SandboxCodeToolInput) =>
      Effect.succeed({
        success: true,
        backend: "bridge" as const,
        stdout: `ran:${params.language}`,
        stderr: "",
        exitCode: 0,
      })
    ),
  };
});

describe("SandboxExecService", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("stages resolve → dispatch via Effect.gen", async () => {
    const result = await Effect.runPromise(
      executeSandboxExecEffect({ code: "1+1", language: "javascript" })
    );
    expect(result.content[0]?.text).toContain("ran:javascript");
    expect(backendSelection.resolveSandboxBackendChoiceEffect).toHaveBeenCalled();
  });

  it("soft-fails when no backend resolves", async () => {
    vi.mocked(backendSelection.resolveSandboxBackendChoiceEffect).mockReturnValueOnce(
      Effect.succeed({
        ok: false,
        error: "No sandbox_exec backend available",
      })
    );
    const result = await Effect.runPromise(
      executeSandboxExecEffect({ code: "x", language: "python" })
    );
    const parsed = JSON.parse(result.content[0]!.text) as { success: boolean; error: string };
    expect(parsed.success).toBe(false);
    expect(parsed.error).toMatch(/No sandbox_exec backend/);
  });

  it("executes via Effect service layer", async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const svc = yield* SandboxExecService;
        return yield* svc.exec({ code: "1+1", language: "javascript" });
      }).pipe(Effect.provide(sandboxExecLiveLayer()))
    );

    expect(result.content[0]?.text).toContain("ran:javascript");
  });

  it("runSandboxEffect / sandboxExecProgram facade works", async () => {
    const result = await runSandboxEffect(
      sandboxExecProgram({ code: "print(1)", language: "python" })
    );
    expect(result.content[0]?.text).toContain("ran:python");
  });

  it("runSandboxBackend tags bridge responses", async () => {
    const result = await runSandboxBackend("bridge", { code: "x", language: "shell" });
    expect(result.backend).toBe("bridge");
    expect(result.success).toBe(true);
  });

  it("runSandboxBackendEffect is the Effect primary API", async () => {
    const result = await Effect.runPromise(
      runSandboxBackendEffect("bridge", { code: "x", language: "shell" })
    );
    expect(result.backend).toBe("bridge");
    expect(result.success).toBe(true);
  });
});
