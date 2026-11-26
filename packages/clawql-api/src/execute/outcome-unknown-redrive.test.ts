import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect } from "effect";
import { afterEach, describe, expect, it } from "vitest";
import { resetProcessWormForTests } from "clawql-audit";
import {
  decidePendingExecution,
  loadPendingExecution,
  parkMandateExecute,
  resolvePendingOutcomeUnknown,
  tryConsumeApprovedMandate,
} from "../pending/pending-execution-service.js";
import { resetPendingSqliteCacheForTests } from "../pending/pending-execution-store.js";

describe("outcome-unknown redrive CAS (2.18)", () => {
  afterEach(async () => {
    await Effect.runPromise(resetProcessWormForTests());
    resetPendingSqliteCacheForTests();
    delete process.env.CLAWQL_HOME;
    delete process.env.CLAWQL_PENDING_STORE;
    process.env.CLAWQL_WORM_ENABLED = "0";
  });

  it("compare-and-set refuses a second concurrent redrive claim", async () => {
    const home = await mkdtemp(join(tmpdir(), "clawql-redrive-cas-"));
    process.env.CLAWQL_HOME = home;
    process.env.CLAWQL_PENDING_STORE = "file";
    process.env.CLAWQL_WORM_ENABLED = "0";

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
      idempotencyCapable: true,
    });
    await decidePendingExecution(parked.executionId, "approve", {
      home,
      approvedBy: { kind: "operator", id: "test-operator" },
    });
    const consumed = await tryConsumeApprovedMandate({
      executionId: parked.executionId,
      argsHash: parked.argsHash,
      home,
    });
    expect(consumed?.status).toBe("outcome_unknown");

    const first = await resolvePendingOutcomeUnknown(parked.executionId, "retry_with_key", home);
    expect(first.redriveClaimedAt).toBeTruthy();

    await expect(
      resolvePendingOutcomeUnknown(parked.executionId, "retry_with_key", home)
    ).rejects.toThrow(/already claimed|not redriveable/i);

    const after = await loadPendingExecution(parked.executionId, home);
    expect(after?.redriveClaimedBy).toBe(first.redriveClaimedBy);
  });
});
