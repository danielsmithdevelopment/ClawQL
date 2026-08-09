import type { ObtRecord, TraceFilter } from "../types.js";

function turnCount(trace: ObtRecord): number {
  return trace.rtp.turnSequence?.length ?? 0;
}

function hasToolEvidence(trace: ObtRecord, tools: string[]): boolean {
  if (!tools.length) return true;
  const names = new Set(
    (trace.rtp.turnSequence ?? [])
      .map((t) => t.execution?.toolName)
      .filter((n): n is string => Boolean(n))
  );
  return tools.every((tool) => names.has(tool));
}

/** Apply quality / domain TraceFilter to OBT records (before method formatting). */
export function filterTraces(traces: ObtRecord[], filter: TraceFilter): ObtRecord[] {
  return traces.filter((t) => {
    const cpr = t.rtp.verdict.criterionPassRate;
    if (filter.minCriterionPassRate != null && cpr < filter.minCriterionPassRate) return false;
    if (filter.maxCriterionPassRate != null && cpr > filter.maxCriterionPassRate) return false;
    if (filter.requireAllPass && !t.rtp.verdict.allPass) return false;
    if (filter.requireToolEvidence?.length && !hasToolEvidence(t, filter.requireToolEvidence)) {
      return false;
    }
    const turns = turnCount(t);
    if (filter.minTurns != null && turns < filter.minTurns) return false;
    if (filter.maxTurns != null && turns > filter.maxTurns) return false;
    if (filter.benchmarkId && t.benchmark !== filter.benchmarkId) return false;
    if (filter.arm && t.arm !== filter.arm) return false;
    if (filter.model && t.model !== filter.model) return false;
    return true;
  });
}

export function hasToolEvidenceInTrace(trace: ObtRecord, tools: string[]): boolean {
  return hasToolEvidence(trace, tools);
}
