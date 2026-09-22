import { Effect } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";

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
  beforeEach(() => {
    startHitlCompletedConsumer.mockClear();
    stopNatsClient.mockClear();
    resetNatsClientForTests();
  });

  it("acquireRelease calls start then stop on scope close", async () => {
    const handler = async () => ({ ok: true as const });
    await expect(
      Effect.runPromise(Effect.scoped(natsHitlConsumerScopedEffect(handler)))
    ).resolves.toBeUndefined();
    expect(startHitlCompletedConsumer).toHaveBeenCalledExactlyOnceWith(handler);
    expect(stopNatsClient).toHaveBeenCalledOnce();
  });
});
