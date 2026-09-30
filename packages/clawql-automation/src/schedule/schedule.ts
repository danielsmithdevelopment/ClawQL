/**
 * Optional `schedule` MCP tool (GitHub #76).
 * Persists schedule jobs + run history in local SQLite and supports a background worker
 * for cron/interval/one-shot due execution.
 */

import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, isAbsolute, resolve as resolvePath } from "node:path";
import { Effect } from "effect";
import initSqlJs, { type Database } from "sql.js";
import { z } from "zod";
import { startScheduleWorkerFiberEffect } from "../effect/schedule-worker-effect.js";
import { executeNotifySlackCore } from "../notify/notify.js";
import { appendWorkflowAudit } from "../workflow/workflow-audit.js";
import {
  DEFAULT_RATE_LIMIT_BACKOFF_MS,
  detectProjectedChange,
  parseRetryAfterMs,
  summarizeDiff,
  type ChangeDetectionConfig,
} from "./change-detect.js";
import {
  isEncryptedProjectionBlob,
  loadStoredProjection,
  loadStoredProjectionJson,
  prepareProjectionForStore,
} from "./projection-store.js";

export {
  detectProjectedChange,
  canonicalizeForHash,
  projectByWatchFields,
  diffProjections,
  hashProjection,
  parseRetryAfterMs,
  serializeProjectionForStore,
  DEFAULT_RATE_LIMIT_BACKOFF_MS,
} from "./change-detect.js";
export type { ChangeDetectionConfig, ProjectionDiff } from "./change-detect.js";
export {
  prepareProjectionForStore,
  loadStoredProjection,
  isEncryptedProjectionBlob,
} from "./projection-store.js";

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
  /** Precise stream.changed detection — project + hash watched fields. */
  change_detection?: ChangeDetectionConfig;
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
  etag?: string | null;
  last_modified?: string | null;
  not_modified?: boolean;
  retry_after_ms?: number | null;
};

const SCHEMA_VERSION = 4;
let sqlJsPromise: ReturnType<typeof initSqlJs> | null = null;
let scheduleWorkerStop: (() => void) | null = null;
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
  if (currentSchemaVersion(db) < 2) {
    db.exec(`
      ALTER TABLE clawql_schedule_jobs ADD COLUMN last_body_hash TEXT;
    `);
    db.run(
      "INSERT INTO schema_migrations (version, name, applied_at) VALUES (2, 'schedule_body_hash_v2', ?)",
      [nowIso()]
    );
  }
  if (currentSchemaVersion(db) < 3) {
    db.exec(`
      ALTER TABLE clawql_schedule_jobs ADD COLUMN last_projection_json TEXT;
      ALTER TABLE clawql_schedule_jobs ADD COLUMN last_etag TEXT;
      ALTER TABLE clawql_schedule_jobs ADD COLUMN last_modified TEXT;
      ALTER TABLE clawql_schedule_jobs ADD COLUMN backoff_until TEXT;
    `);
    db.run(
      "INSERT INTO schema_migrations (version, name, applied_at) VALUES (3, 'schedule_change_detect_v3', ?)",
      [nowIso()]
    );
  }
  if (currentSchemaVersion(db) < 4) {
    db.exec(`
      ALTER TABLE clawql_schedule_jobs ADD COLUMN auth_failure_count INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE clawql_schedule_jobs ADD COLUMN poll_pause_reason TEXT;
    `);
    db.run(
      "INSERT INTO schema_migrations (version, name, applied_at) VALUES (4, 'schedule_auth_pause_v4', ?)",
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

/** Open schedule DB (Effect IO edge). */
export async function openScheduleDatabase(absDbPath: string): Promise<Database> {
  return openOrCreateDb(absDbPath);
}

export function prepareScheduleDatabase(db: Database): void {
  db.exec("PRAGMA foreign_keys = ON;");
  migrate(db);
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
    change_detection: z
      .object({
        watch_fields: z.array(z.string().min(1).max(200)).min(1).max(40),
        exclude_paths: z.array(z.string().min(1).max(200)).max(40).optional(),
        array_sort_keys: z.record(z.string(), z.string().min(1).max(64)).optional(),
        conditional_requests: z.boolean().optional(),
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
    .describe(
      "For get/list with include_runs: max runs per job (default CLAWQL_SCHEDULE_HISTORY_LIMIT)."
    ),
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

export type ScheduleParsedInput = z.infer<typeof scheduleInputSchema>;

/** Zod parse for schedule tool (throws ZodError — keep inside Promise/Effect IO). */
export function parseScheduleToolInput(params: unknown): ScheduleParsedInput {
  return scheduleInputSchema.parse(params);
}

function clamp(val: number, min: number, max: number): number {
  return Math.min(Math.max(val, min), max);
}

/** Exported for unit tests (SSRF gate for synthetic HTTP targets). */
export function validateSyntheticTarget(
  urlRaw: string
): { ok: true } | { ok: false; error: string } {
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
    return {
      ok: false,
      error: "localhost synthetic targets are blocked (set allowlist to override)",
    };
  }
  if (
    /^(127\.)|^(10\.)|^(192\.168\.)|^(169\.254\.)|^(0\.)|^(172\.(1[6-9]|2\d|3[0-1])\.)|^(::1)$|^(fc00:)|^(fd00:)|^(fe80:)/i.test(
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

type JobChangeState = {
  last_body_hash: string | null;
  last_projection_json: string | null;
  last_etag: string | null;
  last_modified: string | null;
  backoff_until: string | null;
  auth_failure_count: number;
  poll_pause_reason: string | null;
};

function getAuthFailureThreshold(): number {
  const raw = process.env.CLAWQL_SCHEDULE_AUTH_FAILURE_THRESHOLD?.trim();
  const n = raw ? Number.parseInt(raw, 10) : 3;
  return Number.isFinite(n) && n >= 1 ? Math.min(n, 20) : 3;
}

function getJobChangeState(db: Database, jobId: string): JobChangeState {
  const stmt = db.prepare(
    `SELECT last_body_hash, last_projection_json, last_etag, last_modified, backoff_until,
            auth_failure_count, poll_pause_reason
     FROM clawql_schedule_jobs WHERE id = ?`
  );
  stmt.bind([jobId]);
  const empty: JobChangeState = {
    last_body_hash: null,
    last_projection_json: null,
    last_etag: null,
    last_modified: null,
    backoff_until: null,
    auth_failure_count: 0,
    poll_pause_reason: null,
  };
  if (!stmt.step()) {
    stmt.free();
    return empty;
  }
  const row = stmt.getAsObject() as Record<string, unknown>;
  stmt.free();
  const asStr = (v: unknown): string | null => (typeof v === "string" && v.length ? v : null);
  return {
    last_body_hash: asStr(row.last_body_hash),
    last_projection_json: asStr(row.last_projection_json),
    last_etag: asStr(row.last_etag),
    last_modified: asStr(row.last_modified),
    backoff_until: asStr(row.backoff_until),
    auth_failure_count: Number(row.auth_failure_count) || 0,
    poll_pause_reason: asStr(row.poll_pause_reason),
  };
}

function setJobChangeState(db: Database, jobId: string, patch: Partial<JobChangeState>): void {
  const cur = getJobChangeState(db, jobId);
  const next: JobChangeState = {
    last_body_hash: patch.last_body_hash !== undefined ? patch.last_body_hash : cur.last_body_hash,
    last_projection_json:
      patch.last_projection_json !== undefined
        ? patch.last_projection_json
        : cur.last_projection_json,
    last_etag: patch.last_etag !== undefined ? patch.last_etag : cur.last_etag,
    last_modified: patch.last_modified !== undefined ? patch.last_modified : cur.last_modified,
    backoff_until: patch.backoff_until !== undefined ? patch.backoff_until : cur.backoff_until,
    auth_failure_count:
      patch.auth_failure_count !== undefined
        ? patch.auth_failure_count
        : cur.auth_failure_count,
    poll_pause_reason:
      patch.poll_pause_reason !== undefined
        ? patch.poll_pause_reason
        : cur.poll_pause_reason,
  };
  db.run(
    `UPDATE clawql_schedule_jobs
     SET last_body_hash = ?, last_projection_json = ?, last_etag = ?, last_modified = ?,
         backoff_until = ?, auth_failure_count = ?, poll_pause_reason = ?, updated_at = ?
     WHERE id = ?`,
    [
      next.last_body_hash,
      next.last_projection_json,
      next.last_etag,
      next.last_modified,
      next.backoff_until,
      next.auth_failure_count,
      next.poll_pause_reason,
      nowIso(),
      jobId,
    ]
  );
}

/** Delete stored projection when schedule job or stream.changed subscription ends. */
export async function clearScheduleProjectionForTopic(topic: string): Promise<void> {
  const jobId = topic.trim();
  if (!jobId) return;
  const absDbPath = getScheduleDatabasePath();
  const db = await openOrCreateDb(absDbPath);
  try {
    db.exec("PRAGMA foreign_keys = ON;");
    migrate(db);
    setJobChangeState(db, jobId, {
      last_projection_json: null,
      last_body_hash: null,
      last_etag: null,
      last_modified: null,
    });
    await persistDb(db, absDbPath);
  } finally {
    db.close();
  }
}

function jobInBackoff(db: Database, jobId: string, now = new Date()): boolean {
  const state = getJobChangeState(db, jobId);
  if (!state.backoff_until) return false;
  const until = Date.parse(state.backoff_until);
  if (!Number.isFinite(until)) return false;
  return now.getTime() < until;
}

function jobPollPaused(db: Database, jobId: string): string | null {
  return getJobChangeState(db, jobId).poll_pause_reason;
}

function surfaceScheduleAuthPause(jobId: string, name: string, failures: number): void {
  const summary = `Paused schedule poll ${jobId} (${name}) after ${failures} consecutive upstream auth failures (401/403). Fix credentials then trigger the job to resume.`;
  console.error(`[clawql-schedule] ${summary}`);
  try {
    appendWorkflowAudit({
      action: "schedule_auth_paused",
      summary,
      correlationId: jobId,
    });
  } catch {
    /* audit optional outside MCP process */
  }
}

/**
 * Legacy whole-body hash helper — prefer {@link detectProjectedChange}.
 * Still applies default volatile-path stripping when no watch_fields are set.
 * Exported for unit tests / backward compatibility.
 */
export function detectSyntheticBodyChange(
  previousHash: string | null,
  excerpt: string | null
): { changed: boolean; hash: string; baseline: boolean } {
  const result = detectProjectedChange({
    previousHash,
    previousProjectionJson: null,
    responseBody: excerpt,
    config: undefined,
  });
  return { changed: result.changed, hash: result.hash, baseline: result.baseline };
}

async function runSyntheticCheck(
  synthetic: SyntheticTest,
  validators?: { etag?: string | null; last_modified?: string | null }
): Promise<TriggerOutcome> {
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
  const timeout = clamp(
    synthetic.limits?.timeout_ms ?? getSyntheticTimeoutDefaultMs(),
    500,
    timeoutMax
  );
  const maxResponseBytes = clamp(
    synthetic.limits?.max_response_bytes ?? getSyntheticMaxResponseBytesDefault(),
    1024,
    8 * 1024 * 1024
  );
  const maxRedirects = clamp(
    synthetic.limits?.max_redirects ?? getSyntheticMaxRedirectsDefault(),
    0,
    10
  );

  const useConditional =
    (method === "GET" || method === "HEAD") &&
    synthetic.change_detection?.conditional_requests !== false &&
    Boolean(validators?.etag || validators?.last_modified);

  const headers: Record<string, string> = {
    ...(synthetic.request.headers ?? {}),
  };
  if (useConditional) {
    if (validators?.etag) headers["If-None-Match"] = validators.etag;
    if (validators?.last_modified) headers["If-Modified-Since"] = validators.last_modified;
  }

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
        headers,
        body:
          method === "GET" || method === "HEAD" ? undefined : (synthetic.request.body ?? undefined),
        signal: controller.signal,
        redirect: "manual",
      });
      if (
        response.status >= 300 &&
        response.status < 400 &&
        response.status !== 304 &&
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
    const status = response!.status;
    const etag = response!.headers.get("etag");
    const lastModified = response!.headers.get("last-modified");
    const retryAfterMs =
      status === 429 ? parseRetryAfterMs(response!.headers.get("retry-after")) : null;

    if (status === 304) {
      return {
        ok: true,
        status: "pass",
        latency_ms: latency,
        http_status: 304,
        error_text: null,
        response_excerpt: null,
        etag: etag ?? validators?.etag ?? null,
        last_modified: lastModified ?? validators?.last_modified ?? null,
        not_modified: true,
        retry_after_ms: null,
      };
    }

    if (status === 429) {
      return {
        ok: false,
        status: "fail",
        latency_ms: latency,
        http_status: 429,
        error_text: "upstream rate limited (429)",
        response_excerpt: null,
        etag: etag ?? validators?.etag ?? null,
        last_modified: lastModified ?? validators?.last_modified ?? null,
        not_modified: false,
        retry_after_ms: retryAfterMs ?? DEFAULT_RATE_LIMIT_BACKOFF_MS,
      };
    }

    const raw = await response!.text();
    const excerpt = raw.slice(0, maxResponseBytes);

    let pass = true;
    const statusIn = synthetic.assert?.status_in;
    if (statusIn?.length && !statusIn.includes(status)) {
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
      http_status: status,
      error_text: pass ? null : "assertion failed",
      response_excerpt: excerpt,
      etag: etag ?? null,
      last_modified: lastModified ?? null,
      not_modified: false,
      retry_after_ms: null,
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

function latestRunForJob(
  db: Database,
  jobId: string
): { triggered_at: string; status: string } | null {
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
  if (jobPollPaused(db, job.id)) return false;
  if (jobInBackoff(db, job.id, now)) return false;
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

async function maybeSendScheduleNotification(
  job: ScheduleJobRow,
  run: ScheduleRunRow
): Promise<void> {
  const channel = scheduleNotifyChannel();
  if (!channel) return;
  const shouldNotifyFailure = scheduleNotificationsEnabled() && run.status === "fail";
  const shouldNotifyRecovery = scheduleRecoveryNotificationsEnabled() && run.status === "pass";
  if (!shouldNotifyFailure && !shouldNotifyRecovery) return;
  const lastTwo = await listRecentRunStatuses(job.id, 2);
  const recovered =
    shouldNotifyRecovery && lastTwo.length >= 2 && lastTwo[0] === "pass" && lastTwo[1] === "fail";
  if (shouldNotifyRecovery && !recovered) return;

  try {
    const statusText = run.status === "pass" ? "RECOVERY" : "FAILURE";
    const text =
      `Synthetic ${statusText}: ${job.action.synthetic_test.name}\n` +
      `job_id=${job.id}\n` +
      `http_status=${run.http_status ?? "none"} latency_ms=${run.latency_ms ?? "none"}\n` +
      `${run.error_text ?? "no error text"}`;
    // Core façade (not runNotifySlack) avoids nested runAutomationEffect.
    await executeNotifySlackCore({ channel, text });
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
  const changeState = getJobChangeState(db, job.id);
  const outcome = await runSyntheticCheck(synthetic, {
    etag: changeState.last_etag,
    last_modified: changeState.last_modified,
  });
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

    if (outcome.http_status === 429 && outcome.retry_after_ms) {
      const until = new Date(Date.now() + outcome.retry_after_ms).toISOString();
      setJobChangeState(db, job.id, { backoff_until: until });
    } else if (outcome.http_status !== 429 && changeState.backoff_until) {
      setJobChangeState(db, job.id, { backoff_until: null });
    }

    const authFail =
      outcome.http_status === 401 || outcome.http_status === 403;
    if (authFail) {
      const failures = changeState.auth_failure_count + 1;
      const threshold = getAuthFailureThreshold();
      const patch: Partial<JobChangeState> = { auth_failure_count: failures };
      if (failures >= threshold) {
        patch.poll_pause_reason = "upstream_auth";
        surfaceScheduleAuthPause(job.id, synthetic.name, failures);
      }
      setJobChangeState(db, job.id, patch);
    } else if (
      outcome.http_status != null &&
      outcome.http_status !== 429 &&
      (changeState.auth_failure_count > 0 || changeState.poll_pause_reason)
    ) {
      setJobChangeState(db, job.id, {
        auth_failure_count: 0,
        poll_pause_reason: null,
      });
    }

    if (outcome.http_status === 429 || authFail) {
      /* do not advance projection baseline on throttle/auth failures */
    } else if (outcome.not_modified) {
      setJobChangeState(db, job.id, {
        last_etag: outcome.etag ?? changeState.last_etag,
        last_modified: outcome.last_modified ?? changeState.last_modified,
      });
    } else if (outcome.response_excerpt != null) {
      const previousProjectionJson = loadStoredProjectionJson(
        changeState.last_projection_json
      );
      const detection = detectProjectedChange({
        previousHash: changeState.last_body_hash,
        previousProjectionJson,
        responseBody: outcome.response_excerpt,
        config: synthetic.change_detection,
        notModified: false,
      });
      const storedProjection = await prepareProjectionForStore(detection.projection);
      setJobChangeState(db, job.id, {
        last_body_hash: detection.hash,
        last_projection_json: storedProjection,
        last_etag: outcome.etag ?? changeState.last_etag,
        last_modified: outcome.last_modified ?? changeState.last_modified,
      });
      if (detection.changed && detection.diff) {
        try {
          const { emitStreamChanged } = await import("clawql-mcp-events");
          const watch = synthetic.change_detection?.watch_fields;
          emitStreamChanged({
            topic: job.id,
            summary: `Synthetic topic ${synthetic.name}: ${summarizeDiff(detection.diff)}`,
            cursor: detection.hash,
            diff: detection.diff,
            ...(watch?.length ? { watch_fields: watch } : {}),
            projection_tool: "schedule",
          });
        } catch {
          /* mcp-events optional */
        }
      }
    } else if (outcome.etag || outcome.last_modified) {
      setJobChangeState(db, job.id, {
        last_etag: outcome.etag ?? changeState.last_etag,
        last_modified: outcome.last_modified ?? changeState.last_modified,
      });
    }
  }
  try {
    const { emitScheduleCompleted } = await import("clawql-mcp-events");
    emitScheduleCompleted({
      schedule_id: job.id,
      status: outcome.status,
      summary: outcome.ok
        ? outcome.not_modified
          ? `schedule job ${job.id} not modified (304)`
          : `schedule job ${job.id} ok (${outcome.latency_ms ?? 0}ms)`
        : (outcome.error_text ?? `schedule job ${job.id} ${outcome.status}`),
    });
  } catch {
    /* mcp-events optional */
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
    try {
      const { McpEventsService, McpEventsServiceLive } = await import("clawql-mcp-events");
      const { Effect } = await import("effect");
      await Effect.runPromise(
        Effect.gen(function* () {
          const svc = yield* McpEventsService;
          return yield* svc.flushCoalesced();
        }).pipe(Effect.provide(McpEventsServiceLive))
      );
    } catch {
      /* mcp-events optional */
    }
    return fired;
  } finally {
    db.close();
  }
}

export function startScheduleWorker(): void {
  if (scheduleWorkerStop) return;
  const pollMs = getSchedulePollMs();
  const handle = Effect.runSync(
    startScheduleWorkerFiberEffect(() => runScheduleWorkerTick(), pollMs)
  );
  scheduleWorkerStop = handle.stop;
}

export function stopScheduleWorker(): void {
  if (!scheduleWorkerStop) return;
  scheduleWorkerStop();
  scheduleWorkerStop = null;
}

export function registerScheduleWorkerShutdownHooks(): void {
  const shutdown = () => stopScheduleWorker();
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
  process.once("exit", shutdown);
}

export async function dispatchScheduleOperation(
  db: Database,
  absDbPath: string,
  parsed: ScheduleParsedInput
): Promise<{ content: { type: "text"; text: string }[] }> {
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
      const change = getJobChangeState(db, job.id);
      const last_projection = loadStoredProjection(change.last_projection_json);
      return jsonResponse({
        ok: true,
        operation: "get",
        job: {
          ...job,
          schedule: { frequency: job.frequency },
          change_detection_state: {
            last_hash: change.last_body_hash,
            last_etag: change.last_etag,
            last_modified: change.last_modified,
            backoff_until: change.backoff_until,
            last_projection,
            projection_encrypted: isEncryptedProjectionBlob(change.last_projection_json),
            auth_failure_count: change.auth_failure_count,
            poll_pause_reason: change.poll_pause_reason,
          },
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
}

/**
 * Promise façade over {@link executeScheduleToolCoreEffect}.
 */
export async function executeScheduleToolCore(
  params: unknown
): Promise<{ content: { type: "text"; text: string }[] }> {
  const { executeScheduleToolCoreEffect } = await import("../effect/schedule-effect.js");
  const { Effect } = await import("effect");
  return Effect.runPromise(executeScheduleToolCoreEffect(params));
}

/** Public async facade for schedule MCP tool. */
export async function handleScheduleToolInput(
  params: unknown
): Promise<{ content: { type: "text"; text: string }[] }> {
  const { runAutomationEffect, automationScheduleProgram } =
    await import("../effect/automation-effect-runtime.js");
  return runAutomationEffect(automationScheduleProgram(params));
}

/** Test helper. */
export function resetScheduleSqlJsForTests(): void {
  sqlJsPromise = null;
  stopScheduleWorker();
  cronMinuteRunCache.clear();
}

export const __scheduleTestUtils = {
  cronMatchesUtc,
  shouldRunJobNow,
};
