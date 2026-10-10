import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  clearAllSessionLabelsSync,
  getSessionLabelsSync,
  labelForSpec,
  type OpenAPIDoc,
  type Operation,
} from "clawql-api";
import {
  ensureClawqlApi,
  resetClawqlApiForTests,
  setLoadSpecForTests,
} from "./composition/clawql-api-adapters.js";
import { handleExecuteProgramToolInput } from "./mcp/tools.js";
import { withFetchServer } from "./test-utils/fetch-test-server.js";

const ENV_KEYS = [
  "CLAWQL_ENABLE_DURABLE_PROGRAMS",
  "CLAWQL_PROGRAM_JOURNAL_DIR",
  "CLAWQL_ENABLE_SESSION_IFC",
  "CLAWQL_SESSION_ID",
] as const;

const SESSION = "durable-mcp-test";
const PROGRAM_ID = "prog_mcpdurable0001";

type ProgramOut = {
  readonly ok: boolean;
  readonly programId: string;
  readonly result: { readonly results: readonly { readonly value: unknown }[] } | null;
  readonly diagnostics: Record<string, unknown>;
};

const parse = (out: { content: { text: string }[] }) =>
  JSON.parse(out.content[0]!.text) as ProgramOut;

const ok200 = { "200": { description: "ok" } };

function readOperation(specLabel: string, specIndex: number, path: string): Operation {
  return {
    id: `${specLabel}::read${path.slice(1)}`,
    method: "GET",
    path,
    flatPath: path,
    description: `read ${path}`,
    resource: path.slice(1),
    parameters: {},
    specIndex,
    specLabel,
    risk: { policy: "allow", level: "LOW", source: "spec-default", reason: "HTTP GET" },
  } as Operation;
}

describe("execute_program with CLAWQL_ENABLE_DURABLE_PROGRAMS (ADR 0015)", () => {
  const saved = new Map<string, string | undefined>();

  beforeEach(async () => {
    for (const key of ENV_KEYS) saved.set(key, process.env[key]);
    process.env.CLAWQL_ENABLE_DURABLE_PROGRAMS = "1";
    process.env.CLAWQL_PROGRAM_JOURNAL_DIR = await mkdtemp(join(tmpdir(), "clawql-durable-mcp-"));
    process.env.CLAWQL_ENABLE_SESSION_IFC = "1";
    process.env.CLAWQL_SESSION_ID = SESSION;
    clearAllSessionLabelsSync();
  });

  afterEach(() => {
    for (const [key, value] of saved) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    clearAllSessionLabelsSync();
    setLoadSpecForTests(undefined);
    resetClawqlApiForTests();
  });

  it("parks on timeout, then resumes by programId without re-sending journaled REST calls", async () => {
    const hits: Record<string, number> = {};
    let releaseFirstC = () => {};
    const firstCBlocked = new Promise<void>((resolve) => {
      releaseFirstC = resolve;
    });

    await withFetchServer(
      async (req) => {
        const path = new URL(req.url).pathname;
        hits[path] = (hits[path] ?? 0) + 1;
        if (path === "/c" && hits[path] === 1) await firstCBlocked;
        return Response.json({ path });
      },
      async (origin) => {
        const alpha: OpenAPIDoc = {
          openapi: "3.0.3",
          info: { title: "alpha", version: "1" },
          servers: [{ url: origin }],
          paths: {
            "/a": { get: { operationId: "reada", responses: ok200 } },
            "/b": { get: { operationId: "readb", responses: ok200 } },
          },
          components: { schemas: {} },
        };
        const beta: OpenAPIDoc = {
          openapi: "3.0.3",
          info: { title: "beta", version: "1" },
          servers: [{ url: origin }],
          paths: { "/c": { get: { operationId: "readc", responses: ok200 } } },
          components: { schemas: {} },
        };
        const operations = [
          readOperation("alpha", 0, "/a"),
          readOperation("alpha", 0, "/b"),
          readOperation("beta", 1, "/c"),
        ];
        setLoadSpecForTests(async () => ({
          operations,
          openapi: alpha,
          openapis: [alpha, beta],
          multi: true,
          rawSource: {},
        }));
        await ensureClawqlApi();

        const source = JSON.stringify({
          v: 1,
          mode: "sequential",
          calls: operations.map((op) => ({ tool: "execute", operationId: op.id, args: {} })),
        });
        const parked = parse(
          await handleExecuteProgramToolInput({ source, programId: PROGRAM_ID, timeoutMs: 1_000 })
        );
        releaseFirstC();
        expect(parked).toMatchObject({
          ok: false,
          programId: PROGRAM_ID,
          diagnostics: { timedOut: true, durable: { status: "parked", journaledCalls: 2 } },
        });

        // A restarted server process holds no session labels.
        clearAllSessionLabelsSync();
        const resumed = parse(await handleExecuteProgramToolInput({ programId: PROGRAM_ID }));
        expect(resumed).toMatchObject({
          ok: true,
          programId: PROGRAM_ID,
          diagnostics: {
            durable: { status: "completed", resumed: true, replayedCalls: 2, executedCalls: 1 },
          },
        });
        expect(resumed.result?.results.map((r) => r.value)).toEqual([
          { path: "/a" },
          { path: "/b" },
          { path: "/c" },
        ]);
        expect(hits).toEqual({ "/a": 1, "/b": 1, "/c": 2 });
        expect([...getSessionLabelsSync(SESSION)].sort()).toEqual([
          labelForSpec("alpha"),
          labelForSpec("beta"),
        ]);
      }
    );
  });
});
