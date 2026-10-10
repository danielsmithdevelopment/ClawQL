/**
 * celld-shaped program cell façade (ADR 0015 durable code mode step 2).
 *
 * Honesty: this is not yet a Workers/DO V8 isolate hosted by a pinned celld
 * binary. It binds the durable journal + program runner behind a cell-like
 * API so the crash-resume path matches the celld SQLite contract. Swap the
 * journal backend for celld DO storage when the pin is ready.
 */

import { Context, Effect, Layer } from "effect";
import {
  DURABLE_PROGRAM_HONESTY,
  resumeProgramEffect,
  runDurableProgramEffect,
  type DurableProgramInput,
} from "./durable-runner.js";
import {
  makeFileProgramJournalEffect,
  programJournalLayer,
} from "./program-journal.js";
import type { ExecuteProgramResult, ProgramHost } from "./program-runner.js";

export type ProgramCellStorage = {
  readonly get: (key: string) => Effect.Effect<string | null>;
  readonly put: (key: string, value: string) => Effect.Effect<void>;
};

export type ProgramCellApi = {
  readonly honesty: string;
  readonly journalDir: string;
  readonly run: (
    input: DurableProgramInput,
    host: ProgramHost
  ) => Effect.Effect<ExecuteProgramResult>;
  readonly resume: (
    programId: string,
    host: ProgramHost,
    sessionId?: string
  ) => Effect.Effect<ExecuteProgramResult>;
};

/**
 * Build a program cell that uses the file journal as celld-shaped durable storage.
 * `journalDir` is the cell's "SQLite" stand-in (one directory per tenant/fleet).
 */
export function makeProgramCellEffect(journalDir: string): Effect.Effect<ProgramCellApi> {
  return Effect.gen(function* () {
    // Ensure the journal root exists (0700) before the first run/resume.
    yield* makeFileProgramJournalEffect(journalDir).pipe(Effect.catch(() => Effect.void));
    const env = { ...process.env, CLAWQL_PROGRAM_JOURNAL_DIR: journalDir };
    return {
      honesty: `${DURABLE_PROGRAM_HONESTY} celld-shaped journal dir=${journalDir}`,
      journalDir,
      run: (input, host) =>
        runDurableProgramEffect(input, host, env, {
          sessionId: input.sessionId,
        }).pipe(Effect.provide(programJournalLayer(env))),
      resume: (programId, host, sessionId) =>
        resumeProgramEffect(programId, host, env, { sessionId }).pipe(
          Effect.provide(programJournalLayer(env))
        ),
    };
  });
}

export class ProgramCellService extends Context.Service<
  ProgramCellService,
  ProgramCellApi
>()("clawql/ProgramCellService") {}

export function programCellLayer(journalDir: string): Layer.Layer<ProgramCellService> {
  return Layer.effect(ProgramCellService, makeProgramCellEffect(journalDir));
}
