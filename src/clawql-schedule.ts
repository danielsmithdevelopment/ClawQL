/**
 * Optional `schedule` MCP tool (GitHub #76).
 * Persists schedule jobs + run history in local SQLite and supports a background worker
 * for cron/interval/one-shot due execution.
 */

import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, isAbsolute, resolve as resolvePath } from "node:path";
import initSqlJs, { type Database } from "sql.js";
import { z } from "zod";
import { logMcpToolShape } from "./mcp-tool-log.js";

type Frequency =
  | { type: "cron"; expression: string }
  | { type: "interval"; seconds: number }
  | { type: "one_shot"; run_at: string };

type SyntheticTest = {
  name: string;
  request: {
    method: string;
    url: string;
    headers?: Record<string, string>;
    body?: string | null;
  };
  limits?: {
    timeout_ms?: number;
    max_response_bytes?: number;
    max_redirects?: number;
  };
  assert?: {
    status_in?: number[];
    latency_ms_max?: number;
    body_contains?: string;
  };
};

type JobAction = {
  kind: "synthetic";
  synthetic_test: SyntheticTest;
};

type ScheduleJobRow = {
  id: string;
  frequency: Frequency;
  action: JobAction;
  enabled: boolean;
  created_at: string;
  updated_at: string;
};

type ScheduleRunRow = {
  id: string;
  triggered_at: string;
  dry_run: boolean;
  status: string;
  latency_ms: number | null;
  http_status: number | null;
  error_text: string | null;
  response_excerpt: string | null;
};

type TriggerOutcome = {
  ok: boolean;
  status: "pass" | "fail";
  latency_ms: number | null;
  http_status: number | null;
  error_text: string | null;
  response_excerpt: string | null;
};

const SCHEMA_VERSION = 1;
let sqlJsPromise: ReturnType<typeof initSqlJs> | null = null;
let scheduleWorkerTimer: NodeJS.Timeout | null = null;
let scheduleWorkerBusy = false;
const cronMinuteRunCache = new Map<string, string>();

async function loadSqlJs(): Promise<ReturnType<typeof initSqlJs>> {
  if (sqlJsPromise) return sqlJsPromise;
  const require = createRequire(import.meta.url);
  const sqlEntry = require.resolve("sql.js");
  const wasmPath = resolvePath(dirname(sqlEntry), "sql-wasm.wasm");
  sqlJsPromise = initSqlJs({ locateFile: () => wasmPath });
  return sqlJsPromise;
}

function nowIso(): string {
  return new Date().toISOString();
}

function toMinuteKey(date: Date): string {
  return `${date.getUTCFullYear()}-${date.getUTCMonth() + 1}-${date.getUTCDate()}-${date.getUTCHours()}-${date.getUTCMinutes()}`;
}

export function getScheduleDatabasePath(): string {
  const raw = process.env.CLAWQL_SCHEDULE_DB_PATH?.trim();
  if (!raw) return resolvePath(process.cwd(), ".clawql", "schedule.db");
  if (isAbsolute(raw)) return raw;
  return resolvePath(process.cwd(), raw);
}

export function getScheduleHistoryLimit(): number {
  const raw = process.env.CLAWQL_SCHEDULE_HISTORY_LIMIT?.trim();
  if (!raw) return 20;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return 20;
  return Math.min(Math.max(parsed, 1), 500);
}

function getSchedulePollMs(): number {
  const raw = process.env.CLAWQL_SCHEDULE_POLL_MS?.trim();
  if (!raw) return 5_000;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return 5_000;
  return Math.min(Math.max(parsed, 1_000), 60_000);
}

function getIntervalMinSeconds(): number {
  const raw = process.env.CLAWQL_SCHEDULE_INTERVAL_MIN_SECONDS?.trim();
  if (!raw) return 60;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return 60;
  return Math.min(Math.max(parsed, 1), 86_400);
}

function getIntervalMaxSeconds(): number {
  const raw = process.env.CLAWQL_SCHEDULE_INTERVAL_MAX_SECONDS?.trim();
  if (!raw) return 31_536_000;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return 31_536_000;
  return Math.min(Math.max(parsed, 60), 31_536_000);
}

function getSyntheticTimeoutDefaultMs(): number {
  const raw = process.env.CLAWQL_SCHEDULE_SYNTHETIC_TIMEOUT_MS_DEFAULT?.trim();
  if (!raw) return 10_000;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return 10_000;
  return Math.min(Math.max(parsed, 500), 60_000);
}

function getSyntheticTimeoutMaxMs(): number {
  const raw = process.env.CLAWQL_SCHEDULE_SYNTHETIC_TIMEOUT_MS_MAX?.trim();
  if (!raw) return 60_000;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return 60_000;
  return Math.min(Math.max(parsed, 500), 180_000);
}

function getSyntheticMaxResponseBytesDefault(): number {
  const raw = process.env.CLAWQL_SCHEDULE_SYNTHETIC_MAX_RESPONSE_BYTES_DEFAULT?.trim();
  if (!raw) return 1_048_576;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return 1_048_576;
  return Math.min(Math.max(parsed, 1024), 8 * 1024 * 1024);
}

function getSyntheticMaxRedirectsDefault(): number {
  const raw = process.env.CLAWQL_SCHEDULE_SYNTHETIC_MAX_REDIRECTS_DEFAULT?.trim();
  if (!raw) return 3;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return 3;
  return Math.min(Math.max(parsed, 0), 10);
}

function getUrlAllowlistPrefixes(): string[] {
  const raw = process.env.CLAWQL_SCHEDULE_URL_ALLOWLIST_PREFIXES;
  if (!raw) return [];
  return raw
    .split(/[,\n]/)
    .map((v) => v.trim())
    .filter(Boolean);
}

function scheduleNotificationsEnabled(): boolean {
  const raw = process.env.CLAWQL_SCHEDULE_NOTIFY_ON_FAILURE?.trim().toLowerCase();
  if (!raw) return false;
  return raw === "1" || raw === "true" || raw === "yes";
}

function scheduleRecoveryNotificationsEnabled(): boolean {
  const raw = process.env.CLAWQL_SCHEDULE_NOTIFY_ON_RECOVERY?.trim().toLowerCase();
  if (!raw) return false;
  return raw === "1" || raw === "true" || raw === "yes";
}

function scheduleNotifyChannel(): string | null {
  const v = process.env.CLAWQL_SCHEDULE_NOTIFY_CHANNEL?.trim();
  return v ? v : null;
}

function currentSchemaVersion(db: Database): number {
  try {
    const r = db.exec("SELECT MAX(version) AS v FROM schema_migrations");
    const v = r[0]?.values[0]?.[0];
    if (v === undefined || v === null) return 0;
    const parsed = Number(v);
    return Number.isFinite(parsed) ? parsed : 0;
  } catch {
    return 0;
  }
}

function migrate(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );
  `);
  const v = currentSchemaVersion(db);
  if (v >= SCHEMA_VERSION) return;
  if (v < 1) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS clawql_schedule_jobs (
        id TEXT PRIMARY KEY,
        frequency_json TEXT NOT NULL,
        action_json TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS clawql_schedule_runs (
        id TEXT PRIMARY KEY,
        job_id TEXT NOT NULL,
        triggered_at TEXT NOT NULL,
        dry_run INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL,
        latency_ms INTEGER,
        http_status INTEGER,
        error_text TEXT,
        response_excerpt TEXT,
        FOREIGN KEY (job_id) REFERENCES clawql_schedule_jobs(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_clawql_schedule_runs_job_id_triggered
      ON clawql_schedule_runs(job_id, triggered_at DESC);
    `);
    db.run(
      "INSERT INTO schema_migrations (version, name, applied_at) VALUES (1, 'schedule_v1', ?)",
      [nowIso()]
    );
  }
}

async function openOrCreateDb(absDbPath: string): Promise<Database> {
  const SQL = await loadSqlJs();
  try {
    const buf = await readFile(absDbPath);
    return new SQL.Database(buf);
  } catch {
    return new SQL.Database();
  }
}

async function persistDb(db: Database, absDbPath: string): Promise<void> {
  await mkdir(dirname(absDbPath), { recursive: true });
  const tmp = `${absDbPath}.${process.pid}.tmp`;
  await writeFile(tmp, Buffer.from(db.export()));
  await rename(tmp, absDbPath);
}

function jsonResponse(obj: unknown): { content: { type: "text"; text: string }[] } {
  return { content: [{ type: "text", text: JSON.stringify(obj, null, 2) }] };
}

function safeJsonParse<T>(raw: string): T {
  return JSON.parse(raw) as T;
}

const frequencySchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("cron"),
    expression: z.string().min(1).max(200),
  }),
  z.object({
    type: z.literal("interval"),
    seconds: z.number().int(),
  }),
  z.object({
    type: z.literal("one_shot"),
    run_at: z.string().datetime(),
  }),
]);

const actionSchema = z.object({
  kind: z.literal("synthetic"),
  synthetic_test: z.object({
    name: z.string().min(1).max(200),
    request: z.object({
      method: z.string().min(1).max(16),
      url: z.string().url().max(2048),
      headers: z.record(z.string(), z.string()).optional(),
      body: z.union([z.string(), z.null()]).optional(),
    }),
    limits: z
      .object({
        timeout_ms: z.number().int().positive().optional(),
        max_response_bytes: z.number().int().positive().optional(),
        max_redirects: z.number().int().min(0).optional(),
      })
      .optional(),
    assert: z
      .object({
        status_in: z.array(z.number().int().min(100).max(599)).min(1).max(20).optional(),
        latency_ms_max: z.number().int().positive().optional(),
        body_contains: z.string().max(4000).optional(),
      })
      .optional(),
  }),
});

export const scheduleToolSchema = {
  operation: z
    .enum(["create", "list", "get", "delete", "trigger"])
    .describe("create | list | get | delete | trigger scheduled jobs."),
  job_id: z.string().max(128).optional().describe("Required for get/delete/trigger."),
  schedule: z.object({ frequency: frequencySchema }).optional(),
  action: actionSchema.optional(),
  enabled: z.boolean().optional().describe("For create: defaults true."),
  dry_run: z
    .boolean()
    .optional()
    .describe("For trigger: validate and execute assertion logic without storing a live run."),
  include_runs: z
    .boolean()
    .optional()
    .describe("For list/get: include recent run history (default true for get, false for list)."),
  limit: z.number().int().min(1).max(200).optional().describe("For list: max jobs (default 50)."),
  runs_limit: z
    .number()
    .int()
    .min(1)
    .max(200)
    .optional()
    .describe("For get/list with include_runs: max runs per job (default CLAWQL_SCHEDULE_HISTORY_LIMIT)."),
};

const scheduleInputSchema = z.object(scheduleToolSchema).superRefine((data, ctx) => {
  if (data.operation === "create") {
    if (!data.schedule?.frequency) {
      ctx.addIssue({ code: "custom", message: "create requires schedule.frequency" });
    }
    if (!data.action) {
      ctx.addIssue({ code: "custom", message: "create requires action" });
    }
    const freq = data.schedule?.frequency;
    if (freq?.type === "interval") {
      const min = getIntervalMinSeconds();
      const max = getIntervalMaxSeconds();
      if (freq.seconds < min || freq.seconds > max) {
        ctx.addIssue({
          code: "custom",
          message: `interval seconds must be between ${min} and ${max}`,
        });
      }
    }
  }
  if (data.operation === "get" || data.operation === "delete" || data.operation === "trigger") {
    if (!data.job_id || !data.job_id.trim()) {
      ctx.addIssue({ code: "custom", message: `${data.operation} requires job_id` });
    }
  }
});

function clamp(val: number, min: number, max: number): number {
  return Math.min(Math.max(val, min), max);
}

function validateSyntheticTarget(urlRaw: string): { ok: true } | { ok: false; error: string } {
  let u: URL;
  try {
    u = new URL(urlRaw);
  } catch {
    return { ok: false, error: "invalid synthetic URL" };
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    return { ok: false, error: "synthetic URL must use http/https" };
  }
  const allowlist = getUrlAllowlistPrefixes();
  if (allowlist.length > 0) {
    if (!allowlist.some((prefix) => urlRaw.startsWith(prefix))) {
      return { ok: false, error: "synthetic URL is not in CLAWQL_SCHEDULE_URL_ALLOWLIST_PREFIXES" };
    }
    return { ok: true };
  }
  const host = u.hostname.trim().toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost")) {
    return { ok: false, error: "localhost synthetic targets are blocked (set allowlist to override)" };
  }
  if (
    /^(127\.)|^(10\.)|^(192\.168\.)|^(169\.254\.)|^(0\.)|^(::1)$|^(fc00:)|^(fd00:)|^(fe80:)/i.test(
      host
    )
  ) {
    return {
      ok: false,
      error: "private/link-local synthetic targets are blocked (set allowlist to override)",
    };
  }
  return { ok: true };
}

function getJobById(db: Database, jobId: string): ScheduleJobRow | null {
  const stmt = db.prepare(
    `SELECT id, frequency_json, action_json, enabled, created_at, updated_at
     FROM clawql_schedule_jobs
     WHERE id = ?
     LIMIT 1`
  );
  stmt.bind([jobId]);
  if (!stmt.step()) {
    stmt.free();
    return null;
  }
  const row = stmt.getAsObject() as {
    id: string;
    frequency_json: string;
    action_json: string;
    enabled: number;
    created_at: string;
    updated_at: string;
  };
  stmt.free();
  const job: ScheduleJobRow = {
    id: row.id,
    frequency: safeJsonParse<Frequency>(row.frequency_json),
    action: safeJsonParse<JobAction>(row.action_json),
    enabled: Number(row.enabled) === 1,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
  return job;
}

function getRunsForJob(db: Database, jobId: string, runsLimit: number): ScheduleRunRow[] {
  const out: ScheduleRunRow[] = [];
  const stmt = db.prepare(
    `SELECT id, triggered_at, dry_run, status, latency_ms, http_status, error_text, response_excerpt
     FROM clawql_schedule_runs
     WHERE job_id = ?
     ORDER BY triggered_at DESC
     LIMIT ?`
  );
  stmt.bind([jobId, runsLimit]);
  while (stmt.step()) {
    const row = stmt.getAsObject() as {
      id: string;
      triggered_at: string;
      dry_run: number;
      status: string;
      latency_ms: number | null;
      http_status: number | null;
      error_text: string | null;
      response_excerpt: string | null;
    };
    out.push({
      id: row.id,
      triggered_at: row.triggered_at,
      dry_run: Number(row.dry_run) === 1,
      status: row.status,
      latency_ms: row.latency_ms === null ? null : Number(row.latency_ms),
      http_status: row.http_status === null ? null : Number(row.http_status),
      error_text: row.error_text,
      response_excerpt: row.response_excerpt,
    });
  }
  stmt.free();
  return out;
}

async function runSyntheticCheck(synthetic: SyntheticTest): Promise<TriggerOutcome> {
  const method = synthetic.request.method.trim().toUpperCase();
  const targetValidation = validateSyntheticTarget(synthetic.request.url);
  if (!targetValidation.ok) {
    return {
      ok: false,
      status: "fail",
      latency_ms: null,
      http_status: null,
      error_text: targetValidation.error,
      response_excerpt: null,
    };
  }

  const timeoutMax = getSyntheticTimeoutMaxMs();
  const timeout = clamp(synthetic.limits?.timeout_ms ?? getSyntheticTimeoutDefaultMs(), 500, timeoutMax);
  const maxResponseBytes = clamp(
    synthetic.limits?.max_response_bytes ?? getSyntheticMaxResponseBytesDefault(),
    1024,
    8 * 1024 * 1024
  );
  const maxRedirects = clamp(synthetic.limits?.max_redirects ?? getSyntheticMaxRedirectsDefault(), 0, 10);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  const start = Date.now();
  try {
    let currentUrl = synthetic.request.url;
    let redirects = 0;
    let response: Response | null = null;
    while (true) {
      response = await fetch(currentUrl, {
        method,
        headers: synthetic.request.headers,
        body: synthetic.request.body ?? undefined,
        signal: controller.signal,
        redirect: "manual",
      });
      if (
        response.status >= 300 &&
        response.status < 400 &&
        response.headers.get("location") &&
        redirects < maxRedirects
      ) {
        currentUrl = new URL(response.headers.get("location")!, currentUrl).toString();
        redirects++;
        continue;
      }
      break;
    }
    const latency = Date.now() - start;
    const raw = await response!.text();
    const excerpt = raw.slice(0, maxResponseBytes);

    let pass = true;
    const statusIn = synthetic.assert?.status_in;
    if (statusIn?.length && !statusIn.includes(response!.status)) {
      pass = false;
    }
    const latencyMax = synthetic.assert?.latency_ms_max;
    if (latencyMax !== undefined && latency > latencyMax) {
      pass = false;
    }
    const bodyContains = synthetic.assert?.body_contains;
    if (bodyContains !== undefined && !excerpt.includes(bodyContains)) {
      pass = false;
    }

    return {
      ok: pass,
      status: pass ? "pass" : "fail",
      latency_ms: latency,
      http_status: response!.status,
      error_text: pass ? null : "assertion failed",
      response_excerpt: excerpt,
    };
  } catch (error: unknown) {
    return {
      ok: false,
      status: "fail",
      latency_ms: Date.now() - start,
      http_status: null,
      error_text: error instanceof Error ? error.message : String(error),
      response_excerpt: null,
    };
  } finally {
    clearTimeout(timer);
  }
}

function trimRunsForJob(db: Database, jobId: string, keep: number): void {
  db.run(
    `DELETE FROM clawql_schedule_runs
     WHERE job_id = ?
     AND id NOT IN (
       SELECT id FROM clawql_schedule_runs WHERE job_id = ? ORDER BY triggered_at DESC LIMIT ?
     )`,
    [jobId, jobId, keep]
  );
}

function hasRunSince(db: Database, jobId: string, isoSince: string): boolean {
  const stmt = db.prepare(
    `SELECT 1 FROM clawql_schedule_runs
     WHERE job_id = ?
     AND triggered_at >= ?
     LIMIT 1`
  );
  stmt.bind([jobId, isoSince]);
  const exists = stmt.step();
  stmt.free();
  return exists;
}

function latestRunForJob(db: Database, jobId: string): { triggered_at: string; status: string } | null {
  const stmt = db.prepare(
    `SELECT triggered_at, status
     FROM clawql_schedule_runs
     WHERE job_id = ?
     ORDER BY triggered_at DESC
     LIMIT 1`
  );
  stmt.bind([jobId]);
  if (!stmt.step()) {
    stmt.free();
    return null;
  }
  const row = stmt.getAsObject() as { triggered_at: string; status: string };
  stmt.free();
  return { triggered_at: row.triggered_at, status: row.status };
}

function parseCronField(field: string, min: number, max: number): Set<number> {
  const out = new Set<number>();
  const trimmed = field.trim();
  if (trimmed === "*") {
    for (let n = min; n <= max; n++) out.add(n);
    return out;
  }
  for (const partRaw of trimmed.split(",")) {
    const part = partRaw.trim();
    if (!part) continue;
    const stepMatch = part.match(/^\*\/(\d+)$/);
    if (stepMatch) {
      const step = Number.parseInt(stepMatch[1]!, 10);
      if (!Number.isFinite(step) || step < 1) continue;
      for (let n = min; n <= max; n += step) out.add(n);
      continue;
    }
    const rangeMatch = part.match(/^(\d+)-(\d+)$/);
    if (rangeMatch) {
      const start = Number.parseInt(rangeMatch[1]!, 10);
      const end = Number.parseInt(rangeMatch[2]!, 10);
      for (let n = start; n <= end; n++) {
        if (n >= min && n <= max) out.add(n);
      }
      continue;
    }
    const value = Number.parseInt(part, 10);
    if (Number.isFinite(value) && value >= min && value <= max) out.add(value);
  }
  return out;
}

function cronMatchesUtc(expression: string, at: Date): boolean {
  const parts = expression.trim().split(/\s+/);
  if (parts.length !== 5) return false;
  const [m, h, dom, mon, dow] = parts;
  const minutes = parseCronField(m, 0, 59);
  const hours = parseCronField(h, 0, 23);
  const days = parseCronField(dom, 1, 31);
  const months = parseCronField(mon, 1, 12);
  const dows = parseCronField(dow, 0, 6);
  return (
    minutes.has(at.getUTCMinutes()) &&
    hours.has(at.getUTCHours()) &&
    days.has(at.getUTCDate()) &&
    months.has(at.getUTCMonth() + 1) &&
    dows.has(at.getUTCDay())
  );
}

function shouldRunJobNow(db: Database, job: ScheduleJobRow, now: Date): boolean {
  if (!job.enabled) return false;
  if (job.frequency.type === "interval") {
    const latest = latestRunForJob(db, job.id);
    if (!latest) return true;
    const latestMs = Date.parse(latest.triggered_at);
    if (!Number.isFinite(latestMs)) return true;
    return now.getTime() - latestMs >= job.frequency.seconds * 1000;
  }
  if (job.frequency.type === "one_shot") {
    const runAt = Date.parse(job.frequency.run_at);
    if (!Number.isFinite(runAt)) return false;
    if (now.getTime() < runAt) return false;
    return !hasRunSince(db, job.id, job.frequency.run_at);
  }
  if (job.frequency.type === "cron") {
    if (!cronMatchesUtc(job.frequency.expression, now)) return false;
    const minuteKey = toMinuteKey(now);
    const cacheKey = `${job.id}:${minuteKey}`;
    if (cronMinuteRunCache.has(cacheKey)) return false;
    const minuteStart = new Date(now);
    minuteStart.setUTCSeconds(0, 0);
    if (hasRunSince(db, job.id, minuteStart.toISOString())) {
      cronMinuteRunCache.set(cacheKey, minuteKey);
      return false;
    }
    cronMinuteRunCache.set(cacheKey, minuteKey);
    return true;
  }
  return false;
}

async function maybeSendScheduleNotification(job: ScheduleJobRow, run: ScheduleRunRow): Promise<void> {
  const channel = scheduleNotifyChannel();
  if (!channel) return;
  const shouldNotifyFailure = scheduleNotificationsEnabled() && run.status === "fail";
  const shouldNotifyRecovery = scheduleRecoveryNotificationsEnabled() && run.status === "pass";
  if (!shouldNotifyFailure && !shouldNotifyRecovery) return;
  const lastTwo = await listRecentRunStatuses(job.id, 2);
  const recovered =
    shouldNotifyRecovery &&
    lastTwo.length >= 2 &&
    lastTwo[0] === "pass" &&
    lastTwo[1] === "fail";
  if (shouldNotifyRecovery && !recovered) return;

  try {
    const { handleNotifyToolInput } = await import("./tools.js");
    const statusText = run.status === "pass" ? "RECOVERY" : "FAILURE";
    const text =
      `Synthetic ${statusText}: ${job.action.synthetic_test.name}\n` +
      `job_id=${job.id}\n` +
      `http_status=${run.http_status ?? "none"} latency_ms=${run.latency_ms ?? "none"}\n` +
      `${run.error_text ?? "no error text"}`;
    await handleNotifyToolInput({ channel, text });
  } catch {
    // Optional side channel; never fail the schedule loop because notify failed.
  }
}

async function listRecentRunStatuses(jobId: string, limit: number): Promise<string[]> {
  const absDbPath = getScheduleDatabasePath();
  const db = await openOrCreateDb(absDbPath);
  try {
    db.exec("PRAGMA foreign_keys = ON;");
    migrate(db);
    const stmt = db.prepare(
      `SELECT status FROM clawql_schedule_runs WHERE job_id = ? ORDER BY triggered_at DESC LIMIT ?`
    );
    stmt.bind([jobId, limit]);
    const out: string[] = [];
    while (stmt.step()) {
      const row = stmt.getAsObject() as { status: string };
      out.push(row.status);
    }
    stmt.free();
    return out;
  } finally {
    db.close();
  }
}

async function executeTriggerForJob(
  db: Database,
  job: ScheduleJobRow,
  opts: { dryRun: boolean; triggeredAt?: string }
): Promise<ScheduleRunRow & { ok: boolean }> {
  const synthetic = actionSchema.parse(job.action).synthetic_test;
  const outcome = await runSyntheticCheck(synthetic);
  const runId = randomUUID();
  const triggeredAt = opts.triggeredAt ?? nowIso();
  const run: ScheduleRunRow = {
    id: runId,
    triggered_at: triggeredAt,
    dry_run: opts.dryRun,
    status: outcome.status,
    latency_ms: outcome.latency_ms,
    http_status: outcome.http_status,
    error_text: outcome.error_text,
    response_excerpt: outcome.response_excerpt,
  };
  if (!opts.dryRun) {
    db.run(
      `INSERT INTO clawql_schedule_runs
       (id, job_id, triggered_at, dry_run, status, latency_ms, http_status, error_text, response_excerpt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        run.id,
        job.id,
        run.triggered_at,
        0,
        run.status,
        run.latency_ms,
        run.http_status,
        run.error_text,
        run.response_excerpt,
      ]
    );
    trimRunsForJob(db, job.id, getScheduleHistoryLimit());
  }
  return { ...run, ok: outcome.ok };
}

function getAllEnabledJobs(db: Database): ScheduleJobRow[] {
  const stmt = db.prepare(
    `SELECT id, frequency_json, action_json, enabled, created_at, updated_at
     FROM clawql_schedule_jobs
     WHERE enabled = 1`
  );
  const out: ScheduleJobRow[] = [];
  while (stmt.step()) {
    const row = stmt.getAsObject() as {
      id: string;
      frequency_json: string;
      action_json: string;
      enabled: number;
      created_at: string;
      updated_at: string;
    };
    out.push({
      id: row.id,
      frequency: safeJsonParse<Frequency>(row.frequency_json),
      action: safeJsonParse<JobAction>(row.action_json),
      enabled: Number(row.enabled) === 1,
      created_at: row.created_at,
      updated_at: row.updated_at,
    });
  }
  stmt.free();
  return out;
}

export async function runScheduleWorkerTick(now = new Date()): Promise<number> {
  const absDbPath = getScheduleDatabasePath();
  const db = await openOrCreateDb(absDbPath);
  try {
    db.exec("PRAGMA foreign_keys = ON;");
    migrate(db);
    const jobs = getAllEnabledJobs(db);
    let fired = 0;
    const notifications: Array<Promise<void>> = [];
    for (const job of jobs) {
      if (!shouldRunJobNow(db, job, now)) continue;
      const run = await executeTriggerForJob(db, job, {
        dryRun: false,
        triggeredAt: now.toISOString(),
      });
      fired++;
      notifications.push(maybeSendScheduleNotification(job, run));
    }
    if (fired > 0) {
      await persistDb(db, absDbPath);
    }
    await Promise.all(notifications);
    return fired;
  } finally {
    db.close();
  }
}

export function startScheduleWorker(): void {
  if (scheduleWorkerTimer) return;
  const pollMs = getSchedulePollMs();
  scheduleWorkerTimer = setInterval(async () => {
    if (scheduleWorkerBusy) return;
    scheduleWorkerBusy = true;
    try {
      await runScheduleWorkerTick();
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`[clawql-schedule] worker tick failed: ${msg}`);
    } finally {
      scheduleWorkerBusy = false;
    }
  }, pollMs);
}

export function stopScheduleWorker(): void {
  if (!scheduleWorkerTimer) return;
  clearInterval(scheduleWorkerTimer);
  scheduleWorkerTimer = null;
}

export function registerScheduleWorkerShutdownHooks(): void {
  const shutdown = () => stopScheduleWorker();
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
  process.once("exit", shutdown);
}

export async function handleScheduleToolInput(
  params: unknown
): Promise<{ content: { type: "text"; text: string }[] }> {
  const parsed = scheduleInputSchema.parse(params);
  logMcpToolShape("schedule", {
    operation: parsed.operation,
    jobIdLen: parsed.job_id?.length,
    includeRuns: parsed.include_runs,
    dryRun: parsed.dry_run,
  });

  const absDbPath = getScheduleDatabasePath();
  const db = await openOrCreateDb(absDbPath);
  try {
    db.exec("PRAGMA foreign_keys = ON;");
    migrate(db);

    switch (parsed.operation) {
      case "create": {
        const id = randomUUID();
        const createdAt = nowIso();
        const frequency = parsed.schedule!.frequency as Frequency;
        const action = parsed.action as JobAction;
        db.run(
          `INSERT INTO clawql_schedule_jobs (id, frequency_json, action_json, enabled, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [
            id,
            JSON.stringify(frequency),
            JSON.stringify(action),
            parsed.enabled === false ? 0 : 1,
            createdAt,
            createdAt,
          ]
        );
        await persistDb(db, absDbPath);
        return jsonResponse({
          ok: true,
          operation: "create",
          job: {
            id,
            schedule: { frequency },
            action,
            enabled: parsed.enabled === false ? false : true,
            created_at: createdAt,
            updated_at: createdAt,
          },
        });
      }
      case "list": {
        const limit = parsed.limit ?? 50;
        const runsLimit = parsed.runs_limit ?? getScheduleHistoryLimit();
        const includeRuns = parsed.include_runs === true;
        const stmt = db.prepare(
          `SELECT id, frequency_json, action_json, enabled, created_at, updated_at
           FROM clawql_schedule_jobs
           ORDER BY created_at DESC
           LIMIT ?`
        );
        stmt.bind([limit]);
        const jobs: Array<Record<string, unknown>> = [];
        while (stmt.step()) {
          const row = stmt.getAsObject() as {
            id: string;
            frequency_json: string;
            action_json: string;
            enabled: number;
            created_at: string;
            updated_at: string;
          };
          const job: Record<string, unknown> = {
            id: row.id,
            schedule: { frequency: safeJsonParse<Frequency>(row.frequency_json) },
            action: safeJsonParse<JobAction>(row.action_json),
            enabled: Number(row.enabled) === 1,
            created_at: row.created_at,
            updated_at: row.updated_at,
          };
          if (includeRuns) job.runs = getRunsForJob(db, row.id, runsLimit);
          jobs.push(job);
        }
        stmt.free();
        return jsonResponse({ ok: true, operation: "list", jobs });
      }
      case "get": {
        const runsLimit = parsed.runs_limit ?? getScheduleHistoryLimit();
        const includeRuns = parsed.include_runs ?? true;
        const job = getJobById(db, parsed.job_id!);
        if (!job) {
          return jsonResponse({ ok: false, error: `job not found: ${parsed.job_id}` });
        }
        return jsonResponse({
          ok: true,
          operation: "get",
          job: {
            ...job,
            schedule: { frequency: job.frequency },
            ...(includeRuns ? { runs: getRunsForJob(db, job.id, runsLimit) } : {}),
          },
        });
      }
      case "delete": {
        const job = getJobById(db, parsed.job_id!);
        if (!job) {
          return jsonResponse({ ok: false, error: `job not found: ${parsed.job_id}` });
        }
        db.run("DELETE FROM clawql_schedule_jobs WHERE id = ?", [job.id]);
        await persistDb(db, absDbPath);
        return jsonResponse({
          ok: true,
          operation: "delete",
          deleted: true,
          job_id: parsed.job_id,
        });
      }
      case "trigger": {
        const job = getJobById(db, parsed.job_id!);
        if (!job) {
          return jsonResponse({ ok: false, error: `job not found: ${parsed.job_id}` });
        }
        const run = await executeTriggerForJob(db, job, { dryRun: parsed.dry_run === true });
        if (!run.dry_run) {
          await persistDb(db, absDbPath);
          await maybeSendScheduleNotification(job, run);
        }
        return jsonResponse({
          ok: run.ok,
          operation: "trigger",
          job_id: job.id,
          run,
        });
      }
    }
  } finally {
    db.close();
  }
}

/** Test helper. */
export function resetScheduleSqlJsForTests(): void {
  sqlJsPromise = null;
  stopScheduleWorker();
  scheduleWorkerBusy = false;
  cronMinuteRunCache.clear();
}

export const __scheduleTestUtils = {
  cronMatchesUtc,
  shouldRunJobNow,
};
