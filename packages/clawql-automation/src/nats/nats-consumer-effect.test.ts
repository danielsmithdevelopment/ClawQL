import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { natsHitlConsumerScopedEffect } from "./nats-consumer-effect.js";
import { resetNatsClientForTests } from "./client.js";

describe("natsHitlConsumerScopedEffect", () => {
  it("acquireRelease no-ops when NATS is not configured", async () => {
    resetNatsClientForTests();
    delete process.env.CLAWQL_NATS_URL;
    delete process.env.CLAWQL_NATS_JETSTREAM;
    await Effect.runPromise(
      Effect.scoped(natsHitlConsumerScopedEffect(async () => ({ ok: true })))
    );
    expect(true).toBe(true);
  });
});
