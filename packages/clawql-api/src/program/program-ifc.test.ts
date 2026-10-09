import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import type { OperationRiskPolicy } from "../risk/operation-risk-types.js";
import { programIfcHostEffect } from "./program-ifc.js";
import { runProgramEffect, type ProgramHost } from "./program-runner.js";

type FakeOp = { readonly method: string; readonly specLabel?: string };

const OPS: Readonly<Record<string, FakeOp>> = {
  "contracts.get": { method: "GET", specLabel: "github-internal" },
  "issues.list": { method: "GET", specLabel: "github" },
  "issues.create": { method: "POST", specLabel: "github" },
  "chat.postMessage": { method: "POST", specLabel: "slack" },
};

const IFC_ON: NodeJS.ProcessEnv = { CLAWQL_ENABLE_SESSION_IFC: "1", CLAWQL_SESSION_ID: "pifc" };

/** Every operation is `allow`, as when an operator allowlists the Slack post. */
function fakeHost(options?: { readonly omitOperation?: boolean }): {
  readonly host: ProgramHost;
  readonly executed: string[];
  readonly riskLookups: string[];
} {
  const executed: string[] = [];
  const riskLookups: string[] = [];
  const host: ProgramHost = {
    execute: (input) =>
      Effect.sync(() => {
        executed.push(input.operationId);
        const text = JSON.stringify({ ok: true, operationId: input.operationId });
        return { content: [{ type: "text" as const, text }] };
      }),
    search: (input) =>
      Effect.succeed({ formattedText: JSON.stringify({ ok: true, query: input.query }) }),
    resolveRisk: (operationId) =>
      Effect.sync(() => {
        riskLookups.push(operationId);
        const op = OPS[operationId];
        if (!op) return { found: false };
        const policy: OperationRiskPolicy = "allow";
        return options?.omitOperation
          ? { found: true, policy }
          : { found: true, policy, operation: op };
      }),
  };
  return { host, executed, riskLookups };
}

const run = (
  mode: "parallel" | "sequential",
  operationIds: readonly string[],
  host: ProgramHost,
  env: NodeJS.ProcessEnv
) =>
  Effect.runPromise(
    runProgramEffect(
      {
        source: JSON.stringify({
          v: 1,
          mode,
          calls: operationIds.map((operationId) => ({ tool: "execute", operationId, args: {} })),
        }),
      },
      host,
      env
    )
  );

describe("program-level session IFC (ADR 0015 program memory)", () => {
  it("blocks a write the program's reads may not flow to, even when it is listed first", async () => {
    const { host, executed } = fakeHost();
    const out = await run("parallel", ["chat.postMessage", "contracts.get"], host, IFC_ON);
    expect(executed).toEqual(["contracts.get"]);
    expect(out.calls[0]).toMatchObject({
      operationId: "chat.postMessage",
      ok: false,
      status: "program_ifc_blocked",
    });
    expect(out.calls[0]?.error).toMatch(/information-flow/);
    expect(out.result).toMatchObject({
      results: [
        {
          operationId: "chat.postMessage",
          value: {
            status: "program_ifc_blocked",
            programLabels: ["source:github-internal"],
            destLabels: ["source:slack"],
          },
        },
        { operationId: "contracts.get", ok: true },
      ],
    });
  });

  it("leaves the host and the program alone when session IFC is off", async () => {
    const { host, executed } = fakeHost();
    const emptyPlan = { v: 1, mode: "parallel", calls: [], kind: "plan" } as const;
    expect(await Effect.runPromise(programIfcHostEffect(emptyPlan, host, {}))).toBe(host);
    const out = await run("parallel", ["chat.postMessage", "contracts.get"], host, {});
    expect(out.ok).toBe(true);
    expect(executed.sort()).toEqual(["chat.postMessage", "contracts.get"]);
  });

  it("allows same-source and allow-listed writes", async () => {
    const same = fakeHost();
    const sameOut = await run("sequential", ["issues.list", "issues.create"], same.host, IFC_ON);
    expect(sameOut.ok).toBe(true);
    expect(same.executed).toEqual(["issues.list", "issues.create"]);

    const listed = fakeHost();
    const listedOut = await run("parallel", ["issues.list", "chat.postMessage"], listed.host, {
      ...IFC_ON,
      CLAWQL_SESSION_IFC_ALLOWED: JSON.stringify({
        allowedSourcesByDest: { "source:slack": ["source:github"] },
      }),
    });
    expect(listedOut.ok).toBe(true);
    expect(listed.executed.sort()).toEqual(["chat.postMessage", "issues.list"]);
  });

  it("fails closed when the host cannot describe the operations", async () => {
    const mixed = fakeHost({ omitOperation: true });
    const mixedOut = await run(
      "sequential",
      ["issues.list", "chat.postMessage"],
      mixed.host,
      IFC_ON
    );
    expect(mixed.executed).toEqual([]);
    expect(mixedOut.calls.map((c) => c.status)).toEqual([
      "program_ifc_blocked",
      "program_ifc_blocked",
    ]);

    const alone = fakeHost({ omitOperation: true });
    const aloneOut = await run("sequential", ["issues.list", "issues.list"], alone.host, IFC_ON);
    expect(aloneOut.ok).toBe(true);
    expect(alone.executed).toEqual(["issues.list", "issues.list"]);
  });

  it("resolves risk once per operation for both the gate and the read-only check", async () => {
    const { host, riskLookups } = fakeHost();
    const out = await run(
      "parallel",
      ["issues.list", "issues.list", "issues.create", "nope.get"],
      host,
      IFC_ON
    );
    expect(riskLookups.sort()).toEqual(["issues.create", "issues.list", "nope.get"]);
    expect(out.calls.map((c) => c.status ?? "ok")).toEqual(["ok", "ok", "ok", "unknown_operation"]);
  });
});
