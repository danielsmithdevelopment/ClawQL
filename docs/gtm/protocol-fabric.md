# ClawQL Protocol Fabric

**Status:** Positioning (shipped pieces exist; name is the combined claim)  
**Date:** August 2026  
**Depends on:** ClawQL Core (`search` / `execute`) · [`mcp-api-adapter`](../mcp/mcp-api-adapter.md) · [`mcp-grpc-transport`](../../packages/mcp-grpc-transport/)

---

## One-liner

**ClawQL’s Protocol Fabric connects any protocol to any other protocol with MCP as the common intermediate representation.**

Not a gateway product name for one port — the **bidirectional** protocol translation layer formed by Core + `mcp-api-adapter`.

---

## Both directions

```text
Any input protocol
  CLI · OpenAPI · GraphQL · gRPC · WebSocket* · MCP
           │
           ▼
    ClawQL Core (→ MCP)
           │
           ▼
      MCP (common IR)
           │
           ▼
  mcp-api-adapter (MCP →)
           │
           ▼
Any output protocol
  CLI · OpenAPI · GraphQL · gRPC · WebSocket* · MCP
```

\* WebSocket as a first-class adapter surface is **planned** (sixth surface; DO-native). ClawQL Streams covers WebSocket as an **event source** into Core — see [`design/clawql-streams.md`](../design/clawql-streams.md).

| Direction | Package | Claim |
| --------- | ------- | ----- |
| **Any API → MCP** | ClawQL Core | Agents discover and call upstream REST / GraphQL / gRPC / CLI via MCP tools |
| **MCP → any API** | `mcp-api-adapter` | Wrap **any** MCP server (any language) and expose OpenAPI, GraphQL, `/mcp`, gRPC, gen-cli |

Together: gRPC service ↔ GraphQL consumer, CLI ↔ REST, OpenAPI ↔ gRPC, WebSocket stream ↔ MCP tools — **any combination, either direction**.

---

## Why “Protocol Fabric” (not two package names)

Marketing and GTM need a **single** claim. Explaining “Core plus mcp-api-adapter” every time buries the product.

**Use:** “ClawQL Protocol Fabric — MCP as the connective tissue between protocols.”  
**Avoid:** Calling Core an “OpenAPI gateway” or the adapter “the OpenAPI gateway” without direction — those collide.

---

## Competitive framing

| Alternative | What it does | Gap |
| ----------- | ------------ | --- |
| **mcpo** (Open WebUI) | MCP → OpenAPI only (Python) | One surface, one direction |
| **Kong / Apigee** | Classic protocol translation | No MCP IR, not agent-native |
| **APIAgent / OpenAPI→MCP proxies** | APIs → MCP | Inverse of the adapter; not multi-surface outward |

Nobody else ships **both directions** with MCP as IR and the full multi-surface outward adapter in one product story.

### ESB analogy (GTM optional)

Enterprise Service Buses reduced N×M integrations to N+M via a common bus. Protocol Fabric is the agent-era analogue: **MCP is the message format**, full protocol surface on both sides.

---

## Language-agnostic

The adapter is **implemented in TypeScript** (`npx mcp-api-adapter`). Upstream MCP servers may be Python, Go, Rust, or anything that speaks MCP over stdio, Streamable HTTP, or gRPC. Users do not write TypeScript to use the fabric.

---

## Related docs

- User guide: [`mcp/mcp-api-adapter.md`](../mcp/mcp-api-adapter.md)
- Adapter GTM: [`mcp-api-adapter-positioning.md`](./mcp-api-adapter-positioning.md)
- Streams (event-driven autonomous execution): [`design/clawql-streams.md`](../design/clawql-streams.md)
- Custom sources (MCP **into** ClawQL): [`getting-started/custom-sources.md`](../getting-started/custom-sources.md)
