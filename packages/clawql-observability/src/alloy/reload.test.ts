import { Effect, Exit } from "effect";
import { describe, expect, it } from "vitest";

import {
  reloadAlloyViaKubernetesRolloutEffect,
  reloadAlloyViaSighupEffect,
  resolveAlloyReloadFromEnvEffect,
} from "./reload.js";

describe("alloy reload hooks", () => {
  it("resolves none when env is unset", async () => {
    const result = await Effect.runPromise(resolveAlloyReloadFromEnvEffect({}));
    expect(result.mode).toBe("none");
    expect(result.reload).toBeUndefined();
  });

  it("resolves sighup from CLAWQL_ALLOY_RELOAD_PID", async () => {
    const result = await Effect.runPromise(
      resolveAlloyReloadFromEnvEffect({ CLAWQL_ALLOY_RELOAD_PID: "12345" })
    );
    expect(result.mode).toBe("sighup");
    expect(result.reload).toBeTypeOf("function");
  });

  it("resolves kubernetes from deployment env", async () => {
    const result = await Effect.runPromise(
      resolveAlloyReloadFromEnvEffect({
        CLAWQL_ALLOY_RELOAD_K8S_DEPLOYMENT: "alloy",
        CLAWQL_ALLOY_RELOAD_K8S_NAMESPACE: "obs",
      })
    );
    expect(result.mode).toBe("kubernetes");
  });

  it("fails sighup for invalid pid", async () => {
    const exit = await Effect.runPromiseExit(reloadAlloyViaSighupEffect({ pid: -1 }));
    expect(Exit.isFailure(exit)).toBe(true);
  });

  it("invokes injectable kubectl exec for rollout", async () => {
    let seen: { command: string; args: readonly string[] } | undefined;
    await Effect.runPromise(
      reloadAlloyViaKubernetesRolloutEffect({
        namespace: "observability",
        deployment: "alloy",
        exec: (command, args) =>
          Effect.sync(() => {
            seen = { command, args };
          }),
      })
    );
    expect(seen).toEqual({
      command: "kubectl",
      args: ["rollout", "restart", "deployment/alloy", "-n", "observability"],
    });
  });
});
