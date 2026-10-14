import { Effect } from "effect";

import { MEMORY_FIELDS, MEMORY_RESULTS } from "@/lib/managed/fixtures-ops";

export type ManagedMemoryResult = (typeof MEMORY_RESULTS)[number];
export type ManagedMemoryField = (typeof MEMORY_FIELDS)[number];

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
