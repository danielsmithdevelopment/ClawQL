/**
 * Hash-chained WORM store for clawql-web audit events (compliance).
 * Mirrors the payments audit pattern at a smaller surface: memory | jsonl.
 */

import { createHash } from "node:crypto";
import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  writeFileSync,
  writeSync,
} from "node:fs";
import { dirname, join } from "node:path";
import type { WebAuditEvent } from "../audit-types.js";

export const WEB_AUDIT_GENESIS_HASH =
  "0000000000000000000000000000000000000000000000000000000000000000";

export type WebWormRecord = WebAuditEvent & {
  seq: number;
  prev_hash: string;
  hash: string;
  category: "web";
  action: string;
  summary: string;
};

export type WebAuditVerifyResult = {
  ok: boolean;
  records: number;
  head_hash: string;
  issues: { seq: number; reason: string }[];
};

function canonicalBytes(link: Omit<WebWormRecord, "hash">): Buffer {
  return Buffer.from(
    JSON.stringify({
      seq: link.seq,
      prev_hash: link.prev_hash,
      ts: link.ts,
      category: link.category,
      action: link.action,
      summary: link.summary,
      type: link.type,
      provider: link.provider ?? null,
      query: link.query ?? null,
      url: link.url ?? null,
      reason: link.reason ?? null,
      fallback: link.fallback ?? null,
      correlationId: link.correlationId ?? null,
      ok: link.ok ?? null,
      detail: link.detail ?? null,
    }),
    "utf8"
  );
}

export function hashWebAuditLink(link: Omit<WebWormRecord, "hash">): string {
  return createHash("sha256").update(canonicalBytes(link)).digest("hex");
}

export function sealWebWormRecord(input: {
  event: WebAuditEvent;
  seq: number;
  prev_hash: string;
}): WebWormRecord {
  const link: Omit<WebWormRecord, "hash"> = {
    ...input.event,
    seq: input.seq,
    prev_hash: input.prev_hash,
    category: "web",
    action: input.event.type,
    summary: [
      input.event.type,
      input.event.provider,
      input.event.query ?? input.event.url,
      input.event.reason,
    ]
      .filter(Boolean)
      .join(" · "),
  };
  return { ...link, hash: hashWebAuditLink(link) };
}

export function verifyWebAuditChain(records: WebWormRecord[]): WebAuditVerifyResult {
  const issues: { seq: number; reason: string }[] = [];
  let expectedSeq = 1;
  let prevHash = WEB_AUDIT_GENESIS_HASH;
  for (const record of records) {
    if (record.seq !== expectedSeq) {
      issues.push({ seq: record.seq, reason: `expected seq ${expectedSeq}, got ${record.seq}` });
    }
    if (record.prev_hash !== prevHash) {
      issues.push({ seq: record.seq, reason: `prev_hash mismatch at seq ${record.seq}` });
    }
    const recomputed = hashWebAuditLink(record);
    if (record.hash !== recomputed) {
      issues.push({ seq: record.seq, reason: `hash mismatch at seq ${record.seq}` });
    }
    expectedSeq = record.seq + 1;
    prevHash = record.hash;
  }
  return {
    ok: issues.length === 0,
    records: records.length,
    head_hash: records.length ? records[records.length - 1]!.hash : WEB_AUDIT_GENESIS_HASH,
    issues,
  };
}

export type WebWormStore = {
  append(event: WebAuditEvent): Promise<WebWormRecord>;
  list(limit?: number): Promise<WebWormRecord[]>;
  verify(): Promise<WebAuditVerifyResult>;
  reset(): Promise<void>;
};

export class MemoryWebWormStore implements WebWormStore {
  private records: WebWormRecord[] = [];

  async append(event: WebAuditEvent): Promise<WebWormRecord> {
    const prev_hash =
      this.records.length > 0
        ? this.records[this.records.length - 1]!.hash
        : WEB_AUDIT_GENESIS_HASH;
    const record = sealWebWormRecord({
      event,
      seq: this.records.length + 1,
      prev_hash,
    });
    this.records.push(record);
    return record;
  }

  async list(limit = 100): Promise<WebWormRecord[]> {
    if (limit <= 0) return [];
    return this.records.slice(-limit);
  }

  async verify(): Promise<WebAuditVerifyResult> {
    return verifyWebAuditChain(this.records);
  }

  async reset(): Promise<void> {
    this.records = [];
  }
}

function resolveWebAuditDir(env: NodeJS.ProcessEnv): string {
  const home = env.CLAWQL_HOME?.trim() || join(process.cwd(), ".clawql");
  return join(home, "Web");
}

function resolveWebAuditJsonlPath(env: NodeJS.ProcessEnv): string {
  return join(resolveWebAuditDir(env), "audit.jsonl");
}

function resolveWebAuditMetaPath(env: NodeJS.ProcessEnv): string {
  return join(resolveWebAuditDir(env), "audit.meta.json");
}

type Meta = { seq: number; last_hash: string; updated_at: string };

export class JsonlWebWormStore implements WebWormStore {
  constructor(private readonly env: NodeJS.ProcessEnv = process.env) {}

  private loadRecords(): WebWormRecord[] {
    const path = resolveWebAuditJsonlPath(this.env);
    if (!existsSync(path)) return [];
    return readFileSync(path, "utf8")
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => JSON.parse(l) as WebWormRecord);
  }

  private readMeta(): Meta | null {
    try {
      return JSON.parse(readFileSync(resolveWebAuditMetaPath(this.env), "utf8")) as Meta;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw err;
    }
  }

  async append(event: WebAuditEvent): Promise<WebWormRecord> {
    const jsonl = resolveWebAuditJsonlPath(this.env);
    const metaPath = resolveWebAuditMetaPath(this.env);
    mkdirSync(dirname(jsonl), { recursive: true, mode: 0o700 });
    const meta = this.readMeta();
    const prev_hash = meta?.last_hash ?? WEB_AUDIT_GENESIS_HASH;
    const seq = (meta?.seq ?? 0) + 1;
    const record = sealWebWormRecord({ event, seq, prev_hash });
    if (!existsSync(jsonl)) writeFileSync(jsonl, "", { mode: 0o600 });
    const fd = openSync(jsonl, "a");
    try {
      writeSync(fd, `${JSON.stringify(record)}\n`);
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    const nextMeta: Meta = {
      seq,
      last_hash: record.hash,
      updated_at: new Date().toISOString(),
    };
    const tmp = `${metaPath}.tmp`;
    writeFileSync(tmp, `${JSON.stringify(nextMeta, null, 2)}\n`, { mode: 0o600 });
    renameSync(tmp, metaPath);
    return record;
  }

  async list(limit = 100): Promise<WebWormRecord[]> {
    const records = this.loadRecords();
    if (limit <= 0) return [];
    return records.slice(-limit);
  }

  async verify(): Promise<WebAuditVerifyResult> {
    return verifyWebAuditChain(this.loadRecords());
  }

  async reset(): Promise<void> {
    const jsonl = resolveWebAuditJsonlPath(this.env);
    const meta = resolveWebAuditMetaPath(this.env);
    if (existsSync(jsonl)) writeFileSync(jsonl, "", { mode: 0o600 });
    if (existsSync(meta)) writeFileSync(meta, "", { mode: 0o600 });
  }
}

export type WebAuditStoreMode = "memory" | "jsonl" | "off";

export function resolveWebAuditStoreMode(env: NodeJS.ProcessEnv = process.env): WebAuditStoreMode {
  const raw = env.CLAWQL_WEB_AUDIT_STORE?.trim().toLowerCase();
  if (raw === "off" || raw === "0" || raw === "false") return "off";
  if (raw === "jsonl") return "jsonl";
  if (raw === "memory") return "memory";
  // Default: jsonl when CLAWQL_HOME is set (durable), else memory
  if (env.CLAWQL_HOME?.trim()) return "jsonl";
  return "memory";
}

let defaultStore: WebWormStore | null = null;
let defaultMode: WebAuditStoreMode | null = null;

export function getWebWormStore(env: NodeJS.ProcessEnv = process.env): WebWormStore | null {
  const mode = resolveWebAuditStoreMode(env);
  if (mode === "off") return null;
  if (!defaultStore || defaultMode !== mode) {
    defaultStore = mode === "jsonl" ? new JsonlWebWormStore(env) : new MemoryWebWormStore();
    defaultMode = mode;
  }
  return defaultStore;
}

export async function resetWebWormStoreForTests(env: NodeJS.ProcessEnv = process.env): Promise<void> {
  if (defaultStore) await defaultStore.reset();
  defaultStore = null;
  defaultMode = null;
  if (resolveWebAuditStoreMode(env) === "memory") {
    defaultStore = new MemoryWebWormStore();
    defaultMode = "memory";
  }
}

export async function appendWebWormEvent(
  event: WebAuditEvent,
  env: NodeJS.ProcessEnv = process.env
): Promise<WebWormRecord | null> {
  const store = getWebWormStore(env);
  if (!store) return null;
  return store.append(event);
}

export async function listWebWormRecords(
  limit = 100,
  env: NodeJS.ProcessEnv = process.env
): Promise<WebWormRecord[]> {
  const store = getWebWormStore(env);
  if (!store) return [];
  return store.list(limit);
}

export async function verifyWebWormLog(
  env: NodeJS.ProcessEnv = process.env
): Promise<WebAuditVerifyResult> {
  const store = getWebWormStore(env);
  if (!store) {
    return { ok: true, records: 0, head_hash: WEB_AUDIT_GENESIS_HASH, issues: [] };
  }
  return store.verify();
}
