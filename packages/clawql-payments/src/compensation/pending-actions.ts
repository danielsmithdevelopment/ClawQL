/**
 * File-backed PENDING_ACTIONS — DAOS two-phase commit staging until PEP/NATS KV ships.
 *
 * Mirrors docs/ouroboros/daos-coordination-layer-specification.md:
 * stage (inert) → approve view (GET-safe) → confirm (POST / execute) → cancel (GET-safe).
 */

import { mkdir, readFile, readdir, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import { resolvePendingActionsDir } from "../config/paths.js";
import { compensationActionTtlSec, compensationApprovalBaseUrl } from "./config.js";
import type { HighImpactClassification } from "./high-impact.js";

export type PendingActionStatus = "pending" | "executed" | "cancelled" | "expired";

export type CompensationPendingKind = "deposit_credits" | "deposit_funds" | "cashout";

export type PendingActionRecord = {
  readonly actionId: string;
  readonly confirmationCode: string;
  readonly tool: string;
  readonly kind: CompensationPendingKind;
  readonly classification: HighImpactClassification;
  readonly args: Record<string, unknown>;
  readonly agentId: string;
  readonly tenantId: string;
  readonly correlationId?: string;
  readonly createdAt: string;
  readonly expiresAt: string;
  status: PendingActionStatus;
  readonly executedAt?: string;
  readonly cancelledAt?: string;
  readonly result?: Record<string, unknown>;
};

function actionPath(actionId: string, env: NodeJS.ProcessEnv): string {
  return join(resolvePendingActionsDir(env), `${actionId}.json`);
}

function shortCode(): string {
  return randomBytes(3).toString("hex"); // 6 hex chars, human-readable
}

export function buildApprovalUrl(
  tool: string,
  actionId: string,
  code: string,
  env: NodeJS.ProcessEnv = process.env
): string {
  const base = compensationApprovalBaseUrl(env);
  return `${base}/${tool}/approve?action_id=${encodeURIComponent(actionId)}&code=${encodeURIComponent(code)}`;
}

export function buildConfirmUrl(
  tool: string,
  actionId: string,
  code: string,
  env: NodeJS.ProcessEnv = process.env
): string {
  const base = compensationApprovalBaseUrl(env);
  return `${base}/${tool}/confirm?action_id=${encodeURIComponent(actionId)}&code=${encodeURIComponent(code)}`;
}

export function buildCancelUrl(
  tool: string,
  actionId: string,
  code: string,
  env: NodeJS.ProcessEnv = process.env
): string {
  const base = compensationApprovalBaseUrl(env);
  return `${base}/${tool}/cancel?action_id=${encodeURIComponent(actionId)}&code=${encodeURIComponent(code)}`;
}

export async function stagePendingAction(
  input: {
    tool: string;
    kind: CompensationPendingKind;
    classification: HighImpactClassification;
    args: Record<string, unknown>;
    agentId: string;
    tenantId?: string;
    correlationId?: string;
  },
  env: NodeJS.ProcessEnv = process.env
): Promise<PendingActionRecord> {
  const dir = resolvePendingActionsDir(env);
  await mkdir(dir, { recursive: true });
  const actionId = randomUUID();
  const confirmationCode = shortCode();
  const now = Date.now();
  const ttlMs = compensationActionTtlSec(env) * 1000;
  const record: PendingActionRecord = {
    actionId,
    confirmationCode,
    tool: input.tool,
    kind: input.kind,
    classification: input.classification,
    args: input.args,
    agentId: input.agentId.trim(),
    tenantId: input.tenantId?.trim() || "default",
    correlationId: input.correlationId,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + ttlMs).toISOString(),
    status: "pending",
  };
  await writeFile(actionPath(actionId, env), `${JSON.stringify(record, null, 2)}\n`, {
    mode: 0o600,
  });
  return record;
}

export async function loadPendingAction(
  actionId: string,
  env: NodeJS.ProcessEnv = process.env
): Promise<PendingActionRecord | undefined> {
  try {
    const raw = await readFile(actionPath(actionId.trim(), env), "utf8");
    return JSON.parse(raw) as PendingActionRecord;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw err;
  }
}

export async function savePendingAction(
  record: PendingActionRecord,
  env: NodeJS.ProcessEnv = process.env
): Promise<void> {
  await mkdir(resolvePendingActionsDir(env), { recursive: true });
  await writeFile(actionPath(record.actionId, env), `${JSON.stringify(record, null, 2)}\n`, {
    mode: 0o600,
  });
}

/** Mark expired in-place when past TTL and still pending. */
export function materializeExpiry(
  record: PendingActionRecord,
  nowMs: number = Date.now()
): PendingActionRecord {
  if (record.status === "pending" && new Date(record.expiresAt).getTime() <= nowMs) {
    return { ...record, status: "expired" };
  }
  return record;
}

export async function assertPendingCode(
  actionId: string,
  code: string,
  env: NodeJS.ProcessEnv = process.env
): Promise<PendingActionRecord> {
  const loaded = await loadPendingAction(actionId, env);
  if (!loaded) throw new Error(`Unknown pending action: ${actionId}`);
  let record = materializeExpiry(loaded);
  if (record.status === "expired" && loaded.status === "pending") {
    await savePendingAction(record, env);
  }
  if (record.confirmationCode !== code.trim()) {
    throw new Error("Invalid confirmation code");
  }
  return record;
}

export async function listPendingActions(
  env: NodeJS.ProcessEnv = process.env,
  filter?: {
    agentId?: string;
    status?: PendingActionStatus;
    recruitmentId?: string;
    reason?: string;
    kindPrefix?: "deposit" | "cashout";
  }
): Promise<PendingActionRecord[]> {
  const dir = resolvePendingActionsDir(env);
  let names: string[];
  try {
    names = await readdir(dir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
  const out: PendingActionRecord[] = [];
  for (const name of names) {
    if (!name.endsWith(".json")) continue;
    const id = name.slice(0, -".json".length);
    const loaded = await loadPendingAction(id, env);
    if (!loaded) continue;
    const record = materializeExpiry(loaded);
    if (record.status === "expired" && loaded.status === "pending") {
      await savePendingAction(record, env);
    }
    if (filter?.agentId && record.agentId !== filter.agentId) continue;
    if (filter?.status && record.status !== filter.status) continue;
    if (filter?.kindPrefix === "deposit" && !record.kind.startsWith("deposit_")) continue;
    if (filter?.kindPrefix === "cashout" && record.kind !== "cashout") continue;
    if (filter?.recruitmentId) {
      const rid = record.args.recruitmentId;
      if (typeof rid !== "string" || rid !== filter.recruitmentId) continue;
    }
    if (filter?.reason) {
      const reason = record.args.reason;
      if (typeof reason !== "string" || reason !== filter.reason) continue;
    }
    out.push(record);
  }
  return out.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/**
 * Idempotency key for SGDOP / dividend deposits: recruitmentId + agentId + reason.
 * Returns the newest matching deposit that is still pending or already executed.
 */
export async function findRecruitDepositByKey(
  input: {
    recruitmentId: string;
    agentId: string;
    reason: string;
  },
  env: NodeJS.ProcessEnv = process.env
): Promise<PendingActionRecord | undefined> {
  const rid = input.recruitmentId.trim();
  const agentId = input.agentId.trim();
  const reason = input.reason.trim();
  if (!rid || !agentId || !reason) return undefined;

  const matches = await listPendingActions(env, {
    agentId,
    recruitmentId: rid,
    reason,
    kindPrefix: "deposit",
  });
  // Prefer live pending; else most recent executed (blocks double-bounty).
  const pending = [...matches].reverse().find((r) => r.status === "pending");
  if (pending) return pending;
  return [...matches].reverse().find((r) => r.status === "executed");
}

export async function deletePendingAction(
  actionId: string,
  env: NodeJS.ProcessEnv = process.env
): Promise<void> {
  try {
    await unlink(actionPath(actionId, env));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
}
