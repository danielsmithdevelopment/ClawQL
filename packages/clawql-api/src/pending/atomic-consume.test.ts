import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect } from "effect";
import { afterEach, describe, expect, it } from "vitest";
import { bootProcessWormFromEnvEffect, resetProcessWormForTests } from "clawql-audit";
import {
  decidePendingExecution,
  loadPendingExecution,
  parkMandateExecute,
  tryConsumeApprovedMandate,
} from "./pending-execution-service.js";
import { resetPendingSqliteCacheForTests } from "./pending-execution-store.js";

describe("atomic mandate consume", () => {
  afterEach(async () => {
    await Effect.runPromise(resetProcessWormForTests());
    resetPendingSqliteCacheForTests();
    delete process.env.CLAWQL_HOME;
    delete process.env.CLAWQL_PENDING_STORE;
    delete process.env.CLAWQL_WORM_ENABLED;
    delete process.env.CLAWQL_WORM_LOCAL;
    delete process.env.CLAWQL_WORM_REMOTE;
    delete process.env.CLAWQL_WORM_SESSION_ID;
  });

  it("exactly one of 50 concurrent consumes wins; others refuse", async () => {
    const home = await mkdtemp(join(tmpdir(), "clawql-consume-"));
    process.env.CLAWQL_HOME = home;
    process.env.CLAWQL_PENDING_STORE = "sqlite";
    resetPendingSqliteCacheForTests();
    process.env.CLAWQL_WORM_ENABLED = "1";
    process.env.CLAWQL_WORM_LOCAL = "memory";
    process.env.CLAWQL_WORM_REMOTE = "memory";
    process.env.CLAWQL_WORM_SESSION_ID = "consume-race";
    process.env.CLAWQL_WORM_RECONCILE_MS = "0";
    const trail = await Effect.runPromise(bootProcessWormFromEnvEffect());
    expect(trail).not.toBeNull();

    const parked = await parkMandateExecute({
      operationId: "createItem",
      args: { name: "n" },
      risk: {
        level: "MEDIUM",
        policy: "mandate",
        source: "spec-default",
        reason: "HTTP POST",
      },
      home,
    });
    await decidePendingExecution(parked.executionId, "approve", home);

    const results = await Promise.all(
      Array.from({ length: 50 }, (_, i) =>
        tryConsumeApprovedMandate({
          executionId: parked.executionId,
          argsHash: parked.argsHash,
          home,
          consumedBy: `replica-${i}`,
        })
      )
    );

    const wins = results.filter((r) => r !== null);
    const losses = results.filter((r) => r === null);
    expect(wins).toHaveLength(1);
    expect(losses).toHaveLength(49);
    expect(wins[0]!.status).toBe("outcome_unknown");
    expect(wins[0]!.consumedBy).toMatch(/^replica-/);

    const final = await loadPendingExecution(parked.executionId, home);
    expect(final?.status).toBe("outcome_unknown");

    const consumedEvents = (await Effect.runPromise(trail!.query({}))).filter(
      (e) => e.type === "MANDATE_CONSUMED"
    );
    expect(consumedEvents).toHaveLength(1);
    expect(consumedEvents[0]!.metadata).toMatchObject({
      executionId: parked.executionId,
      argsHash: parked.argsHash,
      outcome: "unknown",
    });
  });

  it("refuses consume on digest mismatch and after expiry", async () => {
    const home = await mkdtemp(join(tmpdir(), "clawql-consume-guard-"));
    process.env.CLAWQL_HOME = home;
    process.env.CLAWQL_PENDING_STORE = "sqlite";
    resetPendingSqliteCacheForTests();

    const parked = await parkMandateExecute({
      operationId: "createItem",
      args: { name: "n" },
      risk: {
        level: "MEDIUM",
        policy: "mandate",
        source: "spec-default",
        reason: "HTTP POST",
      },
      home,
    });
    await decidePendingExecution(parked.executionId, "approve", home);

    const badDigest = await tryConsumeApprovedMandate({
      executionId: parked.executionId,
      argsHash: "sha256:deadbeef",
      home,
    });
    expect(badDigest).toBeNull();

    const expired = await tryConsumeApprovedMandate({
      executionId: parked.executionId,
      argsHash: parked.argsHash,
      home,
      nowMs: Date.parse("2099-01-01T00:00:00.000Z"),
    });
    expect(expired).toBeNull();

    const stillApproved = await loadPendingExecution(parked.executionId, home);
    expect(stillApproved?.status).toBe("approved");
  });
});
