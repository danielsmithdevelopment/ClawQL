import { Effect } from "effect";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SandboxCodeToolInput } from "../bridge-client.js";
import { executeSandboxExecEffect } from "./sandbox-exec-effect.js";
import { SandboxExecService, sandboxExecLiveLayer } from "./sandbox-exec-service.js";
import { runSandboxEffect, sandboxExecProgram } from "./sandbox-effect-runtime.js";

vi.mock("../bridge-client.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../bridge-client.js")>();
  return {
    ...actual,
    handleClawqlCodeToolInput: vi.fn(async (params: SandboxCodeToolInput) => ({
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            success: true,
            backend: "bridge",
            stdout: `ran:${params.language}`,
            stderr: "",
            exitCode: 0,
          }),
        },
      ],
    })),
  };
});

describe("SandboxExecService", () => {
  afterEach(() => {
    vi.clearAllMocks();
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

  it("executeSandboxExecEffect returns tool-shaped content", async () => {
    const result = await Effect.runPromise(
      executeSandboxExecEffect({ code: "echo hi", language: "shell" })
    );
    expect(result.content).toHaveLength(1);
    expect(result.content[0]?.type).toBe("text");
  });
});
