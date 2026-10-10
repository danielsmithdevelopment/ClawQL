import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  decidePendingExecution,
  loadPendingExecution,
  type OpenAPIDoc,
  type Operation,
  type OperationRisk,
  type ResolvedProposal,
} from "clawql-api";
import { resetClawqlApiForTests, setLoadSpecForTests } from "./composition/clawql-api-adapters.js";
import {
  handleExecuteProgramToolInput,
  handleSubmitProgramProposalsToolInput,
} from "./mcp/tools.js";
import { withFetchServer } from "./test-utils/fetch-test-server.js";

const ENV_KEYS = [
  "CLAWQL_HOME",
  "CLAWQL_PENDING_STORE",
  "CLAWQL_OPERATION_RISK_ENFORCE",
  "CLAWQL_SESSION_ID",
] as const;

const risk = (policy: OperationRisk["policy"]): OperationRisk => ({
  level: policy === "allow" ? "LOW" : "MEDIUM",
  policy,
  source: "spec-default",
  reason: `test ${policy}`,
});

const pathParam = { type: "integer", location: "path" as const, required: true, description: "" };

function spec(origin: string) {
  const op = (o: Partial<Operation> & Pick<Operation, "id" | "method" | "flatPath">): Operation =>
    ({
      path: o.flatPath,
      description: o.id,
      resource: "issues",
      parameters: {},
      scopes: [],
      specIndex: 0,
      specLabel: "gh",
      ...o,
    }) as Operation;
  const openapi: OpenAPIDoc = {
    openapi: "3.0.3",
    info: { title: "Issues", version: "1" },
    servers: [{ url: origin }],
    paths: {},
    components: { schemas: {} },
  };
  return {
    operations: [
      op({
        id: "gh::issues.get",
        method: "GET",
        flatPath: "/issues/{number}",
        parameters: { number: pathParam },
        risk: risk("allow"),
      }),
      op({
        id: "gh::issues.create",
        method: "POST",
        flatPath: "/issues",
        requestBody: "IssueCreate",
        requestBodyContentType: "application/json",
        risk: risk("mandate"),
      }),
      op({
        id: "gh::issues.createComment",
        method: "POST",
        flatPath: "/issues/{issue_number}/comments",
        parameters: { issue_number: pathParam },
        requestBody: "Comment",
        requestBodyContentType: "application/json",
        risk: risk("mandate"),
      }),
    ],
    openapi,
    openapis: [openapi],
    multi: true,
    rawSource: {},
  };
}

const PLAN = {
  v: 1,
  mode: "sequential",
  calls: [{ id: "A", tool: "execute", operationId: "gh::issues.get", args: { number: 7 } }],
  proposals: [
    {
      id: "W1",
      operationId: "gh::issues.create",
      args: { title: { $ref: "A.result.title" }, body: "dup of #7" },
    },
    {
      id: "W2",
      operationId: "gh::issues.createComment",
      args: { issue_number: { $ref: "W1.result.number" }, body: "triaged" },
    },
  ],
};

type Leaf = {
  id: string;
  state: string;
  status?: string;
  executionId?: string;
  argsHash?: string;
  args: Record<string, unknown>;
  result?: unknown;
  waitingOn?: string[];
};
type Submitted = { ok: boolean; complete: boolean; leaves: Leaf[] };

const textOf = (out: { content: { text: string }[] }): unknown => JSON.parse(out.content[0]!.text);

describe("execute_program proposals → submit_program_proposals (MCP handlers, real execute path)", () => {
  const saved: Partial<Record<(typeof ENV_KEYS)[number], string>> = {};
  let home = "";

  beforeEach(async () => {
    for (const k of ENV_KEYS) saved[k] = process.env[k];
    home = await mkdtemp(join(tmpdir(), "clawql-proposals-"));
    process.env.CLAWQL_HOME = home;
    process.env.CLAWQL_PENDING_STORE = "file";
    process.env.CLAWQL_OPERATION_RISK_ENFORCE = "1";
    process.env.CLAWQL_SESSION_ID = "proposals-handlers-test";
  });

  afterEach(async () => {
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
    setLoadSpecForTests(undefined);
    resetClawqlApiForTests();
    await rm(home, { recursive: true, force: true });
  });

  it("parks the args execute_program bound, consumes Review approvals once, and fills result refs", async () => {
    const requests: Array<{ method: string; path: string; body?: unknown }> = [];
    await withFetchServer(
      async (req) => {
        const path = new URL(req.url).pathname;
        const body =
          req.method === "GET" ? undefined : ((await req.json()) as Record<string, unknown>);
        requests.push({ method: req.method, path, ...(body ? { body } : {}) });
        const json = (data: unknown) =>
          new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json" } });
        if (req.method === "GET" && path === "/issues/7")
          return json({ number: 7, title: "Flaky test" });
        if (req.method === "POST" && path === "/issues") return json({ number: 42, ...body });
        if (req.method === "POST" && path === "/issues/42/comments")
          return json({ id: 9, ...body });
        return new Response("not found", { status: 404 });
      },
      async (origin) => {
        setLoadSpecForTests(async () => spec(origin));
        const submit = async () =>
          textOf(await handleSubmitProgramProposalsToolInput({ programId })) as Submitted;
        const leaf = (out: Submitted, id: string) => out.leaves.find((l) => l.id === id)!;

        const ran = textOf(
          await handleExecuteProgramToolInput({ source: JSON.stringify(PLAN) })
        ) as { ok: boolean; programId: string; result: { proposals: ResolvedProposal[] } };
        const programId = ran.programId;
        expect(ran.ok).toBe(true);
        const [w1, w2] = ran.result.proposals;
        expect(w1).toMatchObject({
          status: "ready",
          policy: "mandate",
          args: { title: "Flaky test", body: "dup of #7" },
        });
        expect(w1!.argsHash).toMatch(/^sha256:[0-9a-f]{64}$/);
        expect(w2).toMatchObject({
          status: "deferred",
          pendingRefs: [{ at: "/issue_number", ref: "W1.result.number" }],
        });
        expect(requests.map((r) => `${r.method} ${r.path}`)).toEqual(["GET /issues/7"]);

        const parked = await submit();
        expect(parked).toMatchObject({ ok: true, complete: false });
        const parkedW1 = leaf(parked, "W1");
        expect(parkedW1).toMatchObject({ state: "pending", status: "mandate_required" });
        expect(parkedW1.argsHash).toBe(w1!.argsHash);
        const mandate = await loadPendingExecution(parkedW1.executionId!);
        expect(mandate).toMatchObject({
          status: "pending",
          operationId: "gh::issues.create",
          argsHash: w1!.argsHash,
          args: { title: "Flaky test", body: "dup of #7" },
        });
        expect(leaf(parked, "W2")).toMatchObject({
          state: "pending",
          status: "waiting",
          waitingOn: ["W1"],
        });
        expect(requests).toHaveLength(1);

        await decidePendingExecution(parkedW1.executionId!, "approve");
        const second = await submit();
        expect(leaf(second, "W1")).toMatchObject({
          state: "ran",
          executionId: parkedW1.executionId,
          result: { number: 42, title: "Flaky test" },
        });
        expect((await loadPendingExecution(parkedW1.executionId!))?.status).toBe("completed");
        const parkedW2 = leaf(second, "W2");
        expect(parkedW2).toMatchObject({
          state: "pending",
          status: "mandate_required",
          args: { issue_number: 42, body: "triaged" },
        });
        expect(requests.slice(1)).toEqual([
          { method: "POST", path: "/issues", body: { title: "Flaky test", body: "dup of #7" } },
        ]);

        await decidePendingExecution(parkedW2.executionId!, "approve");
        const third = await submit();
        expect(third).toMatchObject({ ok: true, complete: true });
        expect(leaf(third, "W2")).toMatchObject({
          state: "ran",
          result: { id: 9, body: "triaged" },
        });

        const again = await submit();
        expect(again.leaves).toEqual(third.leaves);
        expect(requests.map((r) => `${r.method} ${r.path}`)).toEqual([
          "GET /issues/7",
          "POST /issues",
          "POST /issues/42/comments",
        ]);
      }
    );
  });
});
