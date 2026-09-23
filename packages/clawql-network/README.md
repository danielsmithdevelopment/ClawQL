# clawql-network

Headscale persistent mesh + governed Tailcat ephemeral transport for ClawQL nodes.

**Spec:** [`docs/specs/network/clawql-network-v0.1.md`](../../docs/specs/network/clawql-network-v0.1.md)

## Operator bootstrap

```bash
clawql init --networking
clawql init --networking --offer-derp   # optional self-hosted DERP relay
clawql network status
clawql network verify
```

Mesh enrollment with Headscale may require `CLAWQL_HEADSCALE_AUTHKEY` for `tailscale up --login-server …`.

## Tailcat binaries

Prebuilt binaries live under `tailcat/bin/` (or set `CLAWQL_TAILCAT_BIN`). Fetch from GitHub releases:

```bash
node scripts/network/fetch-tailcat-binaries.mjs
```

When no release binary is available, the package falls back to `tailcat-dev.mjs` (development shim implementing the subprocess JSON-line protocol).

## Programmatic API

```typescript
import { selectTransport } from "clawql-network";
import { createNetworkPlugin } from "clawql-network/plugin";
import { initNetworking } from "clawql-network/init";
import { startTailcatListener, connectViaTailcat } from "clawql-network";

selectTransport({ targetType: "unknown" }); // => 'headscale-mesh' (safe default)
```

## Gap A — Gateway registry

Org-scoped fleet store (not `network.json`):

```typescript
import {
  GatewayRegistryService,
  gatewayRegistryLiveLayer,
  attachGatewayRegistryRoutes,
  startGatewayHeartbeatLoop,
  initNetworking,
} from "clawql-network";

await initNetworking({ orgId: "acme", gatewayKind: "regional" });
// enrolls via joinMesh → registerGateway, then starts heartbeat interval

// HTTP (also mounted on clawql-mcp HTTP gateway):
// GET  /network/orgs/:orgId/gateways
// POST /network/gateways/register
// POST /network/gateways/:gatewayId/heartbeat
// Auth: Bearer CLAWQL_NETWORK_REGISTRY_TOKEN (or CLAWQL_NETWORK_REGISTRY_PUBLIC=1)
```

MCP: `network_list_mesh_peers`, `network_register_gateway`, `network_gateway_heartbeat` via `createNetworkPlugin()`.

## Related deployment docs

- [`docs/deployment/tailscale-and-headscale-for-clawql.md`](../../docs/deployment/tailscale-and-headscale-for-clawql.md)
- [`docs/deployment/headscale-tailnet.md`](../../docs/deployment/headscale-tailnet.md)
