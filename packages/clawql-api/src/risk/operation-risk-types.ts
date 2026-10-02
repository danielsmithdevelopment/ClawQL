/**
 * Spec-derived operation risk (v0.1).
 * @see docs/specs/risk/operation-risk-from-spec-v0.1.md
 */

/** Aligns with ontology kinetic_level / ChatGPT mandate ladder (LOW unused on forms). */
export type OperationRiskLevel = "LOW" | "MEDIUM" | "HIGH";

/** Gate applied at execute time. */
export type OperationRiskPolicy = "allow" | "mandate" | "block";

/** Provenance of the assigned risk. */
export type OperationRiskSource =
  | "spec-default"
  | "mcp-annotation"
  | "override"
  | "unknown-default";

export type OperationRisk = {
  readonly level: OperationRiskLevel;
  readonly policy: OperationRiskPolicy;
  readonly source: OperationRiskSource;
  readonly reason: string;
};

/** Hints attached during load; used by the classifier then kept for audit clarity. */
export type OperationRiskHints = {
  readonly mcpReadOnlyHint?: boolean;
  readonly mcpDestructiveHint?: boolean;
  readonly mcpSourceId?: string;
  readonly grpcNoSideEffects?: boolean;
};

export type OperationRiskOverride = {
  readonly policy: OperationRiskPolicy;
  readonly level?: OperationRiskLevel;
  readonly reason: string;
};

export type OperationRiskConfigFile = {
  readonly version: 1;
  readonly trustedMcpSources?: readonly string[];
  readonly overrides?: Readonly<Record<string, OperationRiskOverride>>;
};

export function emptyOperationRiskConfig(): OperationRiskConfigFile {
  return { version: 1, trustedMcpSources: [], overrides: {} };
}

export function levelForPolicy(policy: OperationRiskPolicy): OperationRiskLevel {
  if (policy === "allow") return "LOW";
  if (policy === "block") return "HIGH";
  return "MEDIUM";
}
