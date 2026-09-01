export {
  createDevTeeIdJagSigner,
  createTeeIdJagSignerBridge,
  type TeeIdJagSignerOptions,
  type TeeSignFn,
} from "./bridge.js";
export {
  createHardwarePlatformAdapter,
  createSimulatedPlatformAdapter,
  resolveTeePlatformFromEnv,
  teeStrictFromEnv,
  TeePlatformError,
  type ResolveTeePlatformFromEnvOptions,
  type SimulatedPlatformAdapterOptions,
  type TeeAttestationSnapshot,
  type TeePlatformAdapter,
  type TeePlatformId,
} from "./platform.js";
export {
  createIdJagSignerFromEnvEffect,
  createIdJagSignerFromPlatform,
  createSimulatedIdJagSigner,
} from "./id-jag.js";
