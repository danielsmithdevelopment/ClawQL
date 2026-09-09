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
GatewayNode (regional) <- clawql-network Headscale mesh registry
                          (+ ManagedGateway state when present)
GatewayNode (edge)     <- clawql-network Headscale mesh registry,
                           filtered by node type / hostname heuristics
AgentNode (persistent) <- clawql-agents catalog labels ∪ compensation ledger
AgentNode (cell)       <- celld fleet API (bucket lease records / cell list)
traceLink              <- existing /mcp-ui/trace/compare (+ session deep-link),
                           embedded in Traces — not rebuilt
```

No new "topology service" _backend product_ — this is a read/aggregation view over data sources that already exist. Implementation: Effect `TopologyService` Tag in `clawql-payments` (`src/dashboard/topology-service.ts`).

Optional ops override: `CLAWQL_TOPOLOGY_SNAPSHOT` = path to a JSON `{ gateways: GatewayNode[] }` (tests + air-gapped demos).

---

## 4. UI shape

```
Dashboard
├── Plan & Billing
├── API Keys
├── Usage
├── Topology
│   ├── [Regional Gateway: us-east-1]  ● healthy
│   │   ├── Hermes agent-042           active, 2m ago    [trace]
│   │   └── celld cell a8f2...         hibernating       [trace]
│   ├── [Regional Gateway: eu-central-1] ● healthy
│   │   └── celld cell 91bc...         resident, 4s ago  [trace]
│   └── [Edge: daniel@Mac-Mini]        ● healthy
│       ├── Cline agent-017            active, 12s ago   [trace]
│       └── Pi agent-003               offline, 3d ago   [trace]
└── Traces (deep-linkable from any [trace] above)
```

Collapsed by default per gateway; expand to see children. Status dot on every node, gateway and agent both, so health is visible without expanding.

---

## 5. What "feels finished" requires, explicitly

- Every node in the tree shows real status, not a placeholder
- Empty states handled (new org, zero gateways yet) — not a blank page, a clear "connect your first gateway" prompt
- Trace links work from every agent node, both kinds, no dead links (`/mcp-ui/trace/compare?focus=…` always resolves)
- No section links to a "coming soon" page
- Traces panel **embeds** the existing mcp-ui flamegraph (iframe), with WORM rows as secondary audit context

---

## Related

- [customer-provisioning-core-v0.1](./customer-provisioning-core-v0.1.md) (piece 6)
- [Operator guide](../../payments/customer-provisioning-core.md)
- Mesh: [clawql-network-v0.1](../network/clawql-network-v0.1.md)
- Cells: [clawql-celld](../../streams/clawql-celld.md) · [aws-celld-burst §8](../../streams/aws-celld-burst.md)

_Customer Dashboard Full Scope · v0.1 · September 2026_
