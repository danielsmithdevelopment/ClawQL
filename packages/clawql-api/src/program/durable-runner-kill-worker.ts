/**
 * Child process for the durable-runner SIGKILL test (run with `--import tsx`).
 *
 * Runs a sequential plan on a file journal and SIGKILLs itself at `KILL_AT_OPERATION`
 * under `KILL_PHASE`:
 * - `after_log` (default): log host call, then SIGKILL — outside write in flight
 * - `before_log`: SIGKILL before host log — request never visible upstream
 *
 * Optional `UPSTREAM_MODE=idempotent|non_idempotent` controls effect-id logging
 * (JSON lines) for the durability comparison board.
 * Optional `LOOKUP_BY_REFERENCE=1` advertises lookupByReferenceCapable on writes.
 */

import { appendFileSync } from "node:fs";
import { Effect } from "effect";
import { runDurableProgramEffect } from "./durable-runner.js";
import { programJournalFileLayer } from "./program-journal.js";
import type { ProgramHost } from "./program-runner.js";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

const hostLog = required("HOST_LOG");
const killAt = required("KILL_AT_OPERATION");
const killPhaseRaw = (process.env.KILL_PHASE ?? "after_log").trim();
const killPhase = killPhaseRaw === "before_log" ? "before_log" : "after_log";
const writes = new Set((process.env.WRITE_OPERATIONS ?? "").split(",").filter(Boolean));
const upstreamMode = (process.env.UPSTREAM_MODE ?? "non_idempotent").trim();
const lookupByReference = process.env.LOOKUP_BY_REFERENCE === "1";
const seenIdem = new Set<string>();
let onceCounter = 0;

function clientReference(args: Record<string, unknown> | undefined): string | undefined {
  if (!args) return undefined;
  for (const key of ["clientReference", "chargeReference", "idempotencyKey"] as const) {
    const v = args[key];
    if (typeof v === "string" && v.length > 0) return v;
  }
  return undefined;
}

function logCall(operationId: string, args: Record<string, unknown> | undefined): void {
  const isWrite = writes.has(operationId);
  let effectId = operationId;
  let applied = true;
  const reference = clientReference(args);
  if (isWrite) {
    const key = reference ?? `anon-${onceCounter + 1}`;
    if (upstreamMode === "idempotent") {
      effectId = `idem:${key}`;
      if (seenIdem.has(effectId)) {
        applied = false;
      } else {
        seenIdem.add(effectId);
      }
    } else {
      onceCounter += 1;
      effectId = `once:${onceCounter}`;
    }
  }
  appendFileSync(
    hostLog,
    `${JSON.stringify({ operationId, effectId, applied, ...(reference ? { reference } : {}) })}\n`
  );
}

const host: ProgramHost = {
  execute: (input) =>
    Effect.sync(() => {
      if (input.operationId === killAt && killPhase === "before_log") {
        process.kill(process.pid, "SIGKILL");
      }
      logCall(input.operationId, input.args as Record<string, unknown> | undefined);
      if (input.operationId === killAt && killPhase === "after_log") {
        process.kill(process.pid, "SIGKILL");
      }
      const body = { ok: true, operationId: input.operationId, args: input.args };
      return { content: [{ type: "text" as const, text: JSON.stringify(body) }] };
    }),
  search: () => Effect.fail(new Error("search is not part of this plan")),
  resolveRisk: (operationId) =>
    Effect.succeed({
      found: true,
      policy: "allow" as const,
      risk: {
        policy: "allow" as const,
        level: "LOW" as const,
        source: "spec-default" as const,
        reason: "kill-test",
      },
      operation: { method: writes.has(operationId) ? "POST" : "GET", specLabel: "pets" },
      // Comparison board: idempotent → keyed resume; lookup flag → check-then-decide.
      idempotencyCapable: upstreamMode === "idempotent" && writes.has(operationId),
      lookupByReferenceCapable:
        lookupByReference && upstreamMode !== "idempotent" && writes.has(operationId),
    }),
};

const result = await Effect.runPromise(
  runDurableProgramEffect(
    {
      source: required("SOURCE"),
      programId: required("PROGRAM_ID"),
      sessionId: required("SESSION_ID"),
    },
    host,
    {}
  ).pipe(Effect.provide(programJournalFileLayer(required("JOURNAL_DIR"))))
);
process.send?.({ finished: true, ok: result.ok });
