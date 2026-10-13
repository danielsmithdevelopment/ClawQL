import type { ActivityEvent, ReviewKind } from "./schemas";

export type ActivityKindFilter = ReviewKind | "all";

export type ActivityDecisionFilter =
  | "all"
  | "approve"
  | "decline"
  | "answer"
  | "ask_teammate"
  | "other";

const NAMED_DECISIONS = new Set(["approve", "decline", "answer", "ask_teammate"]);

export function matchesActivityDecision(
  event: ActivityEvent,
  filter: ActivityDecisionFilter
): boolean {
  if (filter === "all") return true;
  if (filter === "other") return !NAMED_DECISIONS.has(event.decision);
  return event.decision === filter;
}

export function filterActivityEvents(
  events: readonly ActivityEvent[],
  kind: ActivityKindFilter,
  decision: ActivityDecisionFilter
): ActivityEvent[] {
  return events.filter((event) => {
    if (kind !== "all" && event.kind !== kind) return false;
    return matchesActivityDecision(event, decision);
  });
}
