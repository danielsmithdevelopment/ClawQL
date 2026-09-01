import { Effect } from "effect";
import { afterEach, describe, expect, it } from "vitest";
import {
  bootProcessWormFromEnv,
  bootProcessWormFromEnvEffect,
  appendProcessWormEffect,
  processWormBootState,
  resetProcessWormForTests,
} from "./process-worm.js";
import {
  appendPaymentEventToWormEffect,
  appendInferenceCallToWormEffect,
  appendInferenceResultToWormEffect,
  appendWebEventToWormEffect,
  wormInputFromPanguardDeny,
} from "./sinks.js";

describe("process WORM boot + append", () => {
  afterEach(async () => {
    await Effect.runPromise(resetProcessWormForTests());
    delete process.env.CLAWQL_WORM_ENABLED;
    delete process.env.CLAWQL_WORM_LOCAL;
    delete process.env.CLAWQL_WORM_REMOTE;
    delete process.env.CLAWQL_WORM_SESSION_ID;
    delete process.env.CLAWQL_WORM_TEE;
    delete process.env.CLAWQL_WORM_TEE_PLATFORM;
  });

  it("no-ops when CLAWQL_WORM_ENABLED is unset", async () => {
    delete process.env.CLAWQL_WORM_ENABLED;
    const svc = await bootProcessWormFromEnv();
    expect(svc).toBeNull();
    expect(await Effect.runPromise(processWormBootState())).toBe("disabled");
    const entry = await Effect.runPromise(
      appendProcessWormEffect({
        type: "SESSION_START",
        timestamp: new Date().toISOString(),
        sessionId: "s",
      })
    );
    expect(entry).toBeNull();
  });

  it("boots memory dual-ack and appends hash-chained entries", async () => {
    process.env.CLAWQL_WORM_ENABLED = "1";
    process.env.CLAWQL_WORM_LOCAL = "memory";
    process.env.CLAWQL_WORM_REMOTE = "memory";
    process.env.CLAWQL_WORM_SESSION_ID = "sess-wire";
    process.env.CLAWQL_WORM_RECONCILE_MS = "0";

    const svc = await Effect.runPromise(bootProcessWormFromEnvEffect());
    expect(svc).not.toBeNull();

    const a = await Effect.runPromise(
      appendProcessWormEffect({
        type: "SESSION_START",
        timestamp: new Date().toISOString(),
        sessionId: "",
      })
    );
    expect(a?.chainIndex).toBe(0);
    expect(a?.sessionId).toBe("sess-wire");

    const deny = await Effect.runPromise(
      Effect.gen(function* () {
        const input = yield* wormInputFromPanguardDeny({ toolName: "execute" });
        return yield* appendProcessWormEffect(input);
      })
    );
    expect(deny?.type).toBe("PANGUARD_DENY");
    expect(deny?.chainIndex).toBe(1);
    expect(deny?.prevHash).toBe(a!.hash);

    const web = await Effect.runPromise(
      appendWebEventToWormEffect({
        type: "WEB_SEARCH",
        ts: new Date().toISOString(),
        provider: "tavily",
        query: "clawql",
        ok: true,
      })
    );
    expect(web?.type).toBe("WEB_SEARCH");
    expect(web?.metadata?.source).toBe("web");

    const pay = await Effect.runPromise(
      appendPaymentEventToWormEffect({
        ts: new Date().toISOString(),
        category: "payment",
        action: "X402_PAYMENT_RECEIVED",
        summary: "test",
        payload: { tenant_id: "t1" },
      })
    );
    expect(pay?.type).toBe("X402_PAYMENT_RECEIVED");

    const infCall = await Effect.runPromise(
      appendInferenceCallToWormEffect({
        correlationId: "inf-1",
        modelId: "openai/gpt-4o",
        virtualKeyId: "vk1",
        messageCount: 2,
      })
    );
    expect(infCall?.type).toBe("INFERENCE_CALL");

    const infResult = await Effect.runPromise(
      appendInferenceResultToWormEffect({
        correlationId: "inf-1",
        modelId: "openai/gpt-4o",
        ok: true,
        inputTokens: 10,
        outputTokens: 5,
      })
    );
    expect(infResult?.type).toBe("INFERENCE_RESULT");

    const verify = await Effect.runPromise(svc!.verify());
    expect(verify.valid).toBe(true);
  });

  it("appends teeSignature when CLAWQL_WORM_TEE=1", async () => {
    process.env.CLAWQL_WORM_ENABLED = "1";
    process.env.CLAWQL_WORM_LOCAL = "memory";
    process.env.CLAWQL_WORM_REMOTE = "memory";
    process.env.CLAWQL_WORM_RECONCILE_MS = "0";
    process.env.CLAWQL_WORM_TEE = "1";

    const svc = await Effect.runPromise(bootProcessWormFromEnvEffect());
    expect(svc).not.toBeNull();

    const entry = await Effect.runPromise(
      appendProcessWormEffect({
        type: "SESSION_START",
        timestamp: new Date().toISOString(),
        sessionId: "tee-env",
      })
    );
    expect(entry?.teeSignature).toBeTruthy();
  });
});
