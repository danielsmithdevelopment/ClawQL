# Cua Spaces (optional isolation backend)

**ADR:** [0018](../adr/0018-cua-isolation-backend.md) · **Package:** `clawql-sandbox` (`src/cua/`, `src/isolation-backend/`)  
**Pinned SDK:** `@trycua/cua@0.9.0` (optional peer — never a hard dependency)

## Why (only two jobs)

1. Run agent sessions in **Linux Spaces on a Mac** so existing Linux enforcement applies.
2. Prototype **snapshot + record-and-replay** recovery for unmodified agents.

Do **not** publish latency, density, or durability headline numbers from Cua runs.

## License

- Spaces: **FSL-1.1-MIT** — self-host / commercial in-house OK.
- Competing hosted Spaces product: needs Cua commercial licence.
- Gate: `cuaLicenseVerdict()` / `CLAWQL_CUA_LICENSE_BLOCK=1`.

## Env

```bash
# Enable mock (CI / no daemon) or live HTTP façade to cua-spacesd
CLAWQL_SANDBOX_CUA_ENABLED=1
CLAWQL_SANDBOX_CUA_MODE=mock          # or live
CLAWQL_SANDBOX_CUA_DEFAULT_TIER=container   # container | microvm | full-vm
# Live:
# CLAWQL_SANDBOX_CUA_URL=http://127.0.0.1:3211
# CLAWQL_SANDBOX_CUA_API_TOKEN=…
# Optional override of pinned version recorded in evidence:
# CLAWQL_SANDBOX_CUA_PINNED_VERSION=0.9.0
# Host fields for Mac evidence files:
# CLAWQL_ISOLATION_HOST_MAC_MODEL="MacBook Pro (M2 Pro)"
# CLAWQL_ISOLATION_HOST_MACOS_VERSION=15.0
CLAWQL_SANDBOX_BACKEND=cua            # or auto (after Agent Substrate)
```

## Open reference runner (C1)

```ts
import { Effect } from "effect";
import { createMockCuaIsolationLayer, runIsolationConformanceEffect } from "clawql-sandbox";

const stack = createMockCuaIsolationLayer({
  enabled: true,
  mode: "mock",
  defaultTier: "container",
  pinnedNpmVersion: "0.9.0",
  keepPresenceAndApprovalsOnHost: true,
});

await Effect.runPromise(runIsolationConformanceEffect("microvm").pipe(Effect.provide(stack)));
```

Same `IsolationBackendService` is what Ontologiql’s runner should target for shared conformance.

## C2 — pilot trial forks

`forkPilotTrialsEffect({ sessionId, tier, worktreePath, armCount: 50 })` snapshots once and forks identical arms. Thousand-trial publish runs stay on the Linux host.

## C3 — record-and-replay

`CallRecordReplayService`: record by sequence + digest → restore → replay until crash sequence → live. Digest mismatch → `outcome_unknown` and stop replay.

## C4 — gateway no-bypass

`assertNoGatewayBypassEffect(sessionId)` probes direct IP, raw DNS, IPv6, and hardcoded API endpoints. All must be blocked or proxied through ClawQL.

## Evidence template

See [`docs/benchmarks/cua-spike/`](../benchmarks/cua-spike/).
