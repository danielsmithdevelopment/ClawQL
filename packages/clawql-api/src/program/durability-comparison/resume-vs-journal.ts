/**
 * Tier F probe: resume wall time vs journal length (file-journal stand-in).
 * Short vs long programs — measure before claiming constant resume cost.
 * Snapshots only if growth is material (not implemented here).
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { mkdtemp, readdir, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { Effect } from "effect";
import { resumeProgramEffect, runDurableProgramEffect } from "../durable-runner.js";
import { programJournalFileLayer } from "../program-journal.js";
import type { ProgramHost } from "../program-runner.js";

export type ResumeVsJournalSample = {
  readonly nSteps: number;
  readonly journalBytes: number;
  readonly journalRecords: number;
  readonly firstRunMs: number;
  readonly resumeMs: number;
  readonly replayedCalls: number;
  readonly ok: boolean;
  readonly detail: string;
};

export type ResumeVsJournalEvidence = {
  readonly kind: "durability-resume-vs-journal";
  readonly measuredAt: string;
  readonly honesty: string;
  readonly samples: readonly ResumeVsJournalSample[];
  /** Simple linear slope estimate: ms per extra journal record (null if <2 samples). */
  readonly resumeMsPerRecord: number | null;
  readonly snapshotRecommended: boolean;
};

function readHost(): ProgramHost {
  return {
    execute: (input) =>
      Effect.sync(() => ({
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ ok: true, operationId: input.operationId }),
          },
        ],
      })),
    search: () => Effect.fail(new Error("search is not part of this plan")),
    resolveRisk: () =>
      Effect.succeed({
        found: true,
        policy: "allow" as const,
        risk: {
          policy: "allow" as const,
          level: "LOW" as const,
          source: "spec-default" as const,
          reason: "resume-vs-journal",
        },
        operation: { method: "GET", specLabel: "pets" },
      }),
  };
}

function planSource(nSteps: number): string {
  return JSON.stringify({
    v: 1,
    mode: "sequential",
    calls: Array.from({ length: nSteps }, (_, i) => ({
      tool: "execute",
      operationId: `pets.get.${i}`,
      args: { page: i + 1 },
    })),
  });
}

async function journalStats(dir: string): Promise<{ bytes: number; records: number }> {
  const names = await readdir(dir);
  let bytes = 0;
  let records = 0;
  for (const name of names) {
    const p = join(dir, name);
    const st = await stat(p);
    if (!st.isFile()) continue;
    bytes += st.size;
    const raw = await readFile(p, "utf8");
    records += raw.split("\n").filter((l) => l.trim().length > 0).length;
  }
  return { bytes, records };
}

async function oneSample(nSteps: number): Promise<ResumeVsJournalSample> {
  const dir = await mkdtemp(join(tmpdir(), `clawql-tierf-${nSteps}-`));
  const programId = `prog_tierf_${nSteps}`;
  const host = readHost();
  // Raise caps for long journals — defaults are 16 calls / 32KiB source.
  const capsEnv: NodeJS.ProcessEnv = {
    CLAWQL_PROGRAM_MAX_TOOL_CALLS: String(Math.max(16, nSteps)),
    CLAWQL_PROGRAM_MAX_SOURCE_LENGTH: String(Math.max(32_768, nSteps * 120)),
    CLAWQL_PROGRAM_MAX_OUTPUT_BYTES: String(Math.max(256 * 1024, nSteps * 512)),
  };
  try {
    const t0 = performance.now();
    const first = await Effect.runPromise(
      runDurableProgramEffect(
        { source: planSource(nSteps), programId, sessionId: `tierf-${nSteps}` },
        host,
        capsEnv
      ).pipe(Effect.provide(programJournalFileLayer(dir)))
    );
    const firstRunMs = performance.now() - t0;
    const { bytes, records } = await journalStats(dir);

    const t1 = performance.now();
    const resumed = await Effect.runPromise(
      resumeProgramEffect(programId, host, capsEnv, { sessionId: `tierf-${nSteps}` }).pipe(
        Effect.provide(programJournalFileLayer(dir))
      )
    );
    const resumeMs = performance.now() - t1;
    const replayedCalls = resumed.diagnostics.durable?.replayedCalls ?? 0;
    const ok =
      first.ok === true &&
      resumed.ok === true &&
      replayedCalls === nSteps &&
      (resumed.diagnostics.durable?.executedCalls ?? 0) === 0;

    return {
      nSteps,
      journalBytes: bytes,
      journalRecords: records,
      firstRunMs: Math.round(firstRunMs * 1000) / 1000,
      resumeMs: Math.round(resumeMs * 1000) / 1000,
      replayedCalls,
      ok,
      detail: ok
        ? `n=${nSteps} resumeMs=${resumeMs.toFixed(2)} records=${records} bytes=${bytes}`
        : `fail n=${nSteps} firstOk=${first.ok} resumeOk=${resumed.ok} replayed=${replayedCalls}`,
    };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

function parseStepList(env: NodeJS.ProcessEnv): number[] {
  const raw = env.DURABILITY_RESUME_JOURNAL_STEPS?.trim();
  if (raw) {
    return raw
      .split(",")
      .map((s) => Math.floor(Number(s.trim())))
      .filter((n) => Number.isFinite(n) && n >= 1 && n <= 5000);
  }
  return [10, 50, 200, 500];
}

export function runResumeVsJournalEffect(
  env: NodeJS.ProcessEnv = process.env
): Effect.Effect<ResumeVsJournalEvidence> {
  const steps = parseStepList(env);
  if (steps.length === 0) {
    return Effect.die(new Error("DURABILITY_RESUME_JOURNAL_STEPS produced no valid sizes"));
  }

  return Effect.tryPromise({
    try: async (): Promise<ResumeVsJournalEvidence> => {
      const samples: ResumeVsJournalSample[] = [];
      for (const n of steps) {
        samples.push(await oneSample(n));
      }
      let resumeMsPerRecord: number | null = null;
      if (samples.length >= 2) {
        const a = samples[0]!;
        const b = samples[samples.length - 1]!;
        const dRec = b.journalRecords - a.journalRecords;
        if (dRec > 0) {
          resumeMsPerRecord = Math.round(((b.resumeMs - a.resumeMs) / dRec) * 1000) / 1000;
        }
      }
      // Heuristic: recommend snapshots if long resume is >> short and grows with length.
      const short = samples[0];
      const long = samples[samples.length - 1];
      const snapshotRecommended =
        short !== undefined &&
        long !== undefined &&
        long.resumeMs > Math.max(50, short.resumeMs * 5) &&
        (resumeMsPerRecord ?? 0) > 0.05;

      return {
        kind: "durability-resume-vs-journal",
        measuredAt: new Date().toISOString(),
        honesty:
          "File-journal stand-in resume wall time vs journal record count/bytes. Not fleet lease failover (Tier C ~12s). Snapshots only if growth is material — see snapshotRecommended.",
        samples,
        resumeMsPerRecord,
        snapshotRecommended,
      };
    },
    catch: (e) => (e instanceof Error ? e : new Error(String(e))),
  }).pipe(Effect.orDie);
}

export function defaultResumeVsJournalEvidencePath(env: NodeJS.ProcessEnv = process.env): string {
  if (env.DURABILITY_RESUME_JOURNAL_PATH?.trim()) {
    return env.DURABILITY_RESUME_JOURNAL_PATH.trim();
  }
  return join(process.cwd(), "docs/benchmarks/durability-proof/resume-vs-journal/evidence.json");
}

export function writeResumeVsJournalEvidence(
  evidence: ResumeVsJournalEvidence,
  path: string = defaultResumeVsJournalEvidencePath()
): string {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
  return path;
}
