/**
 * Unified Capability Lifecycle — types (spec v0.2 §3.5).
 * Three-bucket exclusive execute() reachability contract for clawql-core.
 */

/** ATR scope tokens bound at session start (or after explicit rebind). */
export type AtrScopeTokens = ReadonlySet<string>;

/** Bucket 1: tools bound at session start; frozen unless rebind. */
export type SessionCatalog = {
  readonly sessionId: string;
  readonly atrScope: AtrScopeTokens;
  /** Tool names / ATR tokens in the session catalog (subset of atrScope). */
  readonly tools: ReadonlySet<string>;
  readonly boundAt: string;
  readonly rebindGeneration: number;
};

/** Execute allow buckets only — sandbox is not an execute() identity (§3.5). */
export type CapabilityBucket = "session_catalog" | "gated_skill";

export type CapabilityInterceptKind = "register" | "invoke";

export type CapabilityInterceptDisposition = "routed_to_sandbox" | "denied";

export type ExecuteReachabilityAllow = {
  readonly allow: true;
  readonly bucket: "session_catalog" | "gated_skill";
  readonly toolName: string;
  readonly sessionId: string;
};

export type ExecuteReachabilityDeny = {
  readonly allow: false;
  readonly toolName: string;
  readonly sessionId: string;
  readonly interceptKind: CapabilityInterceptKind;
  readonly disposition: CapabilityInterceptDisposition;
  readonly reason: string;
};

export type ExecuteReachabilityDecision = ExecuteReachabilityAllow | ExecuteReachabilityDeny;

/** Bucket 3: gated skill with PROMOTION_ACCEPTED; validatedScope ⊆ S. */
export type PromotedSkillRecord = {
  readonly skillId: string;
  /** Scope tokens this skill may use — must be ⊆ session ATR. */
  readonly validatedScope: readonly string[];
  readonly acceptedAt: string;
  readonly wormRef?: string;
};

export type SessionCatalogRebindInput = {
  readonly sessionId: string;
  readonly newTools: readonly string[];
  /** Defaults to prior atrScope; widening requires explicit grant tokens. */
  readonly newAtrScope?: readonly string[];
  /**
   * Separate human-authorized scope grant beyond prior S.
   * Never implied by connecting an MCP server (spec §3.5.2).
   */
  readonly explicitWiderScopeGrant?: readonly string[];
  readonly authorizedBy: string;
};

export type RegisterInterceptReport = {
  readonly sessionId: string;
  readonly toolName: string;
  readonly harnessId: string;
  readonly mechanism:
    "tool_registry_mutation" | "plugin_load_callback" | "filesystem_watch" | "unspecified";
};
