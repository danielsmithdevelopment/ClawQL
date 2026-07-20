/**
 * Minimal ATR gate for LOW ontology kinetic writes (essay gap 3.3).
 * Deliberately lightweight — full Panguard JWT is not required for v1 demo.
 */

export type KineticAtrClaims = {
  sub?: string;
  role?: string;
  scope?: string[];
};

export type KineticAtrDecision = {
  allowed: boolean;
  reason: string;
};

/**
 * Allow when scope includes `*` or `ontology:write`, or role is `admin`.
 * Deny empty / read-only scopes.
 */
export function checkKineticWriteAllowed(claims: KineticAtrClaims | null | undefined): KineticAtrDecision {
  if (!claims) {
    return { allowed: false, reason: "missing_atr_claims" };
  }
  const scope = claims.scope ?? [];
  if (scope.includes("*") || scope.includes("ontology:write")) {
    return { allowed: true, reason: "scope_ok" };
  }
  if (String(claims.role ?? "").toLowerCase() === "admin") {
    return { allowed: true, reason: "admin_role" };
  }
  return { allowed: false, reason: "insufficient_scope" };
}

/** Resolve claims for demo/runtime: env override, else permissive admin when noAuth-like. */
export function resolveKineticAtrClaimsForRuntime(): KineticAtrClaims {
  const raw = process.env.CLAWQL_ONTOLOGY_ATR_SCOPE?.trim();
  if (raw) {
    return {
      sub: process.env.CLAWQL_ONTOLOGY_ATR_SUB?.trim() || "env",
      role: process.env.CLAWQL_ONTOLOGY_ATR_ROLE?.trim() || "agent",
      scope: raw.split(/[,\s]+/).filter(Boolean),
    };
  }
  // Match gateway noAuth default — local demos work without JWT.
  return { sub: "local", role: "admin", scope: ["*"] };
}
