export { IsolationBackendError, IsolationBackendService } from "./interface.js";
export {
  collectIsolationHostEvidence,
  collectIsolationHostEvidenceEffect,
  evidencePayloadDigest,
  evidencePayloadDigestEffect,
  type IsolationHostEvidence,
} from "./host-evidence.js";
export {
  DEFAULT_GATEWAY_PROBES,
  runIsolationConformanceEffect,
  type IsolationConformanceReport,
} from "./conformance.js";
export {
  ISOLATION_BACKEND_PINS,
  ISOLATION_OSI_LICENSE_ALLOWLIST,
  auditIsolationBackendLicenses,
  auditIsolationBackendLicensesEffect,
  getIsolationBackendPin,
  getIsolationBackendPinEffect,
  listIsolationBackendPinsEffect,
  type IsolationBackendPin,
  type IsolationLicenseAuditResult,
  type OsiLicenseId,
} from "./license-registry.js";
export {
  createMockOpenIsolationLayer,
  createMockFirecrackerLayer,
  createMockGvisorLayer,
  createMockAppleContainerLayer,
  createMockLimaLayer,
  type MockIsolationBackendOptions,
} from "./mock-backend.js";
export {
  CallRecordReplayService,
  RecordReplayError,
  createCallRecordReplayLayer,
  digestOutboundCallEffect,
  assertReplaySpikeDoneEffect,
  type CallDigest,
  type RecordedCall,
  type ReplayMode,
  type ReplayOutcome,
} from "./record-replay.js";
export {
  TrialCheckpointService,
  TrialCheckpointError,
  createTrialCheckpointLayer,
  forkPilotTrialsEffect,
  type TrialArm,
  type TrialCheckpoint,
} from "./trial-checkpoint.js";
export {
  GATEWAY_BYPASS_PROBES,
  runGatewayBypassProbesEffect,
  assertNoGatewayBypassEffect,
  type GatewayBypassReport,
} from "./gateway-bypass.js";
export type {
  IsolationAdmitRequest,
  IsolationBackendCapabilities,
  IsolationBackendId,
  IsolationEscapeProbe,
  IsolationEscapeProbeKind,
  IsolationEscapeProbeResult,
  IsolationExecInput,
  IsolationExecResult,
  IsolationSession,
  IsolationSessionState,
  IsolationSnapshot,
  IsolationTier,
} from "./types.js";
