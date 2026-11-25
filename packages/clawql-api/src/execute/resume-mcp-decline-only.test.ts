/**
 * Pass 2.01: MCP resume must not approve; agents cannot self-approve mandates.
 */

import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect } from "effect";
import { afterEach, describe, expect, it } from "vitest";
import { bootProcessWormFromEnvEffect, resetProcessWormForTests } from "clawql-audit";
import {
  loadPendingExecution,
  parkMandateExecute,
  resetPendingSqliteCacheForTests,
} from "../pending/index.js";
import { resumeClawqlExecutionEffect } from "./resume-core.js";

describe("MCP resume decline-only (audit 2.01)", () => {
  afterEach(async () => {
    await Effect.runPromise(resetProcessWormForTests());
    resetPendingSqliteCacheForTests();
    delete process.env.CLAWQL_HOME;
    delete process.env.CLAWQL_PENDING_STORE;
    delete process.env.CLAWQL_OPERATION_RISK_ENFORCE;
    process.env.CLAWQL_WORM_ENABLED = "0";
    delete process.env.CLAWQL_WORM_LOCAL;
    delete process.env.CLAWQL_WORM_REMOTE;
    delete process.env.CLAWQL_WORM_SESSION_ID;
  });

  async function park(home: string) {
    process.env.CLAWQL_HOME = home;
    process.env.CLAWQL_PENDING_STORE = "sqlite";
    process.env.CLAWQL_OPERATION_RISK_ENFORCE = "1";
    process.env.CLAWQL_WORM_ENABLED = "1";
    process.env.CLAWQL_WORM_LOCAL = "memory";
    process.env.CLAWQL_WORM_REMOTE = "memory";
    resetPendingSqliteCacheForTests();
    await Effect.runPromise(bootProcessWormFromEnvEffect());
    return parkMandateExecute({
      operationId: "patchItem",
      args: { id: "1" },
      risk: {
        level: "HIGH",
        policy: "mandate",
        source: "spec-default",
        reason: "HTTP PATCH",
      },
      home,
    });
  }

  it("refuses MCP approve and leaves the mandate pending (no HUMAN_APPROVAL)", async () => {
    const home = await mkdtemp(join(tmpdir(), "clawql-resume-mcp-approve-"));
    const parked = await park(home);

    const content = await Effect.runPromise(
      resumeClawqlExecutionEffect({
        executionId: parked.executionId,
        decision: "approve",
        channel: "mcp",
        // Even a forged operator principal must not help on the MCP channel.
        approvedBy: { kind: "operator", id: "forged" },
        home,
      })
    );
    const json = JSON.parse(content[0]!.text) as { ok?: boolean; error?: string };
    expect(json.ok).toBe(false);
    expect(json.error).toMatch(/decline-only|cannot self-approve/i);

    const still = await loadPendingExecution(parked.executionId, home);
    expect(still?.status).toBe("pending");
  });

  it("allows MCP decline without approving", async () => {
    const home = await mkdtemp(join(tmpdir(), "clawql-resume-mcp-decline-"));
    const parked = await park(home);

    const content = await Effect.runPromise(
      resumeClawqlExecutionEffect({
        executionId: parked.executionId,
        decision: "decline",
        channel: "mcp",
        home,
      })
    );
    const json = JSON.parse(content[0]!.text) as { ok?: boolean; status?: string };
    expect(json.ok).toBe(true);
    expect(json.status).toBe("declined");

    const still = await loadPendingExecution(parked.executionId, home);
    expect(still?.status).toBe("declined");
  });

  it("refuses approve without an operator principal", async () => {
    const home = await mkdtemp(join(tmpdir(), "clawql-resume-no-principal-"));
    const parked = await park(home);

    await expect(
      Effect.runPromise(
        resumeClawqlExecutionEffect({
          executionId: parked.executionId,
          decision: "approve",
          channel: "operator",
          home,
        })
      )
    ).rejects.toThrow(/operator-only/i);

    const still = await loadPendingExecution(parked.executionId, home);
    expect(still?.status).toBe("pending");
  });
});
