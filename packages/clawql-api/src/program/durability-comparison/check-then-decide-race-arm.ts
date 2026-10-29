/**
 * Check-then-decide race probe.
 *
 * The mock shop accepts the charge into an in-flight queue and does not apply
 * until released. On resume, lookup returns not_found while the original may
 * still land (definitive=false). ClawQL must record outcome_unknown — never
 * safe-resend. After release, the original applies once → 0 duplicates.
 */

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Duration, Effect } from "effect";
import { resumeProgramEffect, runDurableProgramEffect } from "../durable-runner.js";
import { programJournalFileLayer } from "../program-journal.js";
import type { ProgramHost } from "../program-runner.js";
import { classifyOutcome, summarizeMode } from "./metrics.js";
import type {
  ArmModeResult,
  ArmResult,
  ComparisonTrial,
  DurabilityArm,
  TrialTraceEvent,
} from "./types.js";

const WRITE_OPS = ["pets.get", "pets.list", "owners.create"] as const;
const WRITE_OP = "owners.create";
const CLIENT_REFERENCE = "race-ref";

function planSource(): string {
  return JSON.stringify({
    v: 1,
    mode: "sequential",
    calls: WRITE_OPS.map((operationId, i) => ({
      tool: "execute",
      operationId,
      args: {
        page: i + 1,
        ...(operationId === WRITE_OP ? { clientReference: CLIENT_REFERENCE } : {}),
      },
    })),
  });
}

type PausedShop = {
  readonly host: ProgramHost;
  readonly effects: string[];
  readonly events: TrialTraceEvent[];
  release: () => void;
  getInflight: () => number;
};

function pausedShop(): PausedShop {
  const effects: string[] = [];
  const events: TrialTraceEvent[] = [];
  const inflight = new Set<string>();
  let releaseResolve: (() => void) | null = null;
  const releasePromise = new Promise<void>((resolve) => {
    releaseResolve = resolve;
  });

  const applyOnRelease = (reference: string): void => {
    // Apply is scheduled off the Effect fiber so timeout interrupt cannot cancel it.
    void releasePromise.then(() => {
      if (!inflight.has(reference)) return;
      inflight.delete(reference);
      const effectId = `once:${effects.length + 1}`;
      effects.push(effectId);
      events.push({
        t: new Date().toISOString(),
        kind: "request_applied",
        reference,
        detail: effectId,
      });
    });
  };

  const host: ProgramHost = {
    execute: (input) =>
      Effect.gen(function* () {
        if (input.operationId !== WRITE_OP) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({ ok: true, operationId: input.operationId }),
              },
            ],
          };
        }
        const reference =
          typeof input.args?.clientReference === "string"
            ? input.args.clientReference
            : CLIENT_REFERENCE;
        events.push({
          t: new Date().toISOString(),
          kind: "request_sent",
          reference,
        });
        inflight.add(reference);
        events.push({
          t: new Date().toISOString(),
          kind: "request_paused",
          reference,
        });
        applyOnRelease(reference);
        // Hold the fiber until release or interrupt (timeout/crash). Apply still runs.
        yield* Effect.promise(() => releasePromise);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ ok: true, reference, paused: true }),
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
          reason: "lookup-race",
        },
        operation: {
          method: operationId === WRITE_OP ? "POST" : "GET",
          specLabel: "pets",
        },
        lookupByReferenceCapable: operationId === WRITE_OP,
      }),
    verifyByReference: (input) =>
      Effect.sync(() => {
        if (effects.length > 0 && input.reference === CLIENT_REFERENCE) {
          events.push({
            t: new Date().toISOString(),
            kind: "lookup",
            reference: input.reference,
            found: true,
            definitive: true,
          });
          return {
            status: "found" as const,
            preview: JSON.stringify({ ok: true, effectId: effects[0] }),
          };
        }
        // Still in flight → not_found must NOT be definitive.
        const stillInflight = inflight.has(input.reference);
        const definitive = !stillInflight && effects.length === 0;
        events.push({
          t: new Date().toISOString(),
          kind: "lookup",
          reference: input.reference,
          found: false,
          definitive,
          detail: `inflight=${stillInflight}`,
        });
        if (definitive) {
          // Only when nothing is in flight and nothing applied — mock treats
          // empty post-cancel as lookup_covers_prior_accepts (named guarantee).
          return {
            status: "not_found" as const,
            definitive: true as const,
            reason: "lookup_covers_prior_accepts" as const,
          };
        }
        return { status: "not_found" as const, definitive: false as const };
      }),
  };

  return {
    host,
    effects,
    events,
    getInflight: () => inflight.size,
    release: () => {
      events.push({
        t: new Date().toISOString(),
        kind: "request_released",
        reference: CLIENT_REFERENCE,
      });
      releaseResolve?.();
    },
  };
}

async function oneRaceTrial(i: number): Promise<ComparisonTrial> {
  const dir = await mkdtemp(join(tmpdir(), `clawql-lookup-race-${i}-`));
  const programId = `prog_lookup_race_${String(i).padStart(4, "0")}`;
  const shop = pausedShop();
  const wantTrace = process.env.DURABILITY_COMPARISON_TRACE === "1";
  try {
    const parked = await Effect.runPromise(
      runDurableProgramEffect(
        { source: planSource(), programId, sessionId: `race-${i}`, timeoutMs: 80 },
        shop.host,
        {}
      ).pipe(Effect.provide(programJournalFileLayer(dir)))
    );
    shop.events.push({
      t: new Date().toISOString(),
      kind: "crashed",
      detail: `parked status=${parked.diagnostics.durable?.status} inflight=${shop.getInflight()}`,
    });

    const resumed = await Effect.runPromise(
      resumeProgramEffect(programId, shop.host, {}, { sessionId: `race-${i}` }).pipe(
        Effect.provide(programJournalFileLayer(dir))
      )
    );
    shop.events.push({ t: new Date().toISOString(), kind: "resumed" });

    const unknownBeforeRelease = resumed.calls.filter((c) => c.status === "outcome_unknown").length;
    const executedBeforeRelease = shop.effects.length;

    shop.release();
    await Effect.runPromise(Effect.sleep(Duration.millis(30)));

    const uniqueWriteEffects = shop.effects.length;
    const duplicates = Math.max(0, uniqueWriteEffects - 1);
    const interruptedOrUnknown = unknownBeforeRelease > 0;
    const classified = classifyOutcome({
      uniqueWriteEffects,
      duplicates,
      interruptedOrUnknown,
      completedKnownSuccess: false,
    });

    const ok =
      executedBeforeRelease === 0 &&
      uniqueWriteEffects === 1 &&
      duplicates === 0 &&
      classified.interruptedOrUnknown === 1 &&
      resumed.calls.some((c) => c.status === "outcome_unknown");

    if (classified.interruptedOrUnknown === 1) {
      shop.events.push({ t: new Date().toISOString(), kind: "outcome_unknown" });
    }

    return {
      i,
      ok,
      ...classified,
      lost: 0,
      uniqueWriteEffects,
      childSignal: "TIMEOUT_PARK",
      detail: ok
        ? `lookup-race: dup=${classified.duplicates} unk=${classified.interruptedOrUnknown} once=${classified.completedExactlyOnce} effects=${uniqueWriteEffects} beforeRelease=${executedBeforeRelease}`
        : `fail lookup-race: effects=${uniqueWriteEffects} beforeRelease=${executedBeforeRelease} unkCalls=${unknownBeforeRelease} inflight=${shop.getInflight()}`,
      ...(wantTrace ? { events: [...shop.events] } : {}),
    };
  } finally {
    shop.release();
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

export const clawqlCheckThenDecideRaceArm: DurabilityArm = {
  id: "clawql-check-then-decide-race",
  run: ({ n }) =>
    Effect.tryPromise({
      try: async (): Promise<ArmResult> => {
        const trials: ComparisonTrial[] = [];
        for (let i = 0; i < n; i++) {
          trials.push(await oneRaceTrial(i));
        }
        const modes: ArmModeResult[] = [
          summarizeMode("non_idempotent", trials, {
            requireZeroDuplicates: true,
            apiCapability: "lookup_race",
          }),
        ];
        return {
          armId: "clawql-check-then-decide-race",
          status: "measured",
          agentPolicy: "structural",
          peerFraming: "clawql_structural",
          honesty:
            "Race probe: mock pauses the charge; resume lookup returns not_found while the original may still land (definitive=false) → outcome_unknown, never safe-resend; release applies once → 0 duplicates. Proves check-then-decide does not trust early not_found.",
          modes,
        };
      },
      catch: (e) => (e instanceof Error ? e : new Error(String(e))),
    }).pipe(Effect.orDie),
};
