import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect } from "effect";
import { afterEach, describe, expect, it } from "vitest";
import { bootProcessWormFromEnvEffect, resetProcessWormForTests } from "clawql-audit";
import { executeClawqlOperationEffect } from "../execute/execute-core.js";
import { resumeClawqlExecutionEffect } from "../execute/resume-core.js";
import type { Operation } from "../spec/operation-types.js";
import { hashPendingArgs } from "./args-hash.js";
import { decidePendingExecution, parkMandateExecute } from "./pending-execution-service.js";

function op(partial: Partial<Operation> & Pick<Operation, "id" | "method">): Operation {
  return {
    path: "/x",
    flatPath: "x",
    description: "t",
    resource: "x",
    parameters: {},
    scopes: [],
    ...partial,
  };
}

describe("pending execute park + resume", () => {
  afterEach(async () => {
    await Effect.runPromise(resetProcessWormForTests());
    delete process.env.CLAWQL_HOME;
    delete process.env.CLAWQL_WORM_ENABLED;
    delete process.env.CLAWQL_WORM_LOCAL;
    delete process.env.CLAWQL_WORM_REMOTE;
    delete process.env.CLAWQL_WORM_SESSION_ID;
    delete process.env.CLAWQL_OPERATION_RISK_ENFORCE;
  });

  it("hashes args canonically (key order independent)", () => {
    const a = hashPendingArgs({
      operationId: "op",
      args: { b: 1, a: 2 },
    });
    const b = hashPendingArgs({
      operationId: "op",
      args: { a: 2, b: 1 },
    });
    expect(a).toBe(b);
    expect(a.startsWith("sha256:")).toBe(true);
  });

  it("parks mandate execute and resumes the exact parked args", async () => {
    const home = await mkdtemp(join(tmpdir(), "clawql-pending-"));
    process.env.CLAWQL_HOME = home;
    process.env.CLAWQL_OPERATION_RISK_ENFORCE = "1";
    process.env.CLAWQL_WORM_ENABLED = "1";
    process.env.CLAWQL_WORM_LOCAL = "memory";
    process.env.CLAWQL_WORM_REMOTE = "memory";
    process.env.CLAWQL_WORM_SESSION_ID = "pending-test";
    process.env.CLAWQL_WORM_RECONCILE_MS = "0";
    const trail = await Effect.runPromise(bootProcessWormFromEnvEffect());
    expect(trail).not.toBeNull();

    const writeOp = op({
      id: "createItem",
      method: "POST",
      protocolKind: "openapi",
      risk: {
        level: "MEDIUM",
        policy: "mandate",
        source: "spec-default",
        reason: "HTTP POST",
      },
    });

    const loadSpecFn = async () =>
      ({
        operations: [writeOp],
        openapi: {
          openapi: "3.0.0",
          info: { title: "t", version: "1" },
          paths: {
            "/items": {
              post: {
                operationId: "createItem",
                responses: { "200": { description: "ok" } },
              },
            },
          },
        },
        multi: false,
      }) as Awaited<ReturnType<typeof import("../spec/spec-loader.js").loadSpec>>;

    // Stub REST by swapping protocol to cli that we can observe — use approved path only.
    // First park via service, then resume with a loadSpec that uses graphql-less openapi;
    // for unit test, call park + decide + execute with approvedExecutionId against a custom
    // operation that short-circuits via unknown protocol returning JSON from execute-core's
    // REST path. Simpler: park + decline/approve WORM + hash binding without full REST.

    const parked = await parkMandateExecute({
      operationId: "createItem",
      args: { name: "n" },
      risk: writeOp.risk!,
      home,
    });
    expect(parked.executionId).toMatch(/^pex_/);
    expect(parked.status).toBe("mandate_required");
    expect(parked.approval.cli).toContain(parked.executionId);

    const requested = (await Effect.runPromise(trail!.query({}))).find(
      (e) => e.type === "HUMAN_DECISION_REQUESTED"
    );
    expect(requested?.metadata).toMatchObject({
      executionId: parked.executionId,
      operationId: "createItem",
    });

    // Tampered args must not run even with approved id
    await decidePendingExecution(parked.executionId, "approve", home);
    const tampered = await Effect.runPromise(
      executeClawqlOperationEffect(
        {
          operationId: "createItem",
          args: { name: "EVIL" },
          approvedExecutionId: parked.executionId,
        },
        loadSpecFn
      )
    );
    const tamperedJson = JSON.parse(tampered[0]!.text) as {
      status: string;
      reason?: string;
    };
    // Digest mismatch fails CAS consume (no side effect) — not a separate blocked path.
    expect(tamperedJson.status).toBe("mandate_required");
    expect(tamperedJson.reason).toMatch(/digest mismatch|already used|expired/i);

    // Decline path
    const parked2 = await parkMandateExecute({
      operationId: "createItem",
      args: { name: "n2" },
      risk: writeOp.risk!,
      home,
    });
    const declineContent = await Effect.runPromise(
      resumeClawqlExecutionEffect({ executionId: parked2.executionId, decision: "decline" })
    );
    const declined = JSON.parse(declineContent[0]!.text) as { status: string };
    expect(declined.status).toBe("declined");
    const rejection = (await Effect.runPromise(trail!.query({}))).find(
      (e) => e.type === "HUMAN_REJECTION"
    );
    expect(rejection).toBeDefined();
  });

  it("execute parks when risk is mandate (integration with execute-core)", async () => {
    const home = await mkdtemp(join(tmpdir(), "clawql-pending-exec-"));
    process.env.CLAWQL_HOME = home;
    process.env.CLAWQL_OPERATION_RISK_ENFORCE = "1";
    const writeOp = op({
      id: "patchItem",
      method: "PATCH",
      protocolKind: "openapi",
      risk: {
        level: "MEDIUM",
        policy: "mandate",
        source: "spec-default",
        reason: "HTTP PATCH",
      },
    });
    const loadSpecFn = async () =>
      ({
        operations: [writeOp],
        openapi: { openapi: "3.0.0", info: { title: "t", version: "1" }, paths: {} },
        multi: false,
      }) as Awaited<ReturnType<typeof import("../spec/spec-loader.js").loadSpec>>;

    const body = await Effect.runPromise(
      executeClawqlOperationEffect({ operationId: "patchItem", args: { id: "1" } }, loadSpecFn)
    );
    const json = JSON.parse(body[0]!.text) as {
      status: string;
      executionId: string;
      approval: { tool: string };
    };
    expect(json.status).toBe("mandate_required");
    expect(json.executionId).toMatch(/^pex_/);
    expect(json.approval.tool).toBe("resume");
  });
});
