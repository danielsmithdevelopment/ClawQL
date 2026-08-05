/**
 * Reasoning Trace Protocol (RTP) — inner structure wrapped by OpenBenchTrace.
 * Domain-agnostic six-node sequence with consent provenance and turn hashing.
 */
export const RTP_PROTOCOL = "rtp" as const;
export const RTP_PROTOCOL_VERSION = "0.1" as const;

export type RtpNodeKind =
  | "intent"
  | "retrieval"
  | "reasoning"
  | "execution"
  | "delta"
  | "verdict";

export type RtpEvaluatorTier = 1 | 2 | 3;

export type RtpConsentToken = {
  /** Compact JWT (HS256). May be redacted to `[REDACTED_CONSENT_JWT]` after scrub. */
  token: string;
  scopes: string[];
  issuedAt: string;
  issuer: string;
  subject: string;
};

export type RtpIntentPayload = {
  rawPrompt: string;
  parsedGoal: string;
};

export type RtpRetrievalPayload = {
  queries: string[];
  sources: string[];
  tool?: string;
};

export type RtpReasoningPayload = {
  seedChain: string[];
  selectedTool?: string;
};

export type RtpExecutionPayload = {
  toolName: string;
  payload?: unknown;
  output?: unknown;
};

export type RtpDeltaPayload = {
  stateBeforeHash: string;
  stateAfterHash: string;
};

export type RtpVerdictPayload = {
  outcome: "pass" | "fail" | "partial";
  evaluatorTier: RtpEvaluatorTier;
  source: "grader";
  graderId: string;
  score: number;
};

export type RtpTurnNode = {
  kind: RtpNodeKind;
  turnIndex: number;
  /** SHA-256 of canonical node body + prevTurnHash (Appendix A–style chaining). */
  turnHash: string;
  prevTurnHash: string | null;
  intent?: RtpIntentPayload;
  retrieval?: RtpRetrievalPayload;
  reasoning?: RtpReasoningPayload;
  execution?: RtpExecutionPayload;
  delta?: RtpDeltaPayload;
  verdict?: RtpVerdictPayload;
};

export type RtpSession = {
  protocol: typeof RTP_PROTOCOL;
  protocolVersion: typeof RTP_PROTOCOL_VERSION;
  consentToken: RtpConsentToken;
  turnSequence: RtpTurnNode[];
  /** Convenience mirror of the terminal Verdict node. */
  verdict: RtpVerdictPayload;
};
