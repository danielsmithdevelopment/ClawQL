export { ObservabilityError } from "./errors.js";

export type {
  FaroExceptionEvent,
  FaroExceptionFrame,
  FaroExceptionPayload,
} from "./fingerprint.js";
export { createErrorFingerprint, createErrorFingerprintEffect, normaliseErrorMessage } from "./fingerprint.js";

export {
  defaultLgtmPlusHelmValues,
  readObservabilityProfile,
  readObservabilityProfileEffect,
} from "./config.js";

export type {
  LgtmPlusComponent,
  LgtmPlusComponentConfig,
  LgtmPlusHelmValues,
  LgtmPlusLocalEndpoints,
  LokiConfig,
  MimirConfig,
  ObservabilityProfileConfig,
} from "./types.js";

export {
  defaultLocalEndpoints,
  packagePaths,
  resolvePackagePath,
  resolvePackagePathEffect,
} from "./paths.js";
