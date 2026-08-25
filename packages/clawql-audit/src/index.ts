export type {
  ChainVerifyResult,
  WORMAppendInput,
  WORMEntry,
  WORMEntryType,
  WORMFilter,
} from "./entry.js";
export { WORM_GENESIS_PREV_HASH } from "./entry.js";
export { AuditError } from "./errors.js";
export {
  canonicalJSON,
  generateUUIDv7,
  recomputeEntryHash,
  sealHashChainRecord,
  sha256Hex,
} from "./seal.js";
export { HashChain, HashChainLive } from "./chain.js";
export {
  MerkleBatchLayer,
  type MerkleInclusionProof,
  type MerkleRoot,
} from "./merkle.js";
export { DualAckReplicator } from "./replication/dual-ack.js";
export {
  defaultRetryConfig,
  withRetry,
  type RetryConfig,
} from "./replication/retry.js";
export { startOutboxReconciler, type ReconcilerHandle } from "./replication/reconciler.js";
export {
  createWORMAuditTrailEffect,
  makeWORMAuditTrailLayer,
  WORMAuditTrail,
  WORMAuditTrailService,
  type WORMAuditTrailConfig,
} from "./trail.js";
export {
  exportEntries,
  type ExportFormat,
  type ExportOptions,
  type ExportResult,
} from "./query/export.js";
export { applyWORMFilter, matchesWORMFilter } from "./query/filter.js";
export { exportToQR, type QRExportConfig, type QRExportResult } from "./query/qr-export.js";
export type { LocalStorageBackend, StorageBackend } from "./storage/types.js";
export { MemoryBackend } from "./storage/memory.js";
export { SQLiteBackend, type SQLiteBackendOptions } from "./storage/sqlite.js";
export { S3Backend, type S3BackendConfig } from "./storage/s3.js";
export { PostgresBackend, type PostgresBackendOptions } from "./storage/postgres.js";
export {
  verifyTEESignature,
  type TEEAttestationReport,
  type TEESigner,
} from "./tee/signer.js";
export { handleAuditHttpRequest, authorizeApiKey, type HttpRequest, type HttpResponse } from "./http/routes.js";
export { startAuditHttpServer, type AuditHttpServerHandle } from "./http/server.js";
export {
  createWormTrailConfigFromEnvEffect,
  defaultWormAgentName,
  defaultWormSessionId,
  wormEnabledFromEnv,
} from "./env-config.js";
export {
  appendProcessWorm,
  appendProcessWormEffect,
  bootProcessWormFromEnv,
  bootProcessWormFromEnvEffect,
  getProcessWormService,
  processWormBootState,
  processWormReady,
  resetProcessWormForTests,
  stopProcessWorm,
  stopProcessWormEffect,
  withProcessWormDefaults,
} from "./process-worm.js";
export {
  appendAuthEventToWormEffect,
  appendMemoryEventToWormEffect,
  appendPaymentEventToWormEffect,
  appendWebEventToWormEffect,
  createAuthEventWormSink,
  createMemoryWormSink,
  wormInputFromAuthEvent,
  wormInputFromMemoryEvent,
  wormInputFromPanguardDeny,
  wormInputFromPaymentEvent,
  wormInputFromToolAttempt,
  wormInputFromToolResult,
  wormInputFromWebEvent,
  type AuthWormEvent,
  type MemoryWormEventLike,
  type PaymentWormEventLike,
  type WebWormEventLike,
} from "./sinks.js";
