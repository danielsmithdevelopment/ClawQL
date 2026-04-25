import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  __scheduleTestUtils,
  getScheduleDatabasePath,
  handleScheduleToolInput,
  resetScheduleSqlJsForTests,
  runScheduleWorkerTick,
} from "./clawql-schedule.js";
import { withFetchServer } from "./test-utils/fetch-test-server.js";

describe("handleScheduleToolInput", () => {
  const saved = { ...process.env };
  let workDir: string;

  beforeEach(async () => {
    workDir = await mkdtemp(join(tmpdir(), "clawql-schedule-"));
    process.env.CLAWQL_SCHEDULE_DB_PATH = join(workDir, "schedule.db");
    process.env.CLAWQL_SCHEDULE_HISTORY_LIMIT = "2";
    delete process.env.CLAWQL_SCHEDULE_URL_ALLOWLIST_PREFIXES;
    resetScheduleSqlJsForTests();
  });

  afterEach(async () => {
    process.env = { ...saved };
    resetScheduleSqlJsForTests();
    await rm(workDir, { recursive: true, force: true });
  });

  it("creates and reads a scheduled synthetic job", async () => {
    const created = await handleScheduleToolInput({
      operation: "create",
      schedule: { frequency: { type: "interval", seconds: 300 } },
      action: {
        kind: "synthetic",
        synthetic_test: {
          name: "health",
          request: { method: "GET", url: "https://example.com/health" },
          assert: { status_in: [200] },
        },
      },
    });
    const createBody = JSON.parse(created.content[0]!.text) as { job: { id: string } };
    expect(createBody.job.id).toBeTruthy();

    const listed = await handleScheduleToolInput({ operation: "list" });
    const listBody = JSON.parse(listed.content[0]!.text) as { jobs: Array<{ id: string }> };
    expect(listBody.jobs.length).toBe(1);
    expect(listBody.jobs[0]!.id).toBe(createBody.job.id);

    const got = await handleScheduleToolInput({ operation: "get", job_id: createBody.job.id });
    const getBody = JSON.parse(got.content[0]!.text) as { job: { id: string } };
    expect(getBody.job.id).toBe(createBody.job.id);
  });

  it("runs trigger dry_run without persisting run rows", async () => {
    await withFetchServer(
      async () =>
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      async (origin) => {
        process.env.CLAWQL_SCHEDULE_URL_ALLOWLIST_PREFIXES = origin;
        const created = await handleScheduleToolInput({
          operation: "create",
          schedule: { frequency: { type: "interval", seconds: 300 } },
          action: {
            kind: "synthetic",
            synthetic_test: {
              name: "dryrun",
              request: { method: "GET", url: `${origin}/healthz` },
              assert: { status_in: [200], body_contains: '"ok":true' },
            },
          },
        });
        const createBody = JSON.parse(created.content[0]!.text) as { job: { id: string } };
        const trig = await handleScheduleToolInput({
          operation: "trigger",
          job_id: createBody.job.id,
          dry_run: true,
        });
        const trigBody = JSON.parse(trig.content[0]!.text) as {
          ok: boolean;
          run: { dry_run: boolean; status: string };
        };
        expect(trigBody.ok).toBe(true);
        expect(trigBody.run.dry_run).toBe(true);
        expect(trigBody.run.status).toBe("pass");

        const got = await handleScheduleToolInput({ operation: "get", job_id: createBody.job.id });
        const getBody = JSON.parse(got.content[0]!.text) as {
          job: { runs?: Array<{ id: string }> };
        };
        expect(getBody.job.runs ?? []).toHaveLength(0);
      }
    );
  });

  it("persists trigger runs and trims to history limit", async () => {
    await withFetchServer(
      async () =>
        new Response("ok", {
          status: 200,
          headers: { "Content-Type": "text/plain" },
        }),
      async (origin) => {
        process.env.CLAWQL_SCHEDULE_URL_ALLOWLIST_PREFIXES = origin;
        const created = await handleScheduleToolInput({
          operation: "create",
          schedule: { frequency: { type: "interval", seconds: 300 } },
          action: {
            kind: "synthetic",
            synthetic_test: {
              name: "history",
              request: { method: "GET", url: `${origin}/check` },
              assert: { status_in: [200], body_contains: "ok" },
            },
          },
        });
        const jobId = (JSON.parse(created.content[0]!.text) as { job: { id: string } }).job.id;
        await handleScheduleToolInput({ operation: "trigger", job_id: jobId });
        await handleScheduleToolInput({ operation: "trigger", job_id: jobId });
        await handleScheduleToolInput({ operation: "trigger", job_id: jobId });

        const got = await handleScheduleToolInput({ operation: "get", job_id: jobId });
        const runs = (JSON.parse(got.content[0]!.text) as { job: { runs: unknown[] } }).job.runs;
        expect(runs).toHaveLength(2);
      }
    );
  });

  it("rejects interval outside configured bounds", async () => {
    process.env.CLAWQL_SCHEDULE_INTERVAL_MIN_SECONDS = "300";
    await expect(
      handleScheduleToolInput({
        operation: "create",
        schedule: { frequency: { type: "interval", seconds: 10 } },
        action: {
          kind: "synthetic",
          synthetic_test: {
            name: "bad",
            request: { method: "GET", url: "https://example.com" },
          },
        },
      })
    ).rejects.toThrow(/interval seconds/i);
  });

  it("resolves default schedule database path under cwd", () => {
    delete process.env.CLAWQL_SCHEDULE_DB_PATH;
    expect(getScheduleDatabasePath().includes(".clawql")).toBe(true);
  });

  it("matches cron expressions in UTC", () => {
    const at = new Date("2026-04-24T12:05:30.000Z");
    expect(__scheduleTestUtils.cronMatchesUtc("5 12 * * *", at)).toBe(true);
    expect(__scheduleTestUtils.cronMatchesUtc("*/5 * * * *", at)).toBe(true);
    expect(__scheduleTestUtils.cronMatchesUtc("6 12 * * *", at)).toBe(false);
  });

  it("worker tick runs due cron jobs once per minute", async () => {
    await withFetchServer(
      async () =>
        new Response("ok", {
          status: 200,
          headers: { "Content-Type": "text/plain" },
        }),
      async (origin) => {
        process.env.CLAWQL_SCHEDULE_URL_ALLOWLIST_PREFIXES = origin;
        const created = await handleScheduleToolInput({
          operation: "create",
          schedule: { frequency: { type: "cron", expression: "5 12 * * *" } },
          action: {
            kind: "synthetic",
            synthetic_test: {
              name: "cron-check",
              request: { method: "GET", url: `${origin}/cron` },
              assert: { status_in: [200], body_contains: "ok" },
            },
          },
        });
        const jobId = (JSON.parse(created.content[0]!.text) as { job: { id: string } }).job.id;
        const t = new Date("2026-04-24T12:05:10.000Z");
        const fired1 = await runScheduleWorkerTick(t);
        const fired2 = await runScheduleWorkerTick(new Date("2026-04-24T12:05:50.000Z"));
        expect(fired1).toBe(1);
        expect(fired2).toBe(0);
        const got = await handleScheduleToolInput({ operation: "get", job_id: jobId });
        const runs = (JSON.parse(got.content[0]!.text) as { job: { runs: unknown[] } }).job.runs;
        expect(runs).toHaveLength(1);
      }
    );
  });

  it("worker tick runs one_shot only once after run_at", async () => {
    await withFetchServer(
      async () =>
        new Response("ok", {
          status: 200,
          headers: { "Content-Type": "text/plain" },
        }),
      async (origin) => {
        process.env.CLAWQL_SCHEDULE_URL_ALLOWLIST_PREFIXES = origin;
        const runAt = "2026-04-24T12:00:00.000Z";
        const created = await handleScheduleToolInput({
          operation: "create",
          schedule: { frequency: { type: "one_shot", run_at: runAt } },
          action: {
            kind: "synthetic",
            synthetic_test: {
              name: "oneshot",
              request: { method: "GET", url: `${origin}/oneshot` },
              assert: { status_in: [200], body_contains: "ok" },
            },
          },
        });
        const jobId = (JSON.parse(created.content[0]!.text) as { job: { id: string } }).job.id;
        const fired1 = await runScheduleWorkerTick(new Date("2026-04-24T11:59:00.000Z"));
        const fired2 = await runScheduleWorkerTick(new Date("2026-04-24T12:00:01.000Z"));
        const fired3 = await runScheduleWorkerTick(new Date("2026-04-24T12:10:00.000Z"));
        expect(fired1).toBe(0);
        expect(fired2).toBe(1);
        expect(fired3).toBe(0);
        const got = await handleScheduleToolInput({ operation: "get", job_id: jobId });
        const runs = (JSON.parse(got.content[0]!.text) as { job: { runs: unknown[] } }).job.runs;
        expect(runs).toHaveLength(1);
      }
    );
  });
});
