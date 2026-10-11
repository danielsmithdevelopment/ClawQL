/**
 * Persist source proposals under $CLAWQL_HOME/pending-sources/.
 */

import { randomBytes } from "node:crypto";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Effect } from "effect";
import { resolveClawqlHome } from "../spec/custom-sources-store.js";
import type { PendingSourceRecord, PendingSourceStatus } from "./pending-source-types.js";

const FILE_MODE = 0o600;
const DIR_MODE = 0o700;
const ID_PREFIX = "psp_";

export function getPendingSourcesDir(home = resolveClawqlHome()): string {
  return join(home, "pending-sources");
}

export function assertSafeProposalId(id: string): string {
  const trimmed = id.trim();
  if (!trimmed.startsWith(ID_PREFIX)) {
    throw new Error(`Invalid proposalId: must start with ${ID_PREFIX}`);
  }
  if (!/^psp_[a-zA-Z0-9_-]{8,128}$/.test(trimmed)) {
    throw new Error("Invalid proposalId format");
  }
  return trimmed;
}

export const newProposalIdEffect = (): Effect.Effect<string> =>
  Effect.sync(() => `${ID_PREFIX}${randomBytes(16).toString("hex")}`);

function recordPath(proposalId: string, home: string): string {
  const id = assertSafeProposalId(proposalId);
  return join(getPendingSourcesDir(home), `${id}.json`);
}

function isRecord(v: unknown): v is PendingSourceRecord {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  const o = v as Record<string, unknown>;
  if (o.version !== 1 && o.version !== 2) return false;
  return (
    typeof o.proposalId === "string" &&
    o.entry !== null &&
    typeof o.entry === "object" &&
    o.riskSummary !== null &&
    typeof o.riskSummary === "object" &&
    Array.isArray(o.sampleOperations) &&
    typeof o.status === "string" &&
    typeof o.createdAt === "string" &&
    typeof o.expiresAt === "string"
  );
}

function normalizeRecord(raw: Record<string, unknown>): PendingSourceRecord {
  const proposedBy =
    typeof raw.proposedBy === "string" && raw.proposedBy.trim() ? raw.proposedBy : null;
  const approvedBy =
    typeof raw.approvedBy === "string" && raw.approvedBy.trim() ? raw.approvedBy : null;
  return {
    ...(raw as unknown as PendingSourceRecord),
    proposedBy,
    approvedBy,
  };
}

export const readPendingSourceEffect = (
  proposalId: string,
  home = resolveClawqlHome()
): Effect.Effect<PendingSourceRecord | null, Error> =>
  Effect.tryPromise({
    try: async () => {
      const path = recordPath(proposalId, home);
      try {
        const raw = JSON.parse(await readFile(path, "utf8")) as unknown;
        return isRecord(raw) ? normalizeRecord(raw as Record<string, unknown>) : null;
      } catch (e: unknown) {
        if ((e as NodeJS.ErrnoException)?.code === "ENOENT") return null;
        throw e;
      }
    },
    catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
  });

export const writePendingSourceEffect = (
  record: PendingSourceRecord,
  home = resolveClawqlHome()
): Effect.Effect<string, Error> =>
  Effect.tryPromise({
    try: async () => {
      const dir = getPendingSourcesDir(home);
      await mkdir(dir, { recursive: true, mode: DIR_MODE });
      const path = recordPath(record.proposalId, home);
      await writeFile(path, `${JSON.stringify(record, null, 2)}\n`, {
        encoding: "utf8",
        mode: FILE_MODE,
      });
      await chmod(path, FILE_MODE);
      return path;
    },
    catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
  });

export const updatePendingSourceStatusEffect = (
  proposalId: string,
  patch: {
    readonly status: PendingSourceStatus;
    readonly decidedAt?: string | null;
    readonly approvedBy?: string | null;
  },
  home = resolveClawqlHome()
): Effect.Effect<PendingSourceRecord, Error> =>
  Effect.gen(function* () {
    const existing = yield* readPendingSourceEffect(proposalId, home);
    if (!existing) {
      return yield* Effect.fail(new Error(`Unknown proposalId: ${proposalId}`));
    }
    const next: PendingSourceRecord = {
      ...existing,
      status: patch.status,
      decidedAt: patch.decidedAt !== undefined ? patch.decidedAt : existing.decidedAt,
      approvedBy: patch.approvedBy !== undefined ? patch.approvedBy : existing.approvedBy,
    };
    yield* writePendingSourceEffect(next, home);
    return next;
  });

export function pendingSourceTtlHoursEffect(
  env: NodeJS.ProcessEnv = process.env
): Effect.Effect<number> {
  return Effect.sync(() => {
    const raw = env.CLAWQL_PENDING_SOURCE_TTL_HOURS?.trim();
    if (!raw) return 72;
    const n = Number.parseInt(raw, 10);
    return Number.isFinite(n) && n > 0 ? n : 72;
  });
}
