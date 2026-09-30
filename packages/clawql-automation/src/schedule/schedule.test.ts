import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { handleScheduleToolInput } from "clawql-automation/plugin";
import {
  __scheduleTestUtils,
  getScheduleDatabasePath,
  resetScheduleSqlJsForTests,
  runScheduleWorkerTick,
} from "clawql-automation/schedule/schedule";
import { withFetchServer } from "./with-fetch-server.js";

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

  it("projects watch_fields and stores last_projection; ignores volatile-only churn", async () => {
    let call = 0;
    await withFetchServer(
      async () => {
        call++;
        const body =
          call === 1
            ? {
                generated_at: "t1",
                request_id: "r1",
                items: [{ id: 1, title: "A", state: "open" }],
              }
            : call === 2
              ? {
                  generated_at: "t2",
                  request_id: "r2",
                  items: [{ id: 1, title: "A", state: "open" }],
                }
              : {
                  generated_at: "t3",
                  request_id: "r3",
                  items: [{ id: 1, title: "A", state: "closed" }],
                };
        return new Response(JSON.stringify(body), {
          status: 200,
          headers: { "Content-Type": "application/json", ETag: `"v${call}"` },
        });
      },
      async (origin) => {
        process.env.CLAWQL_SCHEDULE_URL_ALLOWLIST_PREFIXES = origin;
        const created = await handleScheduleToolInput({
          operation: "create",
          schedule: { frequency: { type: "interval", seconds: 300 } },
          action: {
            kind: "synthetic",
            synthetic_test: {
              name: "prs",
              request: { method: "GET", url: `${origin}/prs` },
              assert: { status_in: [200] },
              change_detection: {
                watch_fields: ["items.id", "items.title", "items.state"],
                array_sort_keys: { items: "id" },
              },
            },
          },
        });
        const jobId = (JSON.parse(created.content[0]!.text) as { job: { id: string } }).job.id;
        await handleScheduleToolInput({ operation: "trigger", job_id: jobId });
        const after1 = JSON.parse(
          (await handleScheduleToolInput({ operation: "get", job_id: jobId })).content[0]!.text
        ) as {
          job: {
            change_detection_state: {
              last_hash: string;
              last_projection: { items: Array<{ state: string }> };
              last_etag: string;
            };
          };
        };
        expect(after1.job.change_detection_state.last_projection.items[0]!.state).toBe("open");
        expect(after1.job.change_detection_state.last_etag).toBe('"v1"');
        const hash1 = after1.job.change_detection_state.last_hash;

        await handleScheduleToolInput({ operation: "trigger", job_id: jobId });
        const after2 = JSON.parse(
          (await handleScheduleToolInput({ operation: "get", job_id: jobId })).content[0]!.text
        ) as { job: { change_detection_state: { last_hash: string } } };
        expect(after2.job.change_detection_state.last_hash).toBe(hash1);

        await handleScheduleToolInput({ operation: "trigger", job_id: jobId });
        const after3 = JSON.parse(
          (await handleScheduleToolInput({ operation: "get", job_id: jobId })).content[0]!.text
        ) as {
          job: {
            change_detection_state: {
              last_hash: string;
              last_projection: { items: Array<{ state: string }> };
            };
          };
        };
        expect(after3.job.change_detection_state.last_hash).not.toBe(hash1);
        expect(after3.job.change_detection_state.last_projection.items[0]!.state).toBe("closed");
      }
    );
  });

  it("sends If-None-Match and treats 304 as unchanged; backs off on 429 Retry-After", async () => {
    const seenHeaders: Array<string | null> = [];
    let mode: "etag" | "429" = "etag";
    await withFetchServer(
      async (req) => {
        seenHeaders.push(req.headers.get("if-none-match"));
        if (mode === "429") {
          return new Response("slow down", {
            status: 429,
            headers: { "Retry-After": "120" },
          });
        }
        if (req.headers.get("if-none-match") === '"abc"') {
          return new Response(null, { status: 304, headers: { ETag: '"abc"' } });
        }
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "Content-Type": "application/json", ETag: '"abc"' },
        });
      },
      async (origin) => {
        process.env.CLAWQL_SCHEDULE_URL_ALLOWLIST_PREFIXES = origin;
        const created = await handleScheduleToolInput({
          operation: "create",
          schedule: { frequency: { type: "interval", seconds: 300 } },
          action: {
            kind: "synthetic",
            synthetic_test: {
              name: "conditional",
              request: { method: "GET", url: `${origin}/res` },
              assert: { status_in: [200, 304] },
              change_detection: { watch_fields: ["ok"] },
            },
          },
        });
        const jobId = (JSON.parse(created.content[0]!.text) as { job: { id: string } }).job.id;
        await handleScheduleToolInput({ operation: "trigger", job_id: jobId });
        await handleScheduleToolInput({ operation: "trigger", job_id: jobId });
        expect(seenHeaders[0]).toBeNull();
        expect(seenHeaders[1]).toBe('"abc"');
        const mid = JSON.parse(
          (await handleScheduleToolInput({ operation: "get", job_id: jobId })).content[0]!.text
        ) as {
          job: {
            runs: Array<{ http_status: number }>;
            change_detection_state: { backoff_until: string | null };
          };
        };
        expect(mid.job.runs[0]!.http_status).toBe(304);

        mode = "429";
        const trig = await handleScheduleToolInput({ operation: "trigger", job_id: jobId });
        const trigBody = JSON.parse(trig.content[0]!.text) as {
          ok: boolean;
          run: { http_status: number };
        };
        expect(trigBody.ok).toBe(false);
        expect(trigBody.run.http_status).toBe(429);
        const after429 = JSON.parse(
          (await handleScheduleToolInput({ operation: "get", job_id: jobId })).content[0]!.text
        ) as { job: { change_detection_state: { backoff_until: string | null } } };
        expect(after429.job.change_detection_state.backoff_until).toBeTruthy();
        const until = Date.parse(after429.job.change_detection_state.backoff_until!);
        expect(until).toBeGreaterThan(Date.now() + 60_000);
      }
    );
  });

  it("pauses polling after consecutive upstream auth failures", async () => {
    let calls = 0;
    await withFetchServer(
      async () => {
        calls++;
        return new Response("nope", { status: 401 });
      },
      async (origin) => {
        process.env.CLAWQL_SCHEDULE_URL_ALLOWLIST_PREFIXES = origin;
        process.env.CLAWQL_SCHEDULE_AUTH_FAILURE_THRESHOLD = "3";
        const created = await handleScheduleToolInput({
          operation: "create",
          schedule: { frequency: { type: "interval", seconds: 300 } },
          action: {
            kind: "synthetic",
            synthetic_test: {
              name: "auth",
              request: { method: "GET", url: `${origin}/secure` },
              assert: { status_in: [200] },
            },
          },
        });
        const jobId = (JSON.parse(created.content[0]!.text) as { job: { id: string } }).job.id;
        await handleScheduleToolInput({ operation: "trigger", job_id: jobId });
        await handleScheduleToolInput({ operation: "trigger", job_id: jobId });
        await handleScheduleToolInput({ operation: "trigger", job_id: jobId });
        expect(calls).toBe(3);
        const got = JSON.parse(
          (await handleScheduleToolInput({ operation: "get", job_id: jobId })).content[0]!.text
        ) as {
          job: {
            change_detection_state: {
              poll_pause_reason: string | null;
              auth_failure_count: number;
            };
          };
        };
        expect(got.job.change_detection_state.poll_pause_reason).toBe("upstream_auth");
        expect(got.job.change_detection_state.auth_failure_count).toBe(3);
        const fired = await runScheduleWorkerTick(new Date());
        expect(fired).toBe(0);
        expect(calls).toBe(3);
      }
    );
  });

  it("encrypts last_projection at rest", async () => {
    process.env.CLAWQL_SCHEDULE_PROJECTION_KEY = "b".repeat(64);
    await withFetchServer(
      async () =>
        new Response(JSON.stringify({ ok: true, title: "x" }), {
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
              name: "enc",
              request: { method: "GET", url: `${origin}/x` },
              assert: { status_in: [200] },
              change_detection: { watch_fields: ["ok", "title"] },
            },
          },
        });
        const jobId = (JSON.parse(created.content[0]!.text) as { job: { id: string } }).job.id;
        await handleScheduleToolInput({ operation: "trigger", job_id: jobId });
        const got = JSON.parse(
          (await handleScheduleToolInput({ operation: "get", job_id: jobId })).content[0]!.text
        ) as {
          job: {
            change_detection_state: {
              last_projection: { ok: boolean; title: string };
              projection_encrypted: boolean;
            };
          };
        };
        expect(got.job.change_detection_state.projection_encrypted).toBe(true);
        expect(got.job.change_detection_state.last_projection).toEqual({ ok: true, title: "x" });
      }
    );
  });
});
