/**
 * MCP tool definitions for gateway registry (Gap A read/write).
 */

import { Effect } from "effect";
import type { ToolDefinition } from "clawql-core";
import { GatewayRegistryService, gatewayRegistryLiveLayer } from "./gateway-registry-service.js";
import type { GatewayKind } from "./types.js";

const run = <A>(program: Effect.Effect<A, never, GatewayRegistryService>, home?: string) =>
  Effect.runPromise(program.pipe(Effect.provide(gatewayRegistryLiveLayer(home))));

export const NETWORK_LIST_MESH_PEERS_TOOL = "network_list_mesh_peers";
export const NETWORK_REGISTER_GATEWAY_TOOL = "network_register_gateway";
export const NETWORK_GATEWAY_HEARTBEAT_TOOL = "network_gateway_heartbeat";

function asRecord(args: unknown): Record<string, unknown> {
  return args && typeof args === "object" ? (args as Record<string, unknown>) : {};
}

export function gatewayRegistryToolDefinitions(home?: string): readonly ToolDefinition[] {
  return [
    {
      name: NETWORK_LIST_MESH_PEERS_TOOL,
      description:
        "List org-scoped mesh gateways (regional + edge) from the clawql-network gateway registry.",
      schema: {
        type: "object",
        properties: {
          orgId: { type: "string", description: "Organization id" },
        },
        required: ["orgId"],
      },
      handler: async (args: unknown) => {
        const orgId = String(asRecord(args).orgId ?? "").trim();
        const gateways = await run(
          Effect.gen(function* () {
            const reg = yield* GatewayRegistryService;
            return yield* reg.listMeshPeers(orgId);
          }),
          home
        );
        return { content: [{ type: "text", text: JSON.stringify({ orgId, gateways }, null, 2) }] };
      },
    },
    {
      name: NETWORK_REGISTER_GATEWAY_TOOL,
      description: "Register or upsert a gateway in the org-scoped mesh registry.",
      schema: {
        type: "object",
        properties: {
          gatewayId: { type: "string" },
          orgId: { type: "string" },
          kind: { type: "string", enum: ["regional", "edge"] },
          meshIdentity: { type: "string" },
          ownerDeveloper: { type: "string" },
        },
        required: ["gatewayId", "orgId", "kind", "meshIdentity"],
      },
      handler: async (args: unknown) => {
        const a = asRecord(args);
        const kind = a.kind === "edge" ? "edge" : "regional";
        const record = await run(
          Effect.gen(function* () {
            const reg = yield* GatewayRegistryService;
            return yield* reg.registerGateway({
              gatewayId: String(a.gatewayId),
              orgId: String(a.orgId),
              kind: kind as GatewayKind,
              meshIdentity: String(a.meshIdentity),
              ownerDeveloper:
                kind === "edge" && a.ownerDeveloper ? String(a.ownerDeveloper) : undefined,
            });
          }),
          home
        );
        return { content: [{ type: "text", text: JSON.stringify(record, null, 2) }] };
      },
    },
    {
      name: NETWORK_GATEWAY_HEARTBEAT_TOOL,
      description: "Record a gateway heartbeat (updates lastSeen + status).",
      schema: {
        type: "object",
        properties: {
          gatewayId: { type: "string" },
          orgId: { type: "string" },
        },
        required: ["gatewayId", "orgId"],
      },
      handler: async (args: unknown) => {
        const a = asRecord(args);
        const record = await run(
          Effect.gen(function* () {
            const reg = yield* GatewayRegistryService;
            return yield* reg.heartbeat(String(a.gatewayId), String(a.orgId));
          }),
          home
        );
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(record ?? { error: "unknown gateway" }, null, 2),
            },
          ],
        };
      },
    },
  ];
}
