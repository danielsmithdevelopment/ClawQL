import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { SQLiteBackend } from "./sqlite.js";
import type { WORMEntry } from "../entry.js";

function mk(i: number): WORMEntry {
  return {
    id: `id-${i}`,
    chainIndex: i,
    hash: `h${i}`,
    prevHash: i === 0 ? "genesis" : `h${i - 1}`,
    writtenAt: new Date().toISOString(),
    type: "TEST",
    timestamp: new Date().toISOString(),
    sessionId: "s",
    backendAcks: [],
  } as WORMEntry;
}

describe("SQLiteBackend concurrent writeWithOutbox", () => {
  it("survives parallel appends under a shared gate", async () => {
    const dir = mkdtempSync(join(tmpdir(), "worm-gate-"));
    try {
      const backend = new SQLiteBackend({ path: join(dir, "w.sqlite") });
      await Effect.runPromise(
        Effect.all(
          Array.from({ length: 20 }, (_, i) => backend.writeWithOutbox(mk(i))),
          { concurrency: "unbounded" }
        )
      );
      const all = await Effect.runPromise(backend.all());
      expect(all).toHaveLength(20);
      backend.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
