export { NetworkNotImplementedError } from "./errors.js";
export {
  TAILCAT_CONNECT_TOOL_PATTERN,
  TAILCAT_EPHEMERAL_ATR_SCOPE,
} from "./enforcement/constants.js";
export { tailcatConnectHook } from "./enforcement/tailcat-connect-hook.js";
export { bootstrapHeadscale, type HeadscaleBootstrapConfig } from "./headscale/bootstrap.js";
export { joinMesh, type MeshIdentity } from "./headscale/node-registration.js";
export {
  initNetworking,
  type InitNetworkingOptions,
  type InitNetworkingResult,
} from "./init/clawql-network-init.js";
export {
  EPHEMERAL_DURATION_THRESHOLD_MS,
  selectTransport,
  type ConnectionRequest,
  type ConnectionTargetType,
  type NetworkTransport,
} from "./selector.js";
export {
  startSelfHostedDerper,
  type DerperHandle,
} from "./tailcat/derp-relay/self-hosted-derper.js";
export {
  connectViaTailcat,
  startTailcatListener,
  type TailcatConnection,
  type TailcatListenerHandle,
  type TailcatListenerOptions,
} from "./tailcat/tailcat-adapter.js";
export type {
  MeshNodeAuditPayload,
  NetworkWORMEntryType,
  TailcatConnectionAuditPayload,
} from "./types/worm.js";
export {
  NetworkTransportService,
  NetworkTransportServiceLive,
  runNetworkTransportEffect,
} from "./effect/network-transport-service.js";
