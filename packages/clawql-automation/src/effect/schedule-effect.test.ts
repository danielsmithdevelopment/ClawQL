import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect } from "effect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { executeScheduleToolCoreEffect } from "./schedule-effect.js";
import { resetScheduleSqlJsForTests } from "../schedule/schedule.js";

describe("executeScheduleToolCoreEffect", () => {
  let dbDir: string;
  let prevDb: string | undefined;
  let prevMin: string | undefined;

  beforeEach(async () => {
    dbDir = await mkdtemp(join(tmpdir(), "clawql-schedule-effect-"));
    prevDb = process.env.CLAWQL_SCHEDULE_DB_PATH;
    prevMin = process.env.CLAWQL_SCHEDULE_INTERVAL_MIN_SECONDS;
    process.env.CLAWQL_SCHEDULE_DB_PATH = join(dbDir, "schedule.db");
    delete process.env.CLAWQL_SCHEDULE_INTERVAL_MIN_SECONDS;
    resetScheduleSqlJsForTests();
  });

  afterEach(async () => {
    resetScheduleSqlJsForTests();
    if (prevDb === undefined) delete process.env.CLAWQL_SCHEDULE_DB_PATH;
    else process.env.CLAWQL_SCHEDULE_DB_PATH = prevDb;
    if (prevMin === undefined) delete process.env.CLAWQL_SCHEDULE_INTERVAL_MIN_SECONDS;
    else process.env.CLAWQL_SCHEDULE_INTERVAL_MIN_SECONDS = prevMin;
    await rm(dbDir, { recursive: true, force: true });
  });

  it("stages create → get without nested Layer provision", async () => {
    const created = await Effect.runPromise(
      executeScheduleToolCoreEffect({
        operation: "create",
        schedule: { frequency: { type: "interval", seconds: 3600 } },
        action: {
          kind: "synthetic",
          synthetic_test: {
            name: "effect-create",
            request: { method: "GET", url: "https://example.com/health" },
          },
        },
      })
    );
    const createdBody = JSON.parse(created.content[0]!.text) as {
      ok?: boolean;
      job?: { id?: string };
    };
    expect(createdBody.ok).toBe(true);
    expect(createdBody.job?.id).toBeTruthy();

    const got = await Effect.runPromise(
      executeScheduleToolCoreEffect({
        operation: "get",
        job_id: createdBody.job!.id,
      })
    );
    const gotBody = JSON.parse(got.content[0]!.text) as { ok?: boolean; job?: { id?: string } };
    expect(gotBody.ok).toBe(true);
    expect(gotBody.job?.id).toBe(createdBody.job!.id);
  });

  it("returns soft not-found for missing job_id", async () => {
    const result = await Effect.runPromise(
      executeScheduleToolCoreEffect({
        operation: "get",
        job_id: "missing-job",
      })
    );
    const body = JSON.parse(result.content[0]!.text) as { ok?: boolean; error?: string };
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/not found/i);
  });
});
