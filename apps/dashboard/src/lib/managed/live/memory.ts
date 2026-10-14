import { Effect, Ref } from "effect";

import {
  MEMORY_FIELDS,
  MEMORY_RESULTS,
  MEMORY_UPLOADS,
} from "@/lib/managed/fixtures-ops";

export type ManagedMemoryResult = (typeof MEMORY_RESULTS)[number];
export type ManagedMemoryField = (typeof MEMORY_FIELDS)[number];
export type ManagedMemoryUpload = (typeof MEMORY_UPLOADS)[number];

const erasedSubjectsRef = Ref.makeUnsafe<string[]>([]);

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

export const listManagedMemoryUploadsEffect = (): Effect.Effect<{
  readonly uploads: readonly ManagedMemoryUpload[];
  readonly erasedSubjects: readonly string[];
  readonly source: "fixture";
}> =>
  Effect.gen(function* () {
    const erasedSubjects = yield* Ref.get(erasedSubjectsRef);
    return {
      uploads: MEMORY_UPLOADS,
      erasedSubjects,
      source: "fixture" as const,
    };
  });

export const eraseManagedMemorySubjectEffect = (input: {
  readonly subject: string;
  readonly acceptIrreversible: boolean;
  readonly acceptAuditKept: boolean;
}): Effect.Effect<
  { readonly ok: true; readonly subject: string; readonly source: "fixture" },
  Error
> =>
  Effect.gen(function* () {
    const subject = input.subject.trim();
    if (!subject) {
      return yield* Effect.fail(new Error("subject required"));
    }
    if (!input.acceptIrreversible || !input.acceptAuditKept) {
      return yield* Effect.fail(new Error("acceptance_required"));
    }
    yield* Ref.update(erasedSubjectsRef, (rows) =>
      rows.includes(subject) ? rows : [...rows, subject],
    );
    return { ok: true as const, subject, source: "fixture" as const };
  });

export const resetManagedMemoryEraseEffect = (): Effect.Effect<void> =>
  Ref.set(erasedSubjectsRef, []);
