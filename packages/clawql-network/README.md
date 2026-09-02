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

## Related deployment docs

- [`docs/deployment/tailscale-and-headscale-for-clawql.md`](../../docs/deployment/tailscale-and-headscale-for-clawql.md)
- [`docs/deployment/headscale-tailnet.md`](../../docs/deployment/headscale-tailnet.md)
