export {
  DEFAULT_MODEL_IDENTITY_TABLE,
  extractVendorHint,
  identifyModel,
  identifyModelEffect,
  type IdentityEntry,
  type ModelIdentity,
} from "./identity.js";

export {
  FEDERAL_DEFAULT_ALLOWED_VENDORS,
  loadModelProvenancePolicy,
  loadModelProvenancePolicyEffect,
  ModelProvenancePolicyService,
  modelProvenancePolicyLiveLayer,
  type ModelProvenancePolicy,
  type ProvenanceMode,
  type ProvenanceProfile,
} from "./policy.js";

export {
  ModelProvenanceDeniedError,
  ModelProvenanceGateService,
  assertModelProvenanceEffect,
  assertModelProvenanceFromEnvEffect,
  evaluateModelProvenanceEffect,
  isModelProvenanceDeniedError,
  modelProvenanceGateLiveLayer,
  type ProvenanceDecision,
} from "./gate.js";

export {
  ProvenanceGuardedInferenceGateway,
  withModelProvenance,
  type WithModelProvenanceOptions,
} from "./provenance-gateway.js";

export {
  buildModelProvenanceComplianceReport,
  buildModelProvenanceComplianceReportEffect,
  type ModelProvenanceComplianceReport,
  type ProvenanceServedModel,
} from "./compliance-report.js";
