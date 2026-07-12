/**
 * PAL adaptive routing contracts (upstream Q00 v0.50.3 / epic #556).
 */

export interface ModelTierMap {
  frugal: string;
  standard: string;
  frontier: string;
}

export type ModelTier = "frugal" | "standard" | "frontier";

export type RoutingFailureKind =
  | "ac_failed"
  | "eval_below_min"
  | "drift_exceeded"
  | "nsv_below_crit"
  | "regression";

export interface RoutingFailureSignal {
  kind: RoutingFailureKind;
  detail: Record<string, unknown>;
  acIndex?: number;
  generation: number;
}

export interface PalRoutingDecision {
  tier: ModelTier;
  modelId: string;
  retryAttempt: number;
  escalatedFrom?: ModelTier;
  trigger?: RoutingFailureSignal;
  tokenAttribution?: { input: number; output: number };
}

export interface AdaptiveRouter {
  initialTier(ctx: { isDecomposedChild: boolean; seedId: string }): PalRoutingDecision;
  escalate(decision: PalRoutingDecision, signal: RoutingFailureSignal): PalRoutingDecision;
  shouldTriggerMoa(
    pal: PalRoutingDecision,
    signals: RoutingFailureSignal[],
    drift?: { combined: number },
  ): boolean;
}
