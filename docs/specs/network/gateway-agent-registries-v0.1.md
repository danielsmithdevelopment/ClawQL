---
title: "Gateway & Agent Registries — Real Backend for Topology"
status: "September 2026"
version: "0.1"
package: "packages/clawql-network/ (Gap A) + packages/clawql-agents/ (Gap B)"
---

# Gateway & Agent Registries — v0.1

**Confirmed gap. Building for real, not deferring. Topology tree depends on both.**

---

## Gap A — Gateway Registry (clawql-network)

### Current state

`network.json` = one node's own enrollment. `joinMesh` discarded peer inventory after finding Self. No fleet-wide store.

### What ships

```typescript
interface GatewayRecord {
  gatewayId: string
  orgId: string
  kind: 'regional' | 'edge'
  meshIdentity: string          // existing Headscale identity, unchanged
  ownerDeveloper?: string       // edge only
  lastSeen: string
  status: 'healthy' | 'degraded' | 'offline'
}

// Effect Tag: GatewayRegistryService
registerGateway(record: Omit<GatewayRecord, 'lastSeen' | 'status'>): Effect<GatewayRecord>
heartbeat(gatewayId: string, orgId: string): Effect<GatewayRecord | null>
listMeshPeers(orgId: string): Effect<GatewayRecord[]>
```

**Persistence:** org-scoped store under `$CLAWQL_HOME/network/registry/orgs/<orgId>/gateways.json` (control-plane / shared home — not the per-node `network.json` enrollment file). `joinMesh` calls `registerGateway` when `orgId` is provided (options or `CLAWQL_ORG_ID`). Each gateway calls `heartbeat` on an interval; `status` derives from heartbeat recency (`degraded` after 1 missed interval window, `offline` after 2).

**Read surface:** `listMeshPeers` via Effect API + HTTP (`attachGatewayRegistryRoutes`) + MCP tool `network_list_mesh_peers`. Org-scoped; bearer `CLAWQL_NETWORK_REGISTRY_TOKEN` or existing credits-style public gate for local demos — not a new auth product.

---

## Gap B — Persistent Agent Registry (clawql-agents)

### Current state

`IMPLEMENTED_AGENTS`/`getAdapterBundle` = adapter-type catalog. `AgentAdapter.health()` = single-process check. No live-instance store. Compensation ledger = money, not liveness.

### What ships

```typescript
interface AgentInstanceRecord {
  agentId: string
  agentType: 'hermes' | 'cline' | 'openclaw' | 'pi'
  parentGatewayId: string        // references GatewayRecord from Gap A
  orgId: string
  lastActive: string
  status: 'active' | 'idle' | 'offline'
}

// Effect Tag: AgentInstanceRegistryService
registerAgentInstance(...): Effect<AgentInstanceRecord>
heartbeat(agentId: string, orgId: string): Effect<AgentInstanceRecord | null>
listAgentInstances(orgId: string): Effect<AgentInstanceRecord[]>
```

**Wiring:** `AgentAdapter.start()` calls `registerAgentInstance` when config includes `orgId` + `parentGatewayId` and `agentType` is one of the four persistent types. `health()` feeds `heartbeat`. Compensation ledger untouched.

**Persistence:** `$CLAWQL_HOME/agents/registry/orgs/<orgId>/instances.json`.

---

## Topology now genuinely is aggregation

Once A and B exist:

```
GatewayNode (regional|edge) <- listMeshPeers(orgId)      [Gap A, real]
AgentNode (persistent)      <- listAgentInstances(orgId)  [Gap B, real]
AgentNode (cell)            <- celld fleet API             [already real]
traceLink                   <- /mcp-ui/trace/compare        [already real]
```

Four real sources, zero heuristic scraping, zero ledger-as-stand-in.

### Build order

1. Gap A — this package slice
2. Gap B — this package slice
3. Rebuild `TopologyService` against A + B + celld (aggregation only)
4. Topology tree UI — **only after** 1–3 (do not repeat the premature-UI mistake)

---

## Related

- [customer-dashboard-full-scope-v0.1](../billing/customer-dashboard-full-scope-v0.1.md)
- [clawql-network-v0.1](./clawql-network-v0.1.md)

*Gateway & Agent Registries · v0.1 · September 2026*
