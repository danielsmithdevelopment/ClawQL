/**
 * Postgres shared-store consume — two processes, one DB.
 * Skips unless CLAWQL_PENDING_DATABASE_URL is set (CI job provides it).
 */
import { fork } from "node:child_process";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { decidePendingExecution, parkMandateExecute } from "./pending-execution-service.js";
import {
  pendingDatabaseUrl,
  resetPendingPostgresPoolForTests,
} from "./pending-execution-postgres.js";

const dbUrl = pendingDatabaseUrl();
const workerPath = fileURLToPath(new URL("./multiprocess-consume-worker-pg.mjs", import.meta.url));

describe.skipIf(!dbUrl)("postgres multi-process shared-store consume", () => {
  afterEach(async () => {
    await resetPendingPostgresPoolForTests();
    delete process.env.CLAWQL_PENDING_STORE;
  });

  it("exactly one win across two Node processes sharing Postgres", async () => {
    process.env.CLAWQL_PENDING_STORE = "postgres";
    process.env.CLAWQL_PENDING_DATABASE_URL = dbUrl!;
    await resetPendingPostgresPoolForTests();

    const parked = await parkMandateExecute({
      operationId: "createItem",
      args: { name: "pg-race" },
      risk: {
        level: "MEDIUM",
        policy: "mandate",
        source: "spec-default",
        reason: "HTTP POST",
      },
    });
    await decidePendingExecution(parked.executionId, "approve");
    await resetPendingPostgresPoolForTests();

    const runWorker = (label: string) =>
      new Promise<{ wins: number; losses: number }>((resolve, reject) => {
        const child = fork(workerPath, [], {
          env: {
            ...process.env,
            CLAWQL_PENDING_DATABASE_URL: dbUrl!,
            CONSUME_EID: parked.executionId,
            CONSUME_HASH: parked.argsHash,
            CONSUME_BY: label,
            CONSUME_ATTEMPTS: "25",
          },
        });
        let settled = false;
        child.on("message", (msg) => {
          settled = true;
          resolve(msg as { wins: number; losses: number });
        });
        child.on("error", reject);
        child.on("exit", (code) => {
          if (!settled) reject(new Error(`worker ${label} exited ${code}`));
        });
      });

    const [a, b] = await Promise.all([runWorker("pg-a"), runWorker("pg-b")]);
    expect(a.wins + b.wins).toBe(1);
    expect(a.losses + b.losses).toBe(49);
  }, 60_000);
});
