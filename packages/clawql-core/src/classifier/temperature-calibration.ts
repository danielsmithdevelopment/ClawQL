/**
 * Temperature / margin calibration for Fast Decision confidences (§7).
 *
 * GLiNER2 multi-label classify often returns near-one-hot peaks (~0.9999).
 * Aggregate accuracy can be fine while mean calibration error fails because
 * wrong answers are equally peaked. Temperature scaling maps those peaks
 * toward the empirical accuracy so bucket midpoints align with hit rate.
 *
 * Integrity: fit on a calibration suite (e.g. Harvey), evaluate on a frozen
 * held-out suite (e.g. v0.3). Never cite T fit on the eval set as held-out lift.
 */

import { Context, Effect, Layer } from "effect";
import type { FastDecisionScore } from "./types.js";
import {
  DEFAULT_VALIDATION_CRITERIA,
  evaluateCorrectnessAndCalibration,
  type ValidationCriteria,
} from "./validation.js";

export type CalibrationMode =
  "none" | "temperature_softmax" | "temperature_sigmoid" | "margin" | "temperature_margin";

export type CalibrationTransform = {
  readonly mode: CalibrationMode;
  /** Temperature T > 0. T=1 is identity for temperature_* modes. */
  readonly temperature: number;
};

export type CalibrationConfig = CalibrationTransform & {
  /** When true, apply transform in the live scorer path. */
  readonly enabled: boolean;
};

const EPS = 1e-6;

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function logit(p: number): number {
  const x = Math.min(1 - EPS, Math.max(EPS, p));
  return Math.log(x / (1 - x));
}

function sigmoid(z: number): number {
  if (z >= 0) {
    const e = Math.exp(-z);
    return 1 / (1 + e);
  }
  const e = Math.exp(z);
  return e / (1 + e);
}

function softmax(logits: readonly number[]): number[] {
  const max = Math.max(...logits);
  const exps = logits.map((l) => Math.exp(l - max));
  const sum = exps.reduce((a, b) => a + b, 0) || 1;
  return exps.map((e) => e / sum);
}

/**
 * Apply a calibration transform to a score vector.
 * Argmax is preserved for temperature_* and margin modes (confidence only changes),
 * except temperature_softmax which re-normalizes the full distribution (argmax
 * preserved when relative logit order is unchanged — always true for positive T).
 */
export function applyCalibrationToScores(
  scores: readonly FastDecisionScore[],
  transform: CalibrationTransform
): readonly FastDecisionScore[] {
  if (scores.length === 0) return scores;
  const T = transform.temperature > 0 ? transform.temperature : 1;
  const mode = transform.mode;
  if (mode === "none") return scores;
  if ((mode === "temperature_softmax" || mode === "temperature_sigmoid") && T === 1) {
    return scores;
  }

  if (mode === "temperature_sigmoid") {
    return scores
      .map((s) => ({
        candidateId: s.candidateId,
        confidence: clamp01(sigmoid(logit(s.confidence) / T)),
      }))
      .sort((a, b) => b.confidence - a.confidence);
  }

  if (mode === "temperature_softmax") {
    const logits = scores.map((s) => Math.log(Math.min(1 - EPS, Math.max(EPS, s.confidence))));
    const probs = softmax(logits.map((l) => l / T));
    return scores
      .map((s, i) => ({
        candidateId: s.candidateId,
        confidence: clamp01(probs[i] ?? 0),
      }))
      .sort((a, b) => b.confidence - a.confidence);
  }

  if (mode === "margin" || mode === "temperature_margin") {
    const sorted = [...scores].sort((a, b) => b.confidence - a.confidence);
    const top = sorted[0]!;
    const second = sorted[1]?.confidence ?? 0;
    let margin = clamp01(top.confidence - second);
    if (mode === "temperature_margin") {
      margin = clamp01(sigmoid(logit(Math.max(margin, EPS)) / T));
    }
    return scores
      .map((s) =>
        s.candidateId === top.candidateId
          ? { candidateId: s.candidateId, confidence: margin }
          : { candidateId: s.candidateId, confidence: 0 }
      )
      .sort((a, b) => b.confidence - a.confidence);
  }

  return scores;
}

export type FitCase = {
  readonly groundTruthCandidateId: string;
  readonly scores: readonly FastDecisionScore[];
};

export type FitTemperatureResult = {
  readonly temperature: number;
  readonly mode: CalibrationMode;
  readonly meanCalibrationError: number;
  readonly rawAccuracy: number;
  readonly passed: boolean;
};

/**
 * Grid-search temperature minimizing MCE on the fit set (accuracy secondary).
 * Mode `margin` ignores temperature grid (uses T=1).
 */
export function fitTemperatureByGrid(args: {
  readonly cases: readonly FitCase[];
  readonly mode: CalibrationMode;
  readonly temperatures?: readonly number[];
  readonly criteria?: ValidationCriteria;
  readonly useSiteId?: string;
}): Effect.Effect<FitTemperatureResult> {
  return Effect.sync(() => {
    const temps =
      args.mode === "margin"
        ? [1]
        : (args.temperatures ?? [0.5, 1, 1.5, 2, 3, 5, 8, 10, 15, 20, 30, 50]);
    const criteria = args.criteria ?? DEFAULT_VALIDATION_CRITERIA;
    const useSiteId = args.useSiteId ?? "calibration_fit";

    let best: FitTemperatureResult | undefined;
    for (const T of temps) {
      const transform: CalibrationTransform = { mode: args.mode, temperature: T };
      const held = args.cases.map((c, i) => ({
        caseId: `fit-${i}`,
        groundTruthCandidateId: c.groundTruthCandidateId,
        scores: applyCalibrationToScores(c.scores, transform),
      }));
      const cal = evaluateCorrectnessAndCalibration(useSiteId, held, criteria);
      const row: FitTemperatureResult = {
        temperature: T,
        mode: args.mode,
        meanCalibrationError: cal.meanCalibrationError,
        rawAccuracy: cal.rawAccuracy,
        passed: cal.passed,
      };
      if (
        !best ||
        row.meanCalibrationError < best.meanCalibrationError - 1e-12 ||
        (Math.abs(row.meanCalibrationError - best.meanCalibrationError) < 1e-12 &&
          row.rawAccuracy > best.rawAccuracy)
      ) {
        best = row;
      }
    }
    return (
      best ?? {
        temperature: 1,
        mode: args.mode,
        meanCalibrationError: 1,
        rawAccuracy: 0,
        passed: false,
      }
    );
  });
}

/** Read calibration config from env (call-time; tests may mutate process.env). */
export function readCalibrationConfigFromEnv(): CalibrationConfig {
  const enabledRaw = process.env.CLAWQL_FAST_DECISION_CALIBRATION?.trim().toLowerCase();
  // Default ON — GLiNER2 multi-label peaks fail §7 MCE without temperature scaling.
  // Opt out: CLAWQL_FAST_DECISION_CALIBRATION=0|false|off|no
  const disabled =
    enabledRaw === "0" || enabledRaw === "false" || enabledRaw === "off" || enabledRaw === "no";
  const enabled = !disabled;
  const modeRaw = (process.env.CLAWQL_FAST_DECISION_CALIBRATION_MODE?.trim() ||
    "temperature_softmax") as CalibrationMode;
  const mode: CalibrationMode = [
    "none",
    "temperature_softmax",
    "temperature_sigmoid",
    "margin",
    "temperature_margin",
  ].includes(modeRaw)
    ? modeRaw
    : "temperature_softmax";
  const tRaw = process.env.CLAWQL_FAST_DECISION_CALIBRATION_TEMPERATURE?.trim();
  // Frozen T=4: refit on fit-routing-v0.1 (v0.3+Harvey routing, n=41).
  // Prior Harvey-only freeze was T=3 — superseded by FIT_TAU_FREEZE_v0.1.md.
  const temperature = tRaw ? Number(tRaw) : 4;
  return {
    enabled,
    mode: enabled ? mode : "none",
    temperature: Number.isFinite(temperature) && temperature > 0 ? temperature : 4,
  };
}

export class FastDecisionCalibrationService extends Context.Tag(
  "clawql/FastDecisionCalibrationService"
)<
  FastDecisionCalibrationService,
  {
    readonly getConfig: () => Effect.Effect<CalibrationConfig>;
    readonly apply: (
      scores: readonly FastDecisionScore[]
    ) => Effect.Effect<readonly FastDecisionScore[]>;
    readonly fitTemperature: (args: {
      readonly cases: readonly FitCase[];
      readonly mode: CalibrationMode;
      readonly temperatures?: readonly number[];
      readonly criteria?: ValidationCriteria;
    }) => Effect.Effect<FitTemperatureResult>;
  }
>() {}

export function makeFastDecisionCalibrationLive(
  config: CalibrationConfig = readCalibrationConfigFromEnv()
): Layer.Layer<FastDecisionCalibrationService> {
  return Layer.succeed(FastDecisionCalibrationService, {
    getConfig: () => Effect.sync(() => config),
    apply: (scores) =>
      Effect.sync(() =>
        config.enabled && config.mode !== "none" ? applyCalibrationToScores(scores, config) : scores
      ),
    fitTemperature: (args) => fitTemperatureByGrid(args),
  });
}

export const FastDecisionCalibrationLive: Layer.Layer<FastDecisionCalibrationService> =
  Layer.suspend(() => makeFastDecisionCalibrationLive(readCalibrationConfigFromEnv()));
