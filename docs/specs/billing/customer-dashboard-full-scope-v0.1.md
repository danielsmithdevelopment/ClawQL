---
title: "Customer Dashboard — Full Scope"
status: "September 2026"
version: "0.1"
package: "packages/clawql-payments/src/dashboard/ + existing HATEOAS surface"
---

# Customer Dashboard — Full Scope v0.1

**8.0.0 bar: complete, no visible gaps. Six sections, one topology tree.**

---

## 1. Section list

1. Plan / billing
2. API keys
3. Usage
4. **Topology** (gateways + agents, hierarchical) — replaces the flat Agents table
5. Traces (embedded existing flamegraph, not rebuilt)
6. (Command-center framing — this dashboard IS the command center, not a 7th section)

Surface: `GET /credits/org` (same auth as credits HATEOAS). Module home: [`packages/clawql-payments/src/dashboard/`](../../../packages/clawql-payments/src/dashboard/) + [`provisioning/dashboard-*.ts`](../../../packages/clawql-payments/src/provisioning/).

---

## 2. Topology data model

```typescript
interface GatewayNode {
  gatewayId: string;
  kind: "regional" | "edge";
  meshIdentity: string; // Headscale identity, existing clawql-network
  ownerDeveloper?: string; // set for 'edge' kind only
  lastSeen: string;
  status: "healthy" | "degraded" | "offline";
  children: AgentNode[];
}

interface AgentNode {
  agentId: string;
  kind: "persistent" | "cell";
  agentType?: "hermes" | "cline" | "openclaw" | "pi"; // persistent only
  cellStatus?: "resident" | "hibernating"; // cell only
  parentGatewayId: string;
  lastActive: string;
  traceLink: string; // deep-links to section 5 / mcp-ui
}
```

**One tree, two node kinds under gateways.** A regional gateway and an edge node gateway are the same `GatewayNode` shape, differentiated by `kind`. Persistent agents and celld cells are the same `AgentNode` shape, differentiated by `kind`. No separate data models for "company infra" vs "cell infra" — same reasoning as org-of-1 vs org-of-1000 being the same `Org` shape.

---

## 3. Data sources — everything reused, nothing new invented

```
GatewayNode (regional|edge) <- clawql-network GatewayRegistryService
                               (Gap A — org-scoped register + heartbeat + listMeshPeers)
AgentNode (persistent)      <- clawql-agents AgentInstanceRegistryService
                               (Gap B — register + heartbeat + listAgentInstances)
AgentNode (cell)            <- celld fleet API (bucket lease records / cell list)
traceLink                   <- existing /mcp-ui/trace/compare (+ session deep-link),
                               embedded in Traces — not rebuilt
```

No Tailscale/Headscale CLI scrape. No compensation-ledger stand-in for fleet liveness.
No new "topology service" _backend product_ — this is a pure read/aggregation view over Gap A + Gap B + celld.
Implementation: Effect `TopologyService` Tag + `aggregateTopologyFromRegistries` in `clawql-payments`
(`src/dashboard/topology-service.ts`). Spec for the registries:
[gateway-agent-registries-v0.1.md](../network/gateway-agent-registries-v0.1.md).

Tests use `topologyFixedLayer` / empty `$CLAWQL_HOME` registries — not a production snapshot override.

---

## 4. UI shape

```
Dashboard
├── Plan & Billing
├── API Keys
├── Usage
├── Topology
│   ├── [Regional Gateway: us-east-1]  ● healthy
│   │   ├── Hermes agent-042           active, 2m ago    [demo]
│   │   └── celld cell a8f2...         hibernating       [demo]
│   ├── [Regional Gateway: eu-central-1] ● healthy
│   │   └── celld cell 91bc...         resident, 4s ago  [demo]
│   └── [Edge: daniel@Mac-Mini]        ● healthy
│       ├── Cline agent-017            active, 12s ago   [demo]
│       └── Pi agent-003               offline, 3d ago   [demo]
└── Traces (demo compare until #1082; deep-linkable from any [demo] above)
```

Collapsed by default per gateway; expand to see children. Status dot on every node, gateway and agent both, so health is visible without expanding.

---

## 5. What "feels finished" requires, explicitly

- Every node in the tree shows real status, not a placeholder
- Empty states handled (new org, zero gateways yet) — not a blank page, a clear "connect your first gateway" prompt
- Topology agent links into Traces **must not lie**: until per-agent/session scoping exists ([#1082](https://github.com/danielsmithdevelopment/ClawQL/issues/1082)), label them as the compressed-vs-fat **demo** (`/mcp-ui/trace/compare` without a fake `?focus=<agentId>`). Real fix: agent/session-scoped compare (or explicit unavailable) — not silent demo swap
- No section links to a "coming soon" page
- Traces panel **embeds** the existing mcp-ui flamegraph (iframe), with WORM rows as secondary audit context

---

## Related

- [customer-provisioning-core-v0.1](./customer-provisioning-core-v0.1.md) (piece 6)
- [Operator guide](../../payments/customer-provisioning-core.md)
- Mesh: [clawql-network-v0.1](../network/clawql-network-v0.1.md)
- Cells: [clawql-celld](../../streams/clawql-celld.md) · [aws-celld-burst §8](../../streams/aws-celld-burst.md)

_Customer Dashboard Full Scope · v0.1 · September 2026_
