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
import { dirname } from "node:path";
import {
  PAYMENT_AUDIT_GENESIS_HASH,
  sealPaymentWormRecord,
  toPaymentWormEntry,
  verifyPaymentAuditChain,
  type PaymentAuditVerifyResult,
  type PaymentWormRecord,
} from "./chain.js";
import type { PaymentWormEntry } from "./events.js";
import { resolvePaymentAuditJsonlPath, resolvePaymentAuditMetaPath } from "../config/paths.js";
import type { PaymentAuditStore } from "./store.js";
import { isPaymentAuditFsyncEnabled } from "./store.js";

type PaymentAuditMeta = {
  seq: number;
  last_hash: string;
  updated_at: string;
};

function parseJsonlRecords(raw: string): PaymentWormRecord[] {
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as PaymentWormRecord);
}

function readMetaFile(metaPath: string): PaymentAuditMeta | null {
  try {
    return JSON.parse(readFileSync(metaPath, "utf8")) as PaymentAuditMeta;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

function writeMetaFile(metaPath: string, meta: PaymentAuditMeta, fsync: boolean): void {
  mkdirSync(dirname(metaPath), { recursive: true, mode: 0o700 });
  const tempPath = `${metaPath}.tmp`;
  writeFileSync(tempPath, `${JSON.stringify(meta, null, 2)}\n`, { mode: 0o600 });
  if (fsync) {
    const fd = openSync(tempPath, "r+");
    try {
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
  }
  renameSync(tempPath, metaPath);
}

function appendLineSync(filePath: string, line: string, fsync: boolean): void {
  mkdirSync(dirname(filePath), { recursive: true, mode: 0o700 });
  if (!existsSync(filePath)) {
    writeFileSync(filePath, "", { mode: 0o600 });
  }
  const fd = openSync(filePath, "a");
  try {
    writeSync(fd, line);
    if (fsync) {
      fsyncSync(fd);
    }
  } finally {
    closeSync(fd);
  }
}

function loadRecordsFromJsonl(jsonlPath: string): PaymentWormRecord[] {
  try {
    return parseJsonlRecords(readFileSync(jsonlPath, "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

function resolveChainHead(jsonlPath: string, metaPath: string): { seq: number; last_hash: string } {
  const meta = readMetaFile(metaPath);
  if (meta) {
    return { seq: meta.seq, last_hash: meta.last_hash };
  }

  const records = loadRecordsFromJsonl(jsonlPath);
  if (records.length === 0) {
    return { seq: 0, last_hash: PAYMENT_AUDIT_GENESIS_HASH };
  }
  const last = records[records.length - 1]!;
  return { seq: last.seq, last_hash: last.hash };
}

export class JsonlPaymentAuditStore implements PaymentAuditStore {
  private cache: PaymentWormRecord[] | null = null;

  constructor(
    private readonly jsonlPath: string,
    private readonly metaPath: string,
    private readonly fsync: boolean
  ) {}

  private loadRecords(): PaymentWormRecord[] {
    if (!this.cache) {
      this.cache = loadRecordsFromJsonl(this.jsonlPath);
    }
    return this.cache;
  }

  async append(entry: PaymentWormEntry): Promise<PaymentWormRecord> {
    const head = resolveChainHead(this.jsonlPath, this.metaPath);
    const record = sealPaymentWormRecord({
      entry,
      seq: head.seq + 1,
      prev_hash: head.last_hash,
    });

    appendLineSync(this.jsonlPath, `${JSON.stringify(record)}\n`, this.fsync);
    writeMetaFile(
      this.metaPath,
      {
        seq: record.seq,
        last_hash: record.hash,
        updated_at: new Date().toISOString(),
      },
      this.fsync
    );

    if (this.cache) {
      this.cache.push(record);
    } else {
      this.cache = loadRecordsFromJsonl(this.jsonlPath);
    }

    return record;
  }

  async list(limit = 100): Promise<PaymentWormEntry[]> {
    return (await this.listRecords(limit)).map(toPaymentWormEntry);
  }

  async listRecords(limit = 100): Promise<PaymentWormRecord[]> {
    const records = this.loadRecords();
    if (limit <= 0) return [];
    return records.slice(-limit);
  }

  async verify(): Promise<PaymentAuditVerifyResult> {
    return verifyPaymentAuditChain(this.loadRecords());
  }

  async reset(): Promise<void> {
    this.cache = [];
    try {
      writeFileSync(this.jsonlPath, "", { mode: 0o600 });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    try {
      writeFileSync(this.metaPath, "", { mode: 0o600 });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
}

export function createJsonlPaymentAuditStore(
  env: NodeJS.ProcessEnv = process.env
): JsonlPaymentAuditStore {
  return new JsonlPaymentAuditStore(
    resolvePaymentAuditJsonlPath(env),
    resolvePaymentAuditMetaPath(env),
    isPaymentAuditFsyncEnabled(env)
  );
}
