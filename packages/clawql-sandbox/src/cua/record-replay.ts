/**
 * C3 — record-and-replay spike for outbound calls from a Space.
 *
 * ClawQL records every outgoing call (model calls included) by sequence
 * position. After restoring a snapshot, it serves recorded responses until
 * the agent reaches the crash point, then goes live. A digest mismatch at
 * any position stops replay and marks the write unknown.
 */

import { createHash } from "node:crypto";
import { Context, Effect, Layer, Ref } from "effect";
import { Data } from "effect";

export type CallDigest = string;

export type RecordedCall = {
  readonly sequence: number;
  readonly digest: CallDigest;
  readonly operationId: string;
  readonly requestJson: string;
  readonly responseJson: string;
  readonly recordedAt: string;
};

export type ReplayMode = "record" | "replay" | "live";

export type ReplayOutcome =
  | { readonly kind: "recorded"; readonly call: RecordedCall }
  | { readonly kind: "replayed"; readonly call: RecordedCall }
  | { readonly kind: "live"; readonly sequence: number }
  | {
      readonly kind: "digest_mismatch";
      readonly sequence: number;
      readonly expectedDigest: CallDigest;
      readonly actualDigest: CallDigest;
      readonly writeStatus: "outcome_unknown";
    };

export class RecordReplayError extends Data.TaggedError("RecordReplayError")<{
  readonly reason: string;
}> {}

export class CallRecordReplayService extends Context.Service<
  CallRecordReplayService,
  {
    readonly mode: () => Effect.Effect<ReplayMode>;
    readonly setMode: (mode: ReplayMode) => Effect.Effect<void>;
    readonly setCrashSequence: (seq: number | null) => Effect.Effect<void>;
    readonly digest: (operationId: string, request: unknown) => Effect.Effect<CallDigest>;
    readonly handleOutbound: (
      operationId: string,
      request: unknown,
      liveResponse: unknown
    ) => Effect.Effect<ReplayOutcome, RecordReplayError>;
    readonly list: () => Effect.Effect<readonly RecordedCall[]>;
    readonly importTape: (calls: readonly RecordedCall[]) => Effect.Effect<void>;
    readonly writeUnknownCount: () => Effect.Effect<number>;
  }
>()("clawql/CallRecordReplayService") {}

export function digestOutboundCallEffect(
  operationId: string,
  request: unknown
): Effect.Effect<CallDigest> {
  return Effect.sync(() =>
    createHash("sha256")
      .update(operationId)
      .update("\0")
      .update(stableJson(request))
      .digest("hex")
  );
}

function stableJson(value: unknown): string {
  return JSON.stringify(value, (_k, v) => {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      const obj = v as Record<string, unknown>;
      const sorted: Record<string, unknown> = {};
      for (const key of Object.keys(obj).sort()) sorted[key] = obj[key];
      return sorted;
    }
    return v;
  });
}

type ReplayState = {
  mode: ReplayMode;
  /** Sequence at which the agent crashed; replay serves through seq-1 then goes live. */
  crashSequence: number | null;
  nextSequence: number;
  tape: RecordedCall[];
  writeUnknownCount: number;
};

export function createCallRecordReplayLayer(
  initial: Partial<ReplayState> = {}
): Layer.Layer<CallRecordReplayService> {
  return Layer.effect(
    CallRecordReplayService,
    Effect.gen(function* () {
      const state = yield* Ref.make<ReplayState>({
        mode: initial.mode ?? "record",
        crashSequence: initial.crashSequence ?? null,
        nextSequence: initial.nextSequence ?? 0,
        tape: initial.tape ? [...initial.tape] : [],
        writeUnknownCount: initial.writeUnknownCount ?? 0,
      });

      return {
        mode: () => Ref.get(state).pipe(Effect.map((s) => s.mode)),
        setMode: (mode) => Ref.update(state, (s) => ({ ...s, mode })),
        setCrashSequence: (seq) => Ref.update(state, (s) => ({ ...s, crashSequence: seq })),
        digest: (operationId, request) => digestOutboundCallEffect(operationId, request),
        handleOutbound: (operationId, request, liveResponse) =>
          Effect.gen(function* () {
            const digest = yield* digestOutboundCallEffect(operationId, request);
            const cur = yield* Ref.get(state);
            const sequence = cur.nextSequence;

            if (cur.mode === "record") {
              const call: RecordedCall = {
                sequence,
                digest,
                operationId,
                requestJson: stableJson(request),
                responseJson: stableJson(liveResponse),
                recordedAt: new Date().toISOString(),
              };
              yield* Ref.update(state, (s) => ({
                ...s,
                nextSequence: s.nextSequence + 1,
                tape: [...s.tape, call],
              }));
              return { kind: "recorded" as const, call };
            }

            if (cur.mode === "replay") {
              // Past the crash point → go live (no repeated write of recorded side effects).
              if (cur.crashSequence !== null && sequence >= cur.crashSequence) {
                yield* Ref.update(state, (s) => ({
                  ...s,
                  mode: "live" as ReplayMode,
                  nextSequence: s.nextSequence + 1,
                }));
                return { kind: "live" as const, sequence };
              }
              const expected = cur.tape.find((c) => c.sequence === sequence);
              if (!expected) {
                return yield* Effect.fail(
                  new RecordReplayError({
                    reason: `no recorded call at sequence ${sequence}`,
                  })
                );
              }
              if (expected.digest !== digest) {
                yield* Ref.update(state, (s) => ({
                  ...s,
                  writeUnknownCount: s.writeUnknownCount + 1,
                  mode: "live" as ReplayMode,
                }));
                return {
                  kind: "digest_mismatch" as const,
                  sequence,
                  expectedDigest: expected.digest,
                  actualDigest: digest,
                  writeStatus: "outcome_unknown" as const,
                };
              }
              yield* Ref.update(state, (s) => ({
                ...s,
                nextSequence: s.nextSequence + 1,
              }));
              return { kind: "replayed" as const, call: expected };
            }

            // live
            yield* Ref.update(state, (s) => ({
              ...s,
              nextSequence: s.nextSequence + 1,
            }));
            return { kind: "live" as const, sequence };
          }),
        list: () => Ref.get(state).pipe(Effect.map((s) => s.tape as readonly RecordedCall[])),
        importTape: (calls) =>
          Ref.update(state, (s) => ({
            ...s,
            tape: [...calls],
            nextSequence: 0,
          })),
        writeUnknownCount: () => Ref.get(state).pipe(Effect.map((s) => s.writeUnknownCount)),
      };
    })
  );
}

/**
 * Done-when helper: crash mid-tool resumes with no repeated write, and a
 * deliberately divergent replay is caught as outcome_unknown.
 */
export function assertReplaySpikeDoneEffect(): Effect.Effect<
  {
    readonly noRepeatedWrite: boolean;
    readonly divergentCaught: boolean;
  },
  RecordReplayError,
  CallRecordReplayService
> {
  return Effect.gen(function* () {
    const rr = yield* CallRecordReplayService;

    // Arm A: record three calls, crash at sequence 2, restore + replay.
    yield* rr.setMode("record");
    yield* rr.setCrashSequence(null);
    const r0 = yield* rr.handleOutbound("model.chat", { n: 0 }, { ok: true, n: 0 });
    const r1 = yield* rr.handleOutbound("tools.write", { id: "w1" }, { written: true });
    const r2 = yield* rr.handleOutbound("tools.write", { id: "w2" }, { written: true });
    if (r0.kind !== "recorded" || r1.kind !== "recorded" || r2.kind !== "recorded") {
      return yield* Effect.fail(new RecordReplayError({ reason: "expected record mode" }));
    }
    const tape = yield* rr.list();
    yield* rr.importTape(tape);
    yield* rr.setCrashSequence(2);
    yield* rr.setMode("replay");

    const p0 = yield* rr.handleOutbound("model.chat", { n: 0 }, { shouldNotUse: true });
    const p1 = yield* rr.handleOutbound("tools.write", { id: "w1" }, { shouldNotUse: true });
    const p2 = yield* rr.handleOutbound("tools.write", { id: "w2" }, { live: true });
    const noRepeatedWrite =
      p0.kind === "replayed" && p1.kind === "replayed" && p2.kind === "live";

    // Arm B: divergent digest at position 0.
    yield* rr.importTape(tape);
    yield* rr.setCrashSequence(null);
    yield* rr.setMode("replay");
    const bad = yield* rr.handleOutbound("model.chat", { n: 999 }, { x: 1 });
    const divergentCaught =
      bad.kind === "digest_mismatch" && bad.writeStatus === "outcome_unknown";

    return { noRepeatedWrite, divergentCaught };
  });
}
