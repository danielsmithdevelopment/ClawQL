import { Effect } from "effect";

/**
 * Independently authored allow-sets (mesh vs ATR). Drift detection only —
 * never generate one from the other.
 */

export type PolicyAllowSet = ReadonlySet<string>;

export type MeshAtrDriftKind = "over_restricts" | "under_restricts";

export type MeshAtrDriftFinding = {
  readonly kind: MeshAtrDriftKind;
  readonly identity: string;
  readonly detail: string;
};

export type MeshAtrDriftReport = {
  readonly ok: boolean;
  readonly findings: readonly MeshAtrDriftFinding[];
};

/**
 * Compare hand-authored mesh allow identities to ATR allow identities.
 * - under_restricts: mesh allows what ATR would deny
 * - over_restricts: mesh blocks what ATR would allow
 */
export const detectMeshAtrDrift = (
  meshAllows: PolicyAllowSet,
  atrAllows: PolicyAllowSet
): Effect.Effect<MeshAtrDriftReport> =>
  Effect.sync(() => {
    const findings: MeshAtrDriftFinding[] = [];
    for (const id of meshAllows) {
      if (!atrAllows.has(id)) {
        findings.push({
          kind: "under_restricts",
          identity: id,
          detail:
            "mesh allows identity that ATR scopes would deny — mesh layer not independent coverage for this path",
        });
      }
    }
    for (const id of atrAllows) {
      if (!meshAllows.has(id)) {
        findings.push({
          kind: "over_restricts",
          identity: id,
          detail:
            "mesh blocks identity that ATR scopes would allow — may break legitimate traffic",
        });
      }
    }
    return { ok: findings.length === 0, findings };
  });
