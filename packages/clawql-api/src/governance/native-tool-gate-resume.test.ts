/**
 * Single-use mandate on native resume: approve once, resume with the same
 * approvedExecutionId must run the action at most once (serial + concurrent).
 *
 * Regression for: gateNativeToolBeforeInvoke allowing through when
 * approvedExecutionId is present without tryConsumeApprovedMandate.
 */

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
  resetPendingSqliteCacheForTests,
} from "../pending/index.js";
import { gateNativeToolBeforeInvoke } from "./native-tool-gate.js";

const TOOL = "brand_new_native_tool"; // fail-closed destructive

async function parkAndApprove(home: string) {
  const parked = await parkMandateExecute({
    operationId: `native.${TOOL}`,
    args: { payload: "once" },
    risk: {
      level: "HIGH",
      policy: "mandate",
      source: "mcp-annotation",
      reason: `native tool ${TOOL} (destructive)`,
    },
    home,
  });
  await decidePendingExecution(parked.executionId, "approve", home);
  return parked;
}

describe("native resume approvedExecutionId single-use", () => {
  afterEach(async () => {
    await Effect.runPromise(resetProcessWormForTests());
    resetPendingSqliteCacheForTests();
    delete process.env.CLAWQL_HOME;
    delete process.env.CLAWQL_PENDING_STORE;
    delete process.env.CLAWQL_OPERATION_RISK_ENFORCE;
    delete process.env.CLAWQL_WORM_ENABLED;
    delete process.env.CLAWQL_WORM_LOCAL;
    delete process.env.CLAWQL_WORM_REMOTE;
    delete process.env.CLAWQL_WORM_SESSION_ID;
  });

  it("serial: second resume with same approvedExecutionId is refused", async () => {
    const home = await mkdtemp(join(tmpdir(), "clawql-native-resume-serial-"));
    process.env.CLAWQL_HOME = home;
    process.env.CLAWQL_PENDING_STORE = "sqlite";
    process.env.CLAWQL_OPERATION_RISK_ENFORCE = "1";
    resetPendingSqliteCacheForTests();

    const parked = await parkAndApprove(home);
    const args = { payload: "once", approvedExecutionId: parked.executionId };

    const first = await gateNativeToolBeforeInvoke({
      toolName: TOOL,
      args,
      env: process.env,
    });
    expect(first.blocked).toBe(false);
    if (!first.blocked) {
      expect(first.consumedExecutionId).toBe(parked.executionId);
    }

    const second = await gateNativeToolBeforeInvoke({
      toolName: TOOL,
      args,
      env: process.env,
    });
    expect(second.blocked).toBe(true);
    if (second.blocked) {
      const body = JSON.parse(second.errorResult.content[0]!.text) as {
        status: string;
        executionId?: string;
      };
      expect(body.status).toBe("mandate_required");
      expect(body.executionId).toBe(parked.executionId);
    }

    const final = await loadPendingExecution(parked.executionId, home);
    expect(final?.status).toBe("outcome_unknown");
  });

  it("concurrent: exactly one of many resumes consumes; action would run once", async () => {
    const home = await mkdtemp(join(tmpdir(), "clawql-native-resume-race-"));
    process.env.CLAWQL_HOME = home;
    process.env.CLAWQL_PENDING_STORE = "sqlite";
    process.env.CLAWQL_OPERATION_RISK_ENFORCE = "1";
    process.env.CLAWQL_WORM_ENABLED = "1";
    process.env.CLAWQL_WORM_LOCAL = "memory";
    process.env.CLAWQL_WORM_REMOTE = "memory";
    process.env.CLAWQL_WORM_SESSION_ID = "native-resume-race";
    process.env.CLAWQL_WORM_RECONCILE_MS = "0";
    resetPendingSqliteCacheForTests();
    const trail = await Effect.runPromise(bootProcessWormFromEnvEffect());
    expect(trail).not.toBeNull();

    const parked = await parkAndApprove(home);
    const args = { payload: "once", approvedExecutionId: parked.executionId };

    const results = await Promise.all(
      Array.from({ length: 40 }, () =>
        gateNativeToolBeforeInvoke({
          toolName: TOOL,
          args,
          env: process.env,
        })
      )
    );

    const allows = results.filter((r) => !r.blocked);
    const blocks = results.filter((r) => r.blocked);
    expect(allows).toHaveLength(1);
    expect(blocks).toHaveLength(39);

    const final = await loadPendingExecution(parked.executionId, home);
    expect(final?.status).toBe("outcome_unknown");

    const consumedEvents = (await Effect.runPromise(trail!.query({}))).filter(
      (e) => e.type === "MANDATE_CONSUMED"
    );
    expect(consumedEvents).toHaveLength(1);
  });
});
