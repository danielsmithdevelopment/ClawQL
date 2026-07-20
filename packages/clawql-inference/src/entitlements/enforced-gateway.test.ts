import { mkdir, writeFile } from "node:fs/promises";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { InferenceGateway, InferenceRequest, InferenceResponse } from "../gateway.js";
import { createOpenAiAdapter } from "../plugin/adapters/openai.js";
import { createUsageStore } from "clawql-payments";
import { EntitlementLimitError, EntitlementEnforcedGateway } from "./enforced-gateway.js";

class StubGateway implements InferenceGateway {
  readonly calls: InferenceRequest[] = [];

  async complete(request: InferenceRequest): Promise<InferenceResponse> {
    this.calls.push(request);
    return {
      content: "ok",
      model: request.model ?? "stub/model",
      correlationId: request.correlationId,
    };
  }
}

describe("EntitlementEnforcedGateway", () => {
  let home: string;
  let env: NodeJS.ProcessEnv;

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "clawql-inference-entitlements-"));
    env = {
      ...process.env,
      CLAWQL_HOME: home,
      CLAWQL_PAYMENTS_ENFORCE_INFERENCE: "1",
    };
    await mkdir(join(home, "Payments"), { recursive: true });
    await writeFile(
      join(home, "Payments", "payments.json"),
      `${JSON.stringify({ plan: "free", tenantId: "default" }, null, 2)}\n`
    );
  });

  afterEach(async () => {
    await rm(home, { recursive: true, force: true });
  });

  it("allows completions under the monthly inference limit", async () => {
    const inner = new StubGateway();
    const gateway = new EntitlementEnforcedGateway(inner, env);
    const result = await gateway.complete({
      model: "openai/gpt-4o",
      messages: [{ role: "user", content: "hi" }],
    });
    expect(result.content).toBe("ok");
    expect(inner.calls).toHaveLength(1);
  });

  it(
    "blocks completions when the monthly inference limit is reached",
    { timeout: 15_000 },
    async () => {
      const usageStore = createUsageStore(env);
      for (let i = 0; i < 100; i++) {
        await usageStore.increment("default", "inference_calls", 1, "free");
      }

      const inner = new StubGateway();
      const gateway = new EntitlementEnforcedGateway(inner, env);
      await expect(
        gateway.complete({
          model: "openai/gpt-4o",
          messages: [{ role: "user", content: "blocked" }],
        })
      ).rejects.toBeInstanceOf(EntitlementLimitError);
      expect(inner.calls).toHaveLength(0);
    }
  );

  it("uses virtual key team as tenant id", async () => {
    const inner = new StubGateway();
    const gateway = new EntitlementEnforcedGateway(inner, env);
    await gateway.complete({
      model: "openai/gpt-4o",
      messages: [{ role: "user", content: "team scoped" }],
      team: "acme",
    });
    const usage = await createUsageStore(env).getUsage("acme");
    expect(usage.inferenceCalls).toBe(1);
  });

  it(
    "passes through when enforcement is disabled",
    { timeout: 15_000 },
    async () => {
      const disabledEnv = { ...env, CLAWQL_PAYMENTS_ENFORCE_INFERENCE: "0" };
      const usageStore = createUsageStore(disabledEnv);
      for (let i = 0; i < 100; i++) {
        await usageStore.increment("default", "inference_calls", 1, "free");
      }

      const inner = new StubGateway();
      const gateway = new EntitlementEnforcedGateway(inner, disabledEnv);
      await expect(
        gateway.complete({
          model: "openai/gpt-4o",
          messages: [{ role: "user", content: "allowed without enforcement" }],
        })
      ).resolves.toMatchObject({ content: "ok" });
    }
  );

  it(
    "is wired into createInferenceGateway when enforcement is enabled",
    { timeout: 15_000 },
    async () => {
      const { createInferenceGateway } = await import("../gateway.js");
      const usageStore = createUsageStore(env);
      for (let i = 0; i < 100; i++) {
        await usageStore.increment("default", "inference_calls", 1, "free");
      }

      const gateway = createInferenceGateway({
        env,
        semanticCache: false,
        fallback: false,
        store: null,
        providers: new Map([
          ["openai", createOpenAiAdapter({ apiKey: "k", baseUrl: "https://api.openai.com/v1" })],
        ]),
      });

      await expect(
        gateway.complete({
          model: "openai/gpt-4o",
          messages: [{ role: "user", content: "blocked via factory" }],
        })
      ).rejects.toBeInstanceOf(EntitlementLimitError);
    }
  );
});
