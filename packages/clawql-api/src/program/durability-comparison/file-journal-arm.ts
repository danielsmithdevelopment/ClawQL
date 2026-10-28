/**
 * ClawQL file-journal kill-mid-write arms:
 * - clawql-file-journal: structural at-most-once (never re-send after unknown)
 * - clawql-always-retry: agent always retries after resume; gate refuses (mandate consumed)
 * - clawql-check-then-decide: non_idempotent + lookup-by-reference → reconcile found charges
 * - naive-retry: reference arm that re-sends blindly
 */

import { fork } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Effect } from "effect";
import { resumeProgramEffect } from "../durable-runner.js";
import { programJournalFileLayer } from "../program-journal.js";
import type { ProgramHost } from "../program-runner.js";
import { apiCapabilityFor, classifyOutcome, summarizeMode } from "./metrics.js";
import type {
  AgentPolicy,
  ArmModeResult,
  ArmResult,
  ComparisonTrial,
  DurabilityArm,
  UpstreamMode,
} from "./types.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const KILL_WORKER = join(HERE, "..", "durable-runner-kill-worker.ts");
const WRITE_OPS = ["pets.get", "pets.list", "owners.create"] as const;
const WRITE_OP = "owners.create";
const CLIENT_REFERENCE = "kill-mid-write-ref";

function planSource(opts: { readonly withClientReference: boolean }): string {
  return JSON.stringify({
    v: 1,
    mode: "sequential",
    calls: WRITE_OPS.map((operationId, i) => ({
      tool: "execute",
      operationId,
      args: {
        page: i + 1,
        idempotencyKey: "kill-mid-write-key",
        ...(opts.withClientReference && operationId === WRITE_OP
          ? { clientReference: CLIENT_REFERENCE }
          : {}),
      },
    })),
  });
}

type HostLogLine = {
  readonly operationId: string;
  readonly effectId: string;
  readonly applied: boolean;
  readonly reference?: string;
};

function parseHostLog(raw: string): HostLogLine[] {
  return raw
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      try {
        const o = JSON.parse(line) as HostLogLine;
        if (o && typeof o.operationId === "string") return o;
      } catch {
        /* legacy: bare operationId */
      }
      return { operationId: line.trim(), effectId: line.trim(), applied: true };
    });
}

function recordingHost(opts: {
  readonly upstreamMode: UpstreamMode;
  readonly priorEffects: Set<string>;
  /** References that already landed (from kill-worker host log). */
  readonly priorByReference?: ReadonlyMap<string, string>;
  /** When true, further WRITE_OP executes are refused without applying (mandate consumed). */
  readonly refuseWrites?: boolean;
  /** Advertise + implement check-then-decide lookup. */
  readonly lookupByReference?: boolean;
  /**
   * When true, not_found is treated as definitive (original can no longer land).
   * Default false — early not_found must stay unknown (race-safe).
   */
  readonly notFoundDefinitive?: boolean;
}): {
  host: ProgramHost;
  executedWrites: string[];
  uniqueEffects: Set<string>;
  getRefusedWrites: () => number;
} {
  const executedWrites: string[] = [];
  const uniqueEffects = new Set(opts.priorEffects);
  const priorByReference = new Map(opts.priorByReference ?? []);
  let onceCounter = priorEffectsSize(opts.priorEffects);
  let refusedWrites = 0;
  const host: ProgramHost = {
    execute: (input) =>
      Effect.sync(() => {
        if (input.operationId === WRITE_OP) {
          if (opts.refuseWrites) {
            refusedWrites += 1;
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify({ ok: false, status: "mandate_consumed" }),
                },
              ],
            };
          }
          executedWrites.push(input.operationId);
          const key =
            typeof input.args?.idempotencyKey === "string"
              ? input.args.idempotencyKey
              : typeof input.args?.clientReference === "string"
                ? input.args.clientReference
                : `anon-${executedWrites.length}`;
          if (opts.upstreamMode === "idempotent") {
            const effectId = `idem:${key}`;
            if (uniqueEffects.has(effectId)) {
              return {
                content: [
                  { type: "text" as const, text: JSON.stringify({ ok: true, deduped: true }) },
                ],
              };
            }
            uniqueEffects.add(effectId);
            priorByReference.set(key, effectId);
          } else {
            onceCounter += 1;
            const effectId = `once:${onceCounter}`;
            uniqueEffects.add(effectId);
            priorByReference.set(key, effectId);
          }
        }
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ ok: true, operationId: input.operationId }),
            },
          ],
        };
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
          reason: "durability-comparison",
        },
        operation: {
          method: operationId === WRITE_OP ? "POST" : "GET",
          specLabel: "pets",
        },
        idempotencyCapable: opts.upstreamMode === "idempotent" && operationId === WRITE_OP,
        lookupByReferenceCapable:
          opts.lookupByReference === true &&
          opts.upstreamMode === "non_idempotent" &&
          operationId === WRITE_OP,
      }),
    verifyByReference:
      opts.lookupByReference === true
        ? (input) =>
            Effect.sync(() => {
              const effectId = priorByReference.get(input.reference);
              if (effectId) {
                return {
                  status: "found" as const,
                  preview: JSON.stringify({ ok: true, effectId, reference: input.reference }),
                };
              }
              // Race-safe default: not_found is non-definitive unless the board
              // names a server guarantee (never a client-side timeout alone).
              if (opts.notFoundDefinitive === true) {
                return {
                  status: "not_found" as const,
                  definitive: true as const,
                  reason: "lookup_covers_prior_accepts" as const,
                };
              }
              return { status: "not_found" as const, definitive: false as const };
            })
        : undefined,
  };
  return { host, executedWrites, uniqueEffects, getRefusedWrites: () => refusedWrites };
}

function priorEffectsSize(prior: Set<string>): number {
  let n = 0;
  for (const e of prior) {
    if (e.startsWith("once:")) n += 1;
  }
  return n;
}

function runKillWorker(env: Readonly<Record<string, string>>): Promise<{
  code: number | null;
  signal: NodeJS.Signals | null;
  stderr: string;
}> {
  return new Promise((resolve, reject) => {
    const child = fork(KILL_WORKER, [], {
      execArgv: ["--import", "tsx"],
      env: { ...process.env, ...env },
      stdio: ["ignore", "ignore", "pipe", "ipc"],
    });
    let stderr = "";
    child.stderr?.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", reject);
    child.on("exit", (code, signal) => resolve({ code, signal, stderr }));
  });
}

type ResumePolicy = "clawql" | "clawql-always-retry" | "clawql-check-then-decide" | "naive-retry";

async function oneTrial(input: {
  readonly i: number;
  readonly upstreamMode: UpstreamMode;
  readonly resumePolicy: ResumePolicy;
}): Promise<ComparisonTrial> {
  const lookup = input.resumePolicy === "clawql-check-then-decide";
  const dir = await mkdtemp(join(tmpdir(), `clawql-cmp-${input.i}-`));
  const hostLog = join(dir, "host.log");
  const programId = `prog_cmp_${input.resumePolicy}_${String(input.i).padStart(4, "0")}`;
  const sessionId = `cmp-${input.resumePolicy}-${input.i}`;
  try {
    const child = await runKillWorker({
      JOURNAL_DIR: dir,
      HOST_LOG: hostLog,
      PROGRAM_ID: programId,
      SESSION_ID: sessionId,
      SOURCE: planSource({ withClientReference: lookup }),
      KILL_AT_OPERATION: WRITE_OP,
      WRITE_OPERATIONS: WRITE_OP,
      UPSTREAM_MODE: input.upstreamMode,
      ...(lookup ? { LOOKUP_BY_REFERENCE: "1" } : {}),
    });
    const before = parseHostLog(await readFile(hostLog, "utf8"));
    const priorEffects = new Set(
      before.filter((l) => l.operationId === WRITE_OP && l.applied).map((l) => l.effectId)
    );
    const priorByReference = new Map<string, string>();
    for (const line of before) {
      if (line.operationId === WRITE_OP && line.applied && line.reference) {
        priorByReference.set(line.reference, line.effectId);
      }
    }
    // After kill, the write mandate is consumed. Keyed / lookup resume may still
    // reconcile through the durable runner; a fresh agent-initiated execute is refused.
    const parent = recordingHost({
      upstreamMode: input.upstreamMode,
      priorEffects,
      priorByReference,
      refuseWrites: false,
      lookupByReference: lookup,
    });

    const resumed = await Effect.runPromise(
      resumeProgramEffect(programId, parent.host, {}, { sessionId }).pipe(
        Effect.provide(programJournalFileLayer(dir))
      )
    );

    let refusedWrites = 0;
    if (input.resumePolicy === "naive-retry") {
      await Effect.runPromise(
        parent.host.execute({
          operationId: WRITE_OP,
          args: { page: 3, idempotencyKey: "kill-mid-write-key" },
        })
      );
    } else if (input.resumePolicy === "clawql-always-retry") {
      // Model always retries: attempt a fresh execute; structural gate refuses.
      const gated = recordingHost({
        upstreamMode: input.upstreamMode,
        priorEffects: parent.uniqueEffects,
        refuseWrites: true,
      });
      await Effect.runPromise(
        gated.host.execute({
          operationId: WRITE_OP,
          args: { page: 3, idempotencyKey: "kill-mid-write-key" },
        })
      );
      refusedWrites = gated.getRefusedWrites();
      for (const e of gated.uniqueEffects) parent.uniqueEffects.add(e);
    }

    const uniqueWriteEffects = [...parent.uniqueEffects].filter(
      (e) => e.startsWith("idem:") || e.startsWith("once:")
    ).length;
    const writeAppliedBefore = before.some((l) => l.operationId === WRITE_OP && l.applied);
    const duplicates = Math.max(0, uniqueWriteEffects - (writeAppliedBefore ? 1 : 0));
    const outcomeUnknownCalls = resumed.calls.filter((c) => c.status === "outcome_unknown").length;
    const reconciledCalls = resumed.calls.filter((c) => c.status === "reconciled").length;
    const lost = !writeAppliedBefore && duplicates === 0 ? 1 : 0;

    const resolvedKnown =
      outcomeUnknownCalls === 0 &&
      uniqueWriteEffects === 1 &&
      duplicates === 0 &&
      (input.upstreamMode === "idempotent" ||
        (lookup && reconciledCalls >= 1 && resumed.ok === true));

    const interruptedOrUnknown = outcomeUnknownCalls > 0;
    const completedKnownSuccess = resolvedKnown;

    const classified = classifyOutcome({
      uniqueWriteEffects,
      duplicates,
      interruptedOrUnknown,
      completedKnownSuccess,
    });

    const ok =
      input.resumePolicy === "naive-retry"
        ? child.signal === "SIGKILL" && writeAppliedBefore && parent.executedWrites.length >= 1
        : input.resumePolicy === "clawql-always-retry"
          ? child.signal === "SIGKILL" &&
            writeAppliedBefore &&
            duplicates === 0 &&
            refusedWrites >= 1 &&
            (input.upstreamMode === "idempotent"
              ? classified.interruptedOrUnknown === 0 && classified.completedExactlyOnce === 1
              : classified.interruptedOrUnknown >= 1)
          : input.resumePolicy === "clawql-check-then-decide"
            ? child.signal === "SIGKILL" &&
              writeAppliedBefore &&
              duplicates === 0 &&
              classified.interruptedOrUnknown === 0 &&
              classified.completedExactlyOnce === 1 &&
              reconciledCalls >= 1
            : input.upstreamMode === "idempotent"
              ? child.signal === "SIGKILL" &&
                writeAppliedBefore &&
                duplicates === 0 &&
                classified.interruptedOrUnknown === 0 &&
                uniqueWriteEffects === 1
              : child.signal === "SIGKILL" &&
                writeAppliedBefore &&
                duplicates === 0 &&
                classified.interruptedOrUnknown >= 1 &&
                resumed.ok === false;

    return {
      i: input.i,
      ok,
      ...classified,
      lost,
      uniqueWriteEffects,
      childSignal: child.signal,
      detail: ok
        ? `${input.resumePolicy}/${input.upstreamMode}: dup=${classified.duplicates} unk=${classified.interruptedOrUnknown} once=${classified.completedExactlyOnce} effects=${uniqueWriteEffects} reconciled=${reconciledCalls} refused=${refusedWrites}`
        : `fail signal=${child.signal} dup=${classified.duplicates} unk=${classified.interruptedOrUnknown} reconciled=${reconciledCalls} stderr=${child.stderr.slice(0, 80)}`,
    };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

function makeFileJournalArm(resumePolicy: ResumePolicy): DurabilityArm {
  const id =
    resumePolicy === "clawql"
      ? ("clawql-file-journal" as const)
      : resumePolicy === "clawql-always-retry"
        ? ("clawql-always-retry" as const)
        : resumePolicy === "clawql-check-then-decide"
          ? ("clawql-check-then-decide" as const)
          : ("naive-retry" as const);
  const agentPolicy: AgentPolicy =
    resumePolicy === "clawql" || resumePolicy === "clawql-check-then-decide"
      ? "structural"
      : "always-retry";
  return {
    id,
    run: ({ n }) =>
      Effect.tryPromise({
        try: async (): Promise<ArmResult> => {
          const modes: ArmModeResult[] = [];
          const upstreamModes: UpstreamMode[] =
            resumePolicy === "clawql-check-then-decide"
              ? ["non_idempotent"]
              : ["idempotent", "non_idempotent"];
          for (const upstreamMode of upstreamModes) {
            const trials: ComparisonTrial[] = [];
            for (let i = 0; i < n; i++) {
              trials.push(await oneTrial({ i, upstreamMode, resumePolicy }));
            }
            modes.push(
              summarizeMode(upstreamMode, trials, {
                requireZeroDuplicates:
                  resumePolicy === "clawql" ||
                  resumePolicy === "clawql-always-retry" ||
                  resumePolicy === "clawql-check-then-decide",
                apiCapability: apiCapabilityFor({
                  upstreamMode,
                  lookupByReference: resumePolicy === "clawql-check-then-decide",
                }),
              })
            );
          }
          if (resumePolicy === "clawql") {
            return {
              armId: id,
              status: "measured",
              agentPolicy,
              peerFraming: "clawql_structural",
              honesty:
                "ClawQL structural (crash during outside write). API types: idempotency_keys → 0/0/N via keyed resume; neither (no keys, no lookup) → 0/N/0 — the honest floor. Agent policy does not matter for re-send — the gate already consumed the approval.",
              modes,
            };
          }
          if (resumePolicy === "clawql-always-retry") {
            return {
              armId: id,
              status: "measured",
              agentPolicy,
              peerFraming: "clawql_structural",
              honesty:
                "ClawQL + model always retries: after resume the agent re-issues execute; structural gate refuses (mandate_consumed). On API type neither: expect 0/N/0 — safe but unfinished until check-then-decide or keys.",
              modes,
            };
          }
          if (resumePolicy === "clawql-check-then-decide") {
            return {
              armId: id,
              status: "measured",
              agentPolicy,
              peerFraming: "clawql_structural",
              honesty:
                "ClawQL check-then-decide (API type lookup_by_reference): after crash, exact match on clientReference finds the charge → 0/0/N. Peers out of the box have no equivalent; a Golem developer could write the same reconciliation by hand — ask John what config they'd use. not_found is never treated as definitive while the original may still land (see clawql-check-then-decide-race).",
              modes,
            };
          }
          return {
            armId: id,
            status: "measured",
            agentPolicy,
            peerFraming: "clawql_structural",
            honesty:
              "Reference arm: forces write re-send after kill (no gate). Idempotent upstream can mask duplicates; neither multiplies effects. Not ClawQL product behavior.",
            modes,
          };
        },
        catch: (e) => (e instanceof Error ? e : new Error(String(e))),
      }).pipe(Effect.orDie),
  };
}

export const clawqlFileJournalArm = makeFileJournalArm("clawql");
export const clawqlAlwaysRetryArm = makeFileJournalArm("clawql-always-retry");
export const clawqlCheckThenDecideArm = makeFileJournalArm("clawql-check-then-decide");
export const naiveRetryArm = makeFileJournalArm("naive-retry");
