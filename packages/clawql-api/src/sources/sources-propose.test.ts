import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect } from "effect";
import { afterEach, describe, expect, it } from "vitest";
import { bootProcessWormFromEnvEffect, resetProcessWormForTests } from "clawql-audit";
import { readCustomSourcesFile } from "../spec/custom-sources-store.js";
import { approveSourceEffect, proposeSourceEffect } from "./propose-source-core.js";

const MINIMAL_OPENAPI = JSON.stringify({
  openapi: "3.0.0",
  info: { title: "Propose Petstore", version: "1.0.0" },
  paths: {
    "/pets": {
      get: {
        operationId: "listPets",
        responses: { "200": { description: "ok" } },
      },
      post: {
        operationId: "createPet",
        responses: { "201": { description: "created" } },
      },
    },
    "/pets/{id}": {
      delete: {
        operationId: "deletePet",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "204": { description: "gone" } },
      },
    },
  },
});

function stubFetch(body: string): typeof fetch {
  return (async () =>
    new Response(body, {
      status: 200,
      headers: { "content-type": "application/json" },
    })) as typeof fetch;
}

describe("sources propose / approve", () => {
  afterEach(() => {
    resetProcessWormForTests();
    delete process.env.CLAWQL_HOME;
    delete process.env.CLAWQL_WORM_ENABLED;
    delete process.env.CLAWQL_WORM_LOCAL;
    delete process.env.CLAWQL_WORM_REMOTE;
    delete process.env.CLAWQL_SOURCES_ALLOW_HTTP;
  });

  it("dryRun previews risk without writing sources.json or parking", async () => {
    const home = await mkdtemp(join(tmpdir(), "clawql-propose-dry-"));
    process.env.CLAWQL_HOME = home;
    process.env.CLAWQL_SOURCES_ALLOW_HTTP = "1";

    const preview = await Effect.runPromise(
      proposeSourceEffect({
        url: "http://example.com/openapi.json",
        dryRun: true,
        home,
        fetchFn: stubFetch(MINIMAL_OPENAPI),
      })
    );

    expect(preview.ok).toBe(true);
    expect(preview.dryRun).toBe(true);
    expect(preview.proposalId).toBeNull();
    expect(preview.riskSummary.total).toBe(3);
    expect(preview.riskSummary.allow).toBe(1);
    expect(preview.riskSummary.mandate).toBe(1);
    expect(preview.riskSummary.block).toBe(1);
    expect(preview.entry.kind).toBe("openapi");

    const file = await readCustomSourcesFile(home);
    expect(file.sources).toEqual([]);
  });

  it("commit parks proposal; approve upserts sources.json", async () => {
    const home = await mkdtemp(join(tmpdir(), "clawql-propose-commit-"));
    process.env.CLAWQL_HOME = home;
    process.env.CLAWQL_SOURCES_ALLOW_HTTP = "1";
    process.env.CLAWQL_WORM_ENABLED = "1";
    process.env.CLAWQL_WORM_LOCAL = "memory";
    process.env.CLAWQL_WORM_REMOTE = "memory";
    await Effect.runPromise(bootProcessWormFromEnvEffect());

    let resetCalls = 0;
    const parked = await Effect.runPromise(
      proposeSourceEffect({
        url: "http://example.com/openapi.json",
        name: "Pet Propose",
        dryRun: false,
        home,
        fetchFn: stubFetch(MINIMAL_OPENAPI),
      })
    );

    expect(parked.proposalId).toMatch(/^psp_/);
    expect(parked.approval?.cli).toContain(parked.proposalId!);

    const before = await readCustomSourcesFile(home);
    expect(before.sources).toEqual([]);

    const approved = await Effect.runPromise(
      approveSourceEffect({
        proposalId: parked.proposalId!,
        decision: "approve",
        home,
        resetSpecCache: () => {
          resetCalls += 1;
        },
      })
    );
    expect(approved.status).toBe("approved");
    expect(resetCalls).toBe(1);

    const after = await readCustomSourcesFile(home);
    expect(after.sources).toHaveLength(1);
    expect(after.sources[0]?.id).toBe(parked.entry.id);
    expect(after.sources[0]?.trusted).toBeUndefined();

    const recordRaw = await readFile(
      join(home, "pending-sources", `${parked.proposalId}.json`),
      "utf8"
    );
    const record = JSON.parse(recordRaw) as { status: string };
    expect(record.status).toBe("approved");
  });

  it("decline rejects without writing sources.json", async () => {
    const home = await mkdtemp(join(tmpdir(), "clawql-propose-decline-"));
    process.env.CLAWQL_HOME = home;
    process.env.CLAWQL_SOURCES_ALLOW_HTTP = "1";

    const parked = await Effect.runPromise(
      proposeSourceEffect({
        url: "http://example.com/openapi.json",
        dryRun: false,
        home,
        fetchFn: stubFetch(MINIMAL_OPENAPI),
      })
    );

    const declined = await Effect.runPromise(
      approveSourceEffect({
        proposalId: parked.proposalId!,
        decision: "decline",
        home,
      })
    );
    expect(declined.status).toBe("declined");
    const file = await readCustomSourcesFile(home);
    expect(file.sources).toEqual([]);
  });
});
