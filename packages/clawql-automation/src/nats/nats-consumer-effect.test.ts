import { Effect } from "effect";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const startHitlCompletedConsumer = vi.fn(async () => undefined);
const stopNatsClient = vi.fn(async () => undefined);

vi.mock("./client.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./client.js")>();
  return {
    ...actual,
    startHitlCompletedConsumer: (...args: unknown[]) => startHitlCompletedConsumer(...args),
    stopNatsClient: (...args: unknown[]) => stopNatsClient(...args),
  };
});

import { natsHitlConsumerScopedEffect } from "./nats-consumer-effect.js";
import { resetNatsClientForTests } from "./client.js";

describe("natsHitlConsumerScopedEffect", () => {
  const saved: NodeJS.ProcessEnv = {};

  beforeEach(() => {
    for (const key of [
      "CLAWQL_NATS_URL",
      "CLAWQL_NATS_JETSTREAM",
      "CLAWQL_NATS_ENABLE_CONSUMER",
      "CLAWQL_NATS_CONSUMER_RESUME_WORKFLOW",
    ] as const) {
      saved[key] = process.env[key];
    }
    startHitlCompletedConsumer.mockClear();
    stopNatsClient.mockClear();
    resetNatsClientForTests();
  });

  afterEach(() => {
    for (const key of Object.keys(saved)) {
      const v = saved[key];
      if (v === undefined) delete process.env[key];
      else process.env[key] = v;
    }
  });

  it("acquireRelease resolves when NATS is not configured", async () => {
    delete process.env.CLAWQL_NATS_URL;
    delete process.env.CLAWQL_NATS_JETSTREAM;
    delete process.env.CLAWQL_NATS_ENABLE_CONSUMER;
    delete process.env.CLAWQL_NATS_CONSUMER_RESUME_WORKFLOW;

    await expect(
      Effect.runPromise(Effect.scoped(natsHitlConsumerScopedEffect(async () => ({ ok: true }))))
    ).resolves.toBeUndefined();
    expect(startHitlCompletedConsumer).toHaveBeenCalledOnce();
    expect(stopNatsClient).toHaveBeenCalledOnce();
  });

  it("starts then stops the HITL consumer when NATS HITL is configured", async () => {
    process.env.CLAWQL_NATS_URL = "nats://127.0.0.1:4222";
    process.env.CLAWQL_NATS_JETSTREAM = "1";
    process.env.CLAWQL_NATS_ENABLE_CONSUMER = "1";
    process.env.CLAWQL_NATS_CONSUMER_RESUME_WORKFLOW = "1";

    await Effect.runPromise(
      Effect.scoped(natsHitlConsumerScopedEffect(async () => ({ ok: true })))
    );
    expect(startHitlCompletedConsumer).toHaveBeenCalledOnce();
    expect(stopNatsClient).toHaveBeenCalledOnce();
  });
});
