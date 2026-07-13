import { describe, expect, it } from "vitest";
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
});
