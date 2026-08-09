import { hasToolEvidenceInTrace } from "./filter.js";
import type {
  DpoExample,
  DpoVariant,
  GrpoExample,
  KtoExample,
  ObtRecord,
  RtpTurn,
  SftExample,
  TraceFilter,
} from "../types.js";

export type TraceFormatterConfig = {
  minCriterionPassRate?: number;
  maxChosenRejectedRatio?: number;
  ktoGoodThreshold?: number;
  ktoBadThreshold?: number;
  dpoChosenMinCpr?: number;
  dpoRejectedMaxCpr?: number;
  requireToolEvidenceForSft?: string[];
};

const DEFAULTS: Required<
  Pick<
    TraceFormatterConfig,
    | "minCriterionPassRate"
    | "maxChosenRejectedRatio"
    | "ktoGoodThreshold"
    | "ktoBadThreshold"
    | "dpoChosenMinCpr"
    | "dpoRejectedMaxCpr"
  >
> = {
  minCriterionPassRate: 0.9,
  maxChosenRejectedRatio: 2.0,
  ktoGoodThreshold: 0.8,
  ktoBadThreshold: 0.8,
  dpoChosenMinCpr: 0.8,
  dpoRejectedMaxCpr: 0.4,
};

function groupByTask(traces: ObtRecord[]): Map<string, ObtRecord[]> {
  const map = new Map<string, ObtRecord[]>();
  for (const t of traces) {
    const list = map.get(t.task_id) ?? [];
    list.push(t);
    map.set(t.task_id, list);
  }
  return map;
}

function maxBy<T>(items: T[], score: (item: T) => number): T {
  let best = items[0]!;
  let bestScore = score(best);
  for (let i = 1; i < items.length; i++) {
    const s = score(items[i]!);
    if (s > bestScore) {
      best = items[i]!;
      bestScore = s;
    }
  }
  return best;
}

function minBy<T>(items: T[], score: (item: T) => number): T {
  let best = items[0]!;
  let bestScore = score(best);
  for (let i = 1; i < items.length; i++) {
    const s = score(items[i]!);
    if (s < bestScore) {
      best = items[i]!;
      bestScore = s;
    }
  }
  return best;
}

/** Format OBT traces into method-specific training datasets. */
export class TraceFormatter {
  private readonly config: TraceFormatterConfig & typeof DEFAULTS;

  constructor(config: TraceFormatterConfig = {}) {
    this.config = { ...DEFAULTS, ...config };
  }

  buildPrompt(t: ObtRecord): string {
    const system = this.buildSystemPrompt(t);
    const task = this.buildTaskPrompt(t);
    return system ? `${system}\n\n${task}` : task;
  }

  buildSystemPrompt(t: ObtRecord): string {
    return t.rtp.turnSequence[0]?.intent?.rawPrompt ?? "";
  }

  buildTaskPrompt(t: ObtRecord): string {
    return `Task: ${t.task_id}${t.benchmark ? ` (${t.benchmark})` : ""}`;
  }

  buildResponse(t: ObtRecord): string {
    return this.buildResponseFromTurns(t.rtp.turnSequence ?? []);
  }

  buildResponseFromTurns(turns: RtpTurn[]): string {
    return turns
      .map((turn) =>
        [
          turn.reasoning?.seedChain,
          turn.execution?.toolName
            ? `<tool_use>${turn.execution.toolName}(${JSON.stringify(turn.execution.payload ?? {})})</tool_use>`
            : null,
          turn.execution?.result !== undefined
            ? `<tool_result>${JSON.stringify(turn.execution.result)}</tool_result>`
            : null,
        ]
          .filter(Boolean)
          .join("\n")
      )
      .filter(Boolean)
      .join("\n\n");
  }

  responseLength(t: ObtRecord): number {
    return this.buildResponse(t).length;
  }

  /** Length-ratio guard — returns false when pair is verbosity-biased. */
  passesLengthRatioGuard(chosen: ObtRecord, rejected: ObtRecord): boolean {
    const maxRatio = this.config.maxChosenRejectedRatio;
    const chosenLen = Math.max(1, this.responseLength(chosen));
    const rejectedLen = Math.max(1, this.responseLength(rejected));
    if (chosenLen / rejectedLen > maxRatio) return false;
    if (rejectedLen / chosenLen > maxRatio) return false;
    return true;
  }

  forSFT(traces: ObtRecord[]): SftExample[] {
    const tools = this.config.requireToolEvidenceForSft ?? [];
    return traces
      .filter((t) => t.rtp.verdict.criterionPassRate >= this.config.minCriterionPassRate)
      .filter((t) => (tools.length ? hasToolEvidenceInTrace(t, tools) : true))
      .map((t) => ({
        prompt: this.buildPrompt(t),
        response: this.buildResponse(t),
      }));
  }

  forDPO(traces: ObtRecord[], variant: DpoVariant = "standard"): DpoExample[] | KtoExample[] {
    if (variant === "kto") {
      return traces.map((t) => ({
        prompt: this.buildPrompt(t),
        completion: this.buildResponse(t),
        label: t.rtp.verdict.criterionPassRate >= this.config.ktoGoodThreshold ? "good" : "bad",
      })) satisfies KtoExample[];
    }

    const byTask = groupByTask(traces);
    const out: DpoExample[] = [];

    for (const group of byTask.values()) {
      const hasChosen = group.some(
        (t) => t.rtp.verdict.criterionPassRate >= this.config.dpoChosenMinCpr
      );
      const hasRejected = group.some(
        (t) => t.rtp.verdict.criterionPassRate <= this.config.dpoRejectedMaxCpr
      );
      if (!hasChosen || !hasRejected) continue;

      const chosen = maxBy(group, (t) => t.rtp.verdict.criterionPassRate);
      const rejected = minBy(group, (t) => t.rtp.verdict.criterionPassRate);
      if (!this.passesLengthRatioGuard(chosen, rejected)) continue;

      out.push({
        prompt: this.buildPrompt(chosen),
        chosen: this.buildResponse(chosen),
        rejected: this.buildResponse(rejected),
        chosenCPR: chosen.rtp.verdict.criterionPassRate,
        rejectedCPR: rejected.rtp.verdict.criterionPassRate,
        taskId: chosen.task_id,
        benchmark: chosen.benchmark,
      });
    }

    return out;
  }

  forGRPO(traces: ObtRecord[]): GrpoExample[] {
    const seen = new Set<string>();
    const out: GrpoExample[] = [];
    for (const t of traces) {
      if (seen.has(t.task_id)) continue;
      seen.add(t.task_id);
      out.push({
        prompt: this.buildPrompt(t),
        taskId: t.task_id,
        taskMeta: {
          criteria: t.harveyRubric?.criteria,
          documents: t.documents,
          groundTruth: t.harveyRubric?.groundTruth,
        },
      });
    }
    return out;
  }

  forSPIN(currentRound: ObtRecord[], previousRound: ObtRecord[]): DpoExample[] {
    const currentByTask = new Map(currentRound.map((t) => [t.task_id, t]));
    const previousByTask = new Map(previousRound.map((t) => [t.task_id, t]));
    const out: DpoExample[] = [];
    for (const [taskId, current] of currentByTask) {
      const previous = previousByTask.get(taskId);
      if (!previous) continue;
      if (!this.passesLengthRatioGuard(current, previous)) continue;
      out.push({
        prompt: this.buildPrompt(current),
        chosen: this.buildResponse(current),
        rejected: this.buildResponse(previous),
        taskId,
        chosenCPR: current.rtp.verdict.criterionPassRate,
        rejectedCPR: previous.rtp.verdict.criterionPassRate,
      });
    }
    return out;
  }
}

/** Convenience: filter then format for a method using TraceFilter. */
export function formatForMethod(
  traces: ObtRecord[],
  method: "sft" | "dpo" | "grpo" | "spin",
  filter: TraceFilter = {},
  opts: { variant?: DpoVariant; previousRound?: ObtRecord[] } = {}
): SftExample[] | DpoExample[] | KtoExample[] | GrpoExample[] {
  const formatter = new TraceFormatter({
    minCriterionPassRate: filter.minCriterionPassRate,
    maxChosenRejectedRatio: filter.maxChosenRejectedRatio,
    requireToolEvidenceForSft: filter.requireToolEvidence,
  });

  if (method === "sft") return formatter.forSFT(traces);
  if (method === "dpo") return formatter.forDPO(traces, opts.variant ?? "standard");
  if (method === "grpo") return formatter.forGRPO(traces);
  return formatter.forSPIN(traces, opts.previousRound ?? []);
}
