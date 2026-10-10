import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Duration, Effect } from "effect";
import { describe, expect, it } from "vitest";
import {
  makeProgramCellEffect,
  programCellLayer,
  ProgramCellService,
} from "./celld-program-cell.js";
import type { ProgramHost } from "./program-runner.js";

const OPS = ["pets.get", "pets.list"] as const;

function planSource(): string {
  return JSON.stringify({
    v: 1,
    mode: "sequential",
    calls: OPS.map((operationId, i) => ({
      tool: "execute",
      operationId,
      args: { page: i + 1 },
    })),
  });
}

function host(): ProgramHost {
  return {
    execute: (input) =>
      Effect.succeed({
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ ok: true, operationId: input.operationId }),
          },
        ],
      }),
    search: (input) =>
      Effect.succeed({ formattedText: JSON.stringify({ ok: true, query: input.query }) }),
    resolveRisk: () =>
      Effect.succeed({
        found: true,
        policy: "allow" as const,
        risk: {
          policy: "allow" as const,
          level: "LOW" as const,
          source: "spec-default" as const,
          reason: "test",
        },
        operation: { method: "GET", specLabel: "pets" },
      }),
    replayed: () => Effect.void,
  };
}

describe("celld-shaped program cell", () => {
  it("runs a durable plan through the cell façade", async () => {
    const dir = await mkdtemp(join(tmpdir(), "clawql-cell-"));
    const cell = await Effect.runPromise(makeProgramCellEffect(dir));
    expect(cell.honesty).toContain("celld-shaped");
    expect(cell.journalDir).toBe(dir);

    const result = await Effect.runPromise(
      cell.run({ source: planSource(), programId: "prog_celltest0001" }, host())
    );
    expect(result.ok).toBe(true);
    expect(result.calls?.length).toBe(2);
  });

  it("ProgramCellService layer exposes run", async () => {
    const dir = await mkdtemp(join(tmpdir(), "clawql-cell-svc-"));
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const cell = yield* ProgramCellService;
        return yield* cell.run(
          { source: planSource(), programId: "prog_cellsvc00001", timeoutMs: 5_000 },
          host()
        );
      }).pipe(Effect.provide(programCellLayer(dir)))
    );
    expect(result.ok).toBe(true);
  });

  it("resume after a completed run is idempotent (journal replay)", async () => {
    const dir = await mkdtemp(join(tmpdir(), "clawql-cell-resume-"));
    const cell = await Effect.runPromise(makeProgramCellEffect(dir));
    const id = "prog_cellresume01";
    const first = await Effect.runPromise(cell.run({ source: planSource(), programId: id }, host()));
    expect(first.ok).toBe(true);
    // Tiny delay so resume is a distinct wall-clock attempt.
    await Effect.runPromise(Effect.sleep(Duration.millis(5)));
    const second = await Effect.runPromise(cell.resume(id, host()));
    expect(second.ok).toBe(true);
  });
});
