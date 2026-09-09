export type {
  GatewayKind,
  GatewayRecord,
  GatewayStatus,
  RegisterGatewayInput,
} from "./types.js";
export {
  GATEWAY_DEGRADED_AFTER_MISSED,
  GATEWAY_HEARTBEAT_INTERVAL_MS,
  GATEWAY_OFFLINE_AFTER_MISSED,
} from "./types.js";
export {
  GatewayRegistryService,
  gatewayRegistryLiveLayer,
  gatewayRegistryMemoryLayer,
  gatewayRegistryPath,
  statusFromLastSeen,
  type GatewayRegistryFile,
} from "./gateway-registry-service.js";
export { attachGatewayRegistryRoutes } from "./http.js";
export { startGatewayHeartbeatLoop, type GatewayHeartbeatHandle } from "./heartbeat-loop.js";
export {
  gatewayRegistryToolDefinitions,
  NETWORK_GATEWAY_HEARTBEAT_TOOL,
  NETWORK_LIST_MESH_PEERS_TOOL,
  NETWORK_REGISTER_GATEWAY_TOOL,
} from "./mcp-tools.js";
