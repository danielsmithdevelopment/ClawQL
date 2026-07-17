import { describe, expect, it, vi } from "vitest";
import type pg from "pg";
import {
  buildPipelineRunLockKey,
  pipelineAdvisoryLockId,
  tryAcquirePipelineAdvisoryLock,
} from "./advisory-lock.js";

describe("pipeline advisory lock", () => {
  it("builds stable lock keys per schedule minute", () => {
    const key = buildPipelineRunLockKey("0 2 * * 0", "2026-07-12T02:00");
    expect(key).toBe("inference-pipeline:0 2 * * 0:2026-07-12T02:00");
    expect(pipelineAdvisoryLockId(key)).toBe(pipelineAdvisoryLockId(key));
    expect(pipelineAdvisoryLockId(key)).not.toBe(pipelineAdvisoryLockId(`${key}:other`));
  });

  it("acquires when postgres is not configured", async () => {
    const lock = await tryAcquirePipelineAdvisoryLock("test-lock", {});
    expect(lock.acquired).toBe(true);
    expect(lock.backend).toBe("none");
    await lock.release();
  });

  it("fail-closes when postgres query throws (no phantom acquire)", async () => {
    const client = {
      query: vi.fn(async () => {
        throw new Error("connection reset");
      }),
      release: vi.fn(),
    };
    const lock = await tryAcquirePipelineAdvisoryLock(
      "test-lock-db-error",
      { CLAWQL_INFERENCE_DATABASE_URL: "postgres://example" },
      {
        getPool: () =>
          ({
            connect: async () => client,
          }) as unknown as pg.Pool,
      }
    );
    expect(lock.acquired).toBe(false);
    expect(lock.backend).toBe("postgres");
    expect(client.release).toHaveBeenCalled();
  });

  it("returns acquired:false when pg_try_advisory_lock is false", async () => {
    const client = {
      query: vi.fn(async () => ({ rows: [{ acquired: false }] })),
      release: vi.fn(),
    };
    const lock = await tryAcquirePipelineAdvisoryLock(
      "contended",
      { CLAWQL_INFERENCE_DATABASE_URL: "postgres://example" },
      {
        getPool: () =>
          ({
            connect: async () => client,
          }) as unknown as pg.Pool,
      }
    );
    expect(lock.acquired).toBe(false);
    expect(client.release).toHaveBeenCalled();
  });
});
