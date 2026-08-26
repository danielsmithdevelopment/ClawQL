export type { BackendAck, WORMAppendInput, WORMEntry, WORMEntryType, WORMFilter } from "./entry.js";
export { AuditError, WormChainGapError, WormStorageError } from "./errors.js";
export { MerkleBatchLayer } from "./merkle.js";
export { DualAckReplicator } from "./replication/dual-ack.js";
export { createFailingRemoteBackend, createMemoryBackend } from "./storage/memory.js";
export { openSqliteBackend } from "./storage/sql-js.js";
export type { SqliteBackendHandle } from "./storage/sql-js.js";
export type { StorageBackend } from "./storage/types.js";
export { WORMAuditTrail, createWORMAuditTrail, makeWORMAuditTrailLayer } from "./trail.js";
export type { WORMAuditTrailConfig } from "./trail.js";
export {
  appendProcessWorm,
  appendProcessWormEffect,
  bootProcessWormFromEnvEffect,
  resetProcessWormForTests,
} from "./process-worm.js";
export {
  appendAuthEventToWormEffect,
  appendInferenceAuditEntryToWormEffect,
  appendInferenceCallToWormEffect,
  appendInferenceResultToWormEffect,
  appendMemoryEventToWormEffect,
  appendPaymentEventToWormEffect,
  appendWebEventToWormEffect,
  createAuthEventWormSink,
  createMemoryWormSink,
  wormInputFromAuthEvent,
  wormInputFromInferenceAuditEntry,
  wormInputFromInferenceCall,
  wormInputFromInferenceResult,
  wormInputFromMemoryEvent,
  wormInputFromPanguardAllow,
  wormInputFromPanguardDeny,
  wormInputFromPaymentEvent,
  wormInputFromToolAttempt,
  wormInputFromToolResult,
  wormInputFromWebEvent,
  type AuthWormEvent,
  type InferenceAuditEntryLike,
  type InferenceCallLike,
  type InferenceResultLike,
  type MemoryWormEventLike,
  type PaymentWormEventLike,
  type WebWormEventLike,
} from "./sinks.js";
export {
  verifyTEESignature,
  createEcdsaTeeSigner,
  createSimulatedTeeSigner,
  generateTeeKeyPairPem,
  signEntryHashEcdsa,
  verifyEntryHashEcdsa,
  TEE_ECDSA_CURVE,
  type TEEAttestationReport,
  type TEESigner,
  type TEEKeyPairPem,
  type CreateEcdsaTeeSignerOptions,
  type VerifyTeeSignatureResult,
} from "./tee/signer.js";
