# clawql-network

Headscale persistent mesh + governed Tailcat ephemeral transport for ClawQL nodes.

**Spec:** [`docs/specs/network/clawql-network-v0.1.md`](../../docs/specs/network/clawql-network-v0.1.md)

## Status

v0.1 scaffold — selector, enforcement hook, and init API surface. Headscale bootstrap, Tailcat subprocess adapter, and DERP relay are spec-defined stubs pending implementation.

## Usage

```typescript
import { selectTransport } from "clawql-network";
import { createNetworkPlugin } from "clawql-network/plugin";

selectTransport({ targetType: "unknown" }); // => 'headscale-mesh' (safe default)
```

Operator bootstrap (planned):

```bash
clawql init --networking
```

## Related deployment docs

- [`docs/deployment/tailscale-and-headscale-for-clawql.md`](../../docs/deployment/tailscale-and-headscale-for-clawql.md)
- [`docs/deployment/headscale-tailnet.md`](../../docs/deployment/headscale-tailnet.md)
