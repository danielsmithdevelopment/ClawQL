/**
 * Child process for the durable-runner SIGKILL test (run with `--import tsx`).
 *
 * Runs a sequential plan on a file journal and SIGKILLs itself inside the host call
 * for `KILL_AT_OPERATION`, after the calls before it are journaled. Every host call
 * is logged to `HOST_LOG` first, so the parent can count calls across processes.
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
const writes = new Set((process.env.WRITE_OPERATIONS ?? "").split(",").filter(Boolean));

const host: ProgramHost = {
  execute: (input) =>
    Effect.sync(() => {
      appendFileSync(hostLog, `${input.operationId}\n`);
      if (input.operationId === killAt) process.kill(process.pid, "SIGKILL");
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
