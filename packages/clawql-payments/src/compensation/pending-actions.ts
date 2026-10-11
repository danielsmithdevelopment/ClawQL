/**
 * File-backed PENDING_ACTIONS — DAOS two-phase commit staging until PEP/NATS KV ships.
 *
 * Mirrors docs/ouroboros/daos-coordination-layer-specification.md:
 * stage (inert) → approve view (GET-safe) → confirm (POST / execute) → cancel (GET-safe).
 */

import { mkdir, readFile, readdir, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import { Context, Data, Effect, Layer } from "effect";
import { resolvePendingActionsDir } from "../config/paths.js";
import { compensationActionTtlSec, compensationApprovalBaseUrl } from "./config.js";
import type { HighImpactClassification } from "./high-impact.js";

export type PendingActionStatus = "pending" | "executed" | "cancelled" | "expired";

export type CompensationPendingKind =
  | "deposit_credits"
  | "deposit_funds"
  | "cashout"
  /** Prepaid credit P2P transfer (CreditsService). */
  | "credits_transfer";

export type PendingActionRecord = {
  readonly actionId: string;
  readonly confirmationCode: string;
  readonly tool: string;
  readonly kind: CompensationPendingKind;
  readonly classification: HighImpactClassification;
  readonly args: Record<string, unknown>;
  /** Subject of the action (agent id, or sender tenant for credits_transfer). */
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

/** @deprecated Prefer PendingActionsService.stage — Promise façade retained for legacy callers. */
async function stagePendingActionImpl(
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

export function stagePendingActionEffect(
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
): Effect.Effect<PendingActionRecord, Error> {
  return Effect.tryPromise({
    try: () => stagePendingActionImpl(input, env),
    catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
  });
}

/** Promise façade — prefer {@link stagePendingActionEffect} for Effect callers. */
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
  return Effect.runPromise(stagePendingActionEffect(input, env));
}

/** @deprecated Prefer PendingActionsService.load — Promise façade retained for legacy callers. */
async function loadPendingActionImpl(
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

export function loadPendingActionEffect(
  actionId: string,
  env: NodeJS.ProcessEnv = process.env
): Effect.Effect<PendingActionRecord | undefined, Error> {
  return Effect.tryPromise({
    try: () => loadPendingActionImpl(actionId, env),
    catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
  });
}

/** Promise façade — prefer {@link loadPendingActionEffect} for Effect callers. */
export async function loadPendingAction(
  actionId: string,
  env: NodeJS.ProcessEnv = process.env
): Promise<PendingActionRecord | undefined> {
  return Effect.runPromise(loadPendingActionEffect(actionId, env));
}

/** @deprecated Prefer PendingActionsService.save — Promise façade retained for legacy callers. */
async function savePendingActionImpl(
  record: PendingActionRecord,
  env: NodeJS.ProcessEnv = process.env
): Promise<void> {
  await mkdir(resolvePendingActionsDir(env), { recursive: true });
  await writeFile(actionPath(record.actionId, env), `${JSON.stringify(record, null, 2)}\n`, {
    mode: 0o600,
  });
}

export function savePendingActionEffect(
  record: PendingActionRecord,
  env: NodeJS.ProcessEnv = process.env
): Effect.Effect<void, Error> {
  return Effect.tryPromise({
    try: () => savePendingActionImpl(record, env),
    catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
  });
}

/** Promise façade — prefer {@link savePendingActionEffect} for Effect callers. */
export async function savePendingAction(
  record: PendingActionRecord,
  env: NodeJS.ProcessEnv = process.env
): Promise<void> {
  return Effect.runPromise(savePendingActionEffect(record, env));
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

/** @deprecated Prefer PendingActionsService.assertCode — Promise façade retained for legacy callers. */
async function assertPendingCodeImpl(
  actionId: string,
  code: string,
  env: NodeJS.ProcessEnv = process.env
): Promise<PendingActionRecord> {
  const loaded = await loadPendingAction(actionId, env);
  if (!loaded) throw new Error(`Unknown pending action: ${actionId}`);
  const record = materializeExpiry(loaded);
  if (record.status === "expired" && loaded.status === "pending") {
    await savePendingAction(record, env);
  }
  if (record.confirmationCode !== code.trim()) {
    throw new Error("Invalid confirmation code");
  }
  return record;
}

export function assertPendingCodeEffect(
  actionId: string,
  code: string,
  env: NodeJS.ProcessEnv = process.env
): Effect.Effect<PendingActionRecord, Error> {
  return Effect.tryPromise({
    try: () => assertPendingCodeImpl(actionId, code, env),
    catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
  });
}

/** Promise façade — prefer {@link assertPendingCodeEffect} for Effect callers. */
export async function assertPendingCode(
  actionId: string,
  code: string,
  env: NodeJS.ProcessEnv = process.env
): Promise<PendingActionRecord> {
  return Effect.runPromise(assertPendingCodeEffect(actionId, code, env));
}

/** @deprecated Prefer PendingActionsService.list — Promise façade retained for legacy callers. */
async function listPendingActionsImpl(
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

export function listPendingActionsEffect(
  env: NodeJS.ProcessEnv = process.env,
  filter?: {
    agentId?: string;
    status?: PendingActionStatus;
    recruitmentId?: string;
    reason?: string;
    kindPrefix?: "deposit" | "cashout";
  }
): Effect.Effect<PendingActionRecord[], Error> {
  return Effect.tryPromise({
    try: () => listPendingActionsImpl(env, filter),
    catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
  });
}

/** Promise façade — prefer {@link listPendingActionsEffect} for Effect callers. */
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
  return Effect.runPromise(listPendingActionsEffect(env, filter));
}

/**
 * Idempotency key for SGDOP / dividend deposits: recruitmentId + agentId + reason.
 * Returns the newest matching deposit that is still pending or already executed.
 *
 * @deprecated Prefer PendingActionsService.findRecruitDeposit — Promise façade retained for legacy callers.
 */
async function findRecruitDepositByKeyImpl(
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

export function findRecruitDepositByKeyEffect(
  input: {
    recruitmentId: string;
    agentId: string;
    reason: string;
  },
  env: NodeJS.ProcessEnv = process.env
): Effect.Effect<PendingActionRecord | undefined, Error> {
  return Effect.tryPromise({
    try: () => findRecruitDepositByKeyImpl(input, env),
    catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
  });
}

/** Promise façade — prefer {@link findRecruitDepositByKeyEffect} for Effect callers. */
export async function findRecruitDepositByKey(
  input: {
    recruitmentId: string;
    agentId: string;
    reason: string;
  },
  env: NodeJS.ProcessEnv = process.env
): Promise<PendingActionRecord | undefined> {
  return Effect.runPromise(findRecruitDepositByKeyEffect(input, env));
}

/** @deprecated Prefer PendingActionsService.delete — Promise façade retained for legacy callers. */
async function deletePendingActionImpl(
  actionId: string,
  env: NodeJS.ProcessEnv = process.env
): Promise<void> {
  try {
    await unlink(actionPath(actionId, env));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
}

export function deletePendingActionEffect(
  actionId: string,
  env: NodeJS.ProcessEnv = process.env
): Effect.Effect<void, Error> {
  return Effect.tryPromise({
    try: () => deletePendingActionImpl(actionId, env),
    catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
  });
}

/** Promise façade — prefer {@link deletePendingActionEffect} for Effect callers. */
export async function deletePendingAction(
  actionId: string,
  env: NodeJS.ProcessEnv = process.env
): Promise<void> {
  return Effect.runPromise(deletePendingActionEffect(actionId, env));
}

export class PendingActionsError extends Data.TaggedError("PendingActionsError")<{
  readonly reason: string;
  readonly cause?: unknown;
}> {}

type StagePendingActionInput = Parameters<typeof stagePendingAction>[0];
type ListPendingActionsFilter = NonNullable<Parameters<typeof listPendingActions>[1]>;
type FindRecruitDepositInput = Parameters<typeof findRecruitDepositByKey>[0];

/** Effect surface over the file-backed PENDING_ACTIONS two-phase-commit staging store. */
export class PendingActionsService extends Context.Service<
  PendingActionsService,
  {
    readonly stage: (
      input: StagePendingActionInput
    ) => Effect.Effect<PendingActionRecord, PendingActionsError>;
    readonly load: (
      actionId: string
    ) => Effect.Effect<PendingActionRecord | undefined, PendingActionsError>;
    readonly save: (record: PendingActionRecord) => Effect.Effect<void, PendingActionsError>;
    readonly assertCode: (
      actionId: string,
      code: string
    ) => Effect.Effect<PendingActionRecord, PendingActionsError>;
    readonly list: (
      filter?: ListPendingActionsFilter
    ) => Effect.Effect<PendingActionRecord[], PendingActionsError>;
    readonly findRecruitDeposit: (
      input: FindRecruitDepositInput
    ) => Effect.Effect<PendingActionRecord | undefined, PendingActionsError>;
    readonly delete: (actionId: string) => Effect.Effect<void, PendingActionsError>;
  }
>()("clawql/PendingActionsService") {}

export function pendingActionsLiveLayer(
  env: NodeJS.ProcessEnv = process.env
): Layer.Layer<PendingActionsService> {
  const run = <A>(reason: string, task: () => Promise<A>) =>
    Effect.tryPromise({
      try: task,
      catch: (cause) =>
        cause instanceof PendingActionsError
          ? cause
          : new PendingActionsError({
              reason: cause instanceof Error ? cause.message : reason,
              cause,
            }),
    });

  return Layer.succeed(
    PendingActionsService,
    PendingActionsService.of({
      stage: (input) => run("Failed to stage pending action", () => stagePendingAction(input, env)),
      load: (actionId) =>
        run("Failed to load pending action", () => loadPendingAction(actionId, env)),
      save: (record) => run("Failed to save pending action", () => savePendingAction(record, env)),
      assertCode: (actionId, code) =>
        run("Failed to verify pending action code", () => assertPendingCode(actionId, code, env)),
      list: (filter) =>
        run("Failed to list pending actions", () => listPendingActions(env, filter)),
      findRecruitDeposit: (input) =>
        run("Failed to look up recruit deposit", () => findRecruitDepositByKey(input, env)),
      delete: (actionId) =>
        run("Failed to delete pending action", () => deletePendingAction(actionId, env)),
    })
  );
}
