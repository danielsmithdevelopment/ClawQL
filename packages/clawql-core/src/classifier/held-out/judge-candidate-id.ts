/**
 * Bound frontier-judge candidateId acceptance.
 *
 * Cosmetic-only remaps may normalize wrapping quotes / case to an allowlisted
 * candidateId (same tool). Semantic remaps (label → id, suffix match) must
 * **fail** the case rather than silently re-point the judge's answer.
 */

export type JudgeCandidateRemapKind = "cosmetic" | "semantic";

export type JudgeCandidateResolveOk = {
  readonly ok: true;
  readonly candidateId: string;
  /** Present when the accepted id differs from the raw model string. */
  readonly remap: {
    readonly before: string;
    readonly after: string;
    readonly kind: "cosmetic";
  } | null;
};

export type JudgeCandidateResolveFail = {
  readonly ok: false;
  readonly raw: string;
  /**
   * When the raw string would map via label/suffix to a different tool id,
   * `wouldRemap` records that forbidden path so callers can fail closed.
   */
  readonly wouldRemap: {
    readonly before: string;
    readonly after: string;
    readonly kind: "semantic";
  } | null;
  readonly reason: "unknown" | "semantic-remap-forbidden";
};

export type JudgeCandidateResolveResult = JudgeCandidateResolveOk | JudgeCandidateResolveFail;

export type JudgeCandidateLike = {
  readonly candidateId?: string;
  readonly features?: { readonly label?: string; readonly description?: string };
};

/** Strip quotes/backticks/angle brackets the model often wraps around ids. */
export function normalizeJudgeRawId(raw: string): string {
  return raw
    .trim()
    .replace(/^[`'"<]+/, "")
    .replace(/[`'">]+$/, "")
    .trim();
}

function allowlistedIds(candidates: readonly JudgeCandidateLike[]): string[] {
  return candidates.map((c) => c.candidateId).filter((x): x is string => Boolean(x));
}

/**
 * Resolve a judge-emitted id onto the allowlist.
 *
 * Accepts only:
 * - exact allowlisted id (after quote strip)
 * - case-insensitive allowlisted id (cosmetic remap)
 *
 * Label / suffix matches are detected and returned as **fail** with
 * `wouldRemap` so the sidecar can refuse rather than count them.
 */
export function resolveJudgeCandidateId(
  raw: string,
  candidates: readonly JudgeCandidateLike[]
): JudgeCandidateResolveResult {
  const ids = allowlistedIds(candidates);
  const normalized = normalizeJudgeRawId(raw);

  if (ids.includes(normalized)) {
    const remap =
      normalized !== raw ? ({ before: raw, after: normalized, kind: "cosmetic" } as const) : null;
    return { ok: true, candidateId: normalized, remap };
  }

  const ci = ids.find((id) => id.toLowerCase() === normalized.toLowerCase());
  if (ci) {
    return {
      ok: true,
      candidateId: ci,
      remap: normalized !== ci || raw !== ci ? { before: raw, after: ci, kind: "cosmetic" } : null,
    };
  }

  const byLabel = candidates.filter(
    (c) =>
      Boolean(c.candidateId) &&
      (c.features?.label ?? "").trim().toLowerCase() === normalized.toLowerCase()
  );
  if (byLabel.length === 1 && byLabel[0]?.candidateId) {
    return {
      ok: false,
      raw,
      reason: "semantic-remap-forbidden",
      wouldRemap: {
        before: raw,
        after: byLabel[0].candidateId,
        kind: "semantic",
      },
    };
  }

  const suffix = ids.filter(
    (id) =>
      id.endsWith(`.${normalized}`) || id.toLowerCase().endsWith(`.${normalized.toLowerCase()}`)
  );
  if (suffix.length === 1) {
    return {
      ok: false,
      raw,
      reason: "semantic-remap-forbidden",
      wouldRemap: {
        before: raw,
        after: suffix[0]!,
        kind: "semantic",
      },
    };
  }

  return { ok: false, raw, reason: "unknown", wouldRemap: null };
}
