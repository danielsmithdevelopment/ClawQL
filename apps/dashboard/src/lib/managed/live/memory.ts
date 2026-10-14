import { Effect } from "effect";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import {
  ERASURE_PREVIEW,
  MEMORY_FIELDS,
  MEMORY_RESULTS,
  MEMORY_UPLOADS,
} from "@/lib/managed/fixtures-ops";

export type ManagedMemoryResult = (typeof MEMORY_RESULTS)[number];
export type ManagedMemoryField = (typeof MEMORY_FIELDS)[number];
export type ManagedMemoryUpload = (typeof MEMORY_UPLOADS)[number];

function resolveErasePath(env: NodeJS.ProcessEnv = process.env): string {
  const override = env.CLAWQL_MEMORY_ERASE_PATH?.trim();
  if (override) return override;
  const home = env.CLAWQL_HOME?.trim() || join(process.cwd(), ".clawql");
  return join(home, "Auth", "memory-erasure.json");
}

const readErasedSubjectsEffect = (
  env: NodeJS.ProcessEnv = process.env,
): Effect.Effect<string[], Error> =>
  Effect.tryPromise({
    try: async () => {
      try {
        const raw = await readFile(resolveErasePath(env), "utf8");
        const parsed = JSON.parse(raw) as { subjects?: string[] };
        return Array.isArray(parsed.subjects) ? parsed.subjects : [];
      } catch (e: unknown) {
        if ((e as NodeJS.ErrnoException)?.code === "ENOENT") return [];
        throw e;
      }
    },
    catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
  });

const writeErasedSubjectsEffect = (
  subjects: readonly string[],
  env: NodeJS.ProcessEnv = process.env,
): Effect.Effect<void, Error> =>
  Effect.tryPromise({
    try: async () => {
      const path = resolveErasePath(env);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(
        path,
        `${JSON.stringify({ version: 1, subjects, updatedAt: new Date().toISOString() }, null, 2)}\n`,
        "utf8",
      );
    },
    catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
  });

export const listManagedMemoryEffect = (input?: {
  readonly query?: string;
  readonly kind?: string;
}): Effect.Effect<{
  readonly results: readonly ManagedMemoryResult[];
  readonly source: "fixture";
}> =>
  Effect.sync(() => {
    const q = (input?.query ?? "").trim().toLowerCase();
    const kind = (input?.kind ?? "all").trim().toUpperCase();
    const results = MEMORY_RESULTS.filter((row) => {
      if (kind && kind !== "ALL" && row.kind !== kind) return false;
      if (!q) return true;
      return (
        row.title.toLowerCase().includes(q) ||
        row.summary.toLowerCase().includes(q) ||
        row.id.toLowerCase().includes(q)
      );
    });
    return { results, source: "fixture" as const };
  });

export const getManagedMemoryEffect = (
  id: string,
): Effect.Effect<{
  readonly result: ManagedMemoryResult | null;
  readonly fields: readonly ManagedMemoryField[];
  readonly source: "fixture";
}> =>
  Effect.sync(() => {
    const result = MEMORY_RESULTS.find((r) => r.id === id) ?? null;
    return {
      result,
      fields: result ? MEMORY_FIELDS : [],
      source: "fixture" as const,
    };
  });

export const listManagedMemoryUploadsEffect = (
  env: NodeJS.ProcessEnv = process.env,
): Effect.Effect<{
  readonly uploads: readonly ManagedMemoryUpload[];
  readonly erasedSubjects: readonly string[];
  readonly erasurePreview: typeof ERASURE_PREVIEW;
  readonly source: "live" | "fixture";
}> =>
  Effect.gen(function* () {
    const erasedSubjects = yield* readErasedSubjectsEffect(env).pipe(
      Effect.catch(() => Effect.succeed([] as string[])),
    );
    return {
      uploads: MEMORY_UPLOADS,
      erasedSubjects,
      erasurePreview: ERASURE_PREVIEW,
      source: erasedSubjects.length > 0 ? ("live" as const) : ("fixture" as const),
    };
  });

export const eraseManagedMemorySubjectEffect = (
  input: {
    readonly subject: string;
    readonly acceptIrreversible: boolean;
    readonly acceptAuditKept: boolean;
    readonly env?: NodeJS.ProcessEnv;
  },
): Effect.Effect<
  { readonly ok: true; readonly subject: string; readonly source: "live" | "fixture"; readonly jobId: string },
  Error
> =>
  Effect.gen(function* () {
    const env = input.env ?? process.env;
    const subject = input.subject.trim();
    if (!subject) {
      return yield* Effect.fail(new Error("subject required"));
    }
    if (!input.acceptIrreversible || !input.acceptAuditKept) {
      return yield* Effect.fail(new Error("acceptance_required"));
    }
    const existing = yield* readErasedSubjectsEffect(env);
    const next = existing.includes(subject) ? existing : [...existing, subject];
    yield* writeErasedSubjectsEffect(next, env);
    return {
      ok: true as const,
      subject,
      source: "live" as const,
      jobId: `era_${Date.now().toString(36)}`,
    };
  });

/** Test helper — clears durable erase list for a temp CLAWQL_HOME. */
export const resetManagedMemoryEraseEffect = (
  env: NodeJS.ProcessEnv = process.env,
): Effect.Effect<void, Error> => writeErasedSubjectsEffect([], env);
