import type { ObtRecord, TraceFilter } from "../types.js";
import { filterTraces } from "./filter.js";

export type CollectTracesInput = {
  /** Preloaded traces (bucket I/O staged). */
  traces: ObtRecord[];
  filter?: TraceFilter;
  maxSamples?: number;
};

/** Collect + filter traces. Bucket pull is staged; pass traces for local/tests. */
export function collectTraces(input: CollectTracesInput): ObtRecord[] {
  const filtered = filterTraces(input.traces, input.filter ?? {});
  if (input.maxSamples != null && input.maxSamples >= 0) {
    return filtered.slice(0, input.maxSamples);
  }
  return filtered;
}
