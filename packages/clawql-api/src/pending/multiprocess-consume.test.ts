import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fork } from "node:child_process";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { decidePendingExecution, parkMandateExecute } from "./pending-execution-service.js";
import { pendingSqlitePath, resetPendingSqliteCacheForTests } from "./pending-execution-store.js";

const workerPath = fileURLToPath(new URL("./multiprocess-consume-worker.mjs", import.meta.url));

describe("multi-process shared-store consume", () => {
  afterEach(() => {
    resetPendingSqliteCacheForTests();
    delete process.env.CLAWQL_HOME;
    delete process.env.CLAWQL_PENDING_STORE;
  });

  it("exactly one win across two separate Node processes sharing SQLite", async () => {
    const home = await mkdtemp(join(tmpdir(), "clawql-mp-consume-"));
    process.env.CLAWQL_HOME = home;
    process.env.CLAWQL_PENDING_STORE = "sqlite";
    resetPendingSqliteCacheForTests();

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
    });
    await decidePendingExecution(parked.executionId, "approve", home);
    // Close parent handle so children can open WAL cleanly.
    resetPendingSqliteCacheForTests();

    const dbPath = pendingSqlitePath(home);
    const runWorker = (label: string) =>
      new Promise<{ wins: number; losses: number; label: string }>((resolve, reject) => {
        const child = fork(workerPath, [], {
          env: {
            ...process.env,
            CLAWQL_HOME: home,
            CLAWQL_PENDING_STORE: "sqlite",
            CONSUME_DB: dbPath,
            CONSUME_EID: parked.executionId,
            CONSUME_HASH: parked.argsHash,
            CONSUME_BY: label,
            CONSUME_ATTEMPTS: "25",
          },
        });
        let settled = false;
        child.on("message", (msg) => {
          settled = true;
          resolve(msg as { wins: number; losses: number; label: string });
        });
        child.on("error", reject);
        child.on("exit", (code) => {
          if (!settled) reject(new Error(`worker ${label} exited ${code} without message`));
        });
      });

    const [a, b] = await Promise.all([runWorker("proc-a"), runWorker("proc-b")]);
    expect(a.wins + b.wins).toBe(1);
    expect(a.losses + b.losses).toBe(49);
  }, 30_000);
});
