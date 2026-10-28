# Open isolation backends

**ADR:** [0018](../adr/0018-open-isolation-backends.md) · **Package:** `clawql-sandbox` (`src/isolation-backend/`)

Cua Spaces was evaluated and **rejected** (FSL competing-use risk for a commercial agent runner). Backends are OSI-licensed only.

## Matrix

| Backend         | Pin (check LICENSE at tag)      | Host   | Tier      | Snapshot spike |
| --------------- | ------------------------------- | ------ | --------- | -------------- |
| Firecracker     | `v1.17.0` Apache-2.0            | Linux  | microVM   | **Primary**    |
| gVisor          | `release-20261026.0` Apache-2.0 | Linux  | gvisor    | —              |
| Apple container | `0.1.0` Apache-2.0              | Darwin | container | Secondary (VZ) |
| Lima            | `v2.2.1` Apache-2.0             | Darwin | full-vm   | —              |

**Avoid:** Tart; Cua.

## C1–C4 (ClawQL)

```ts
import { Effect, Layer } from "effect";
import {
  createMockFirecrackerLayer,
  createTrialCheckpointLayer,
  forkPilotTrialsEffect,
  assertReplaySpikeDoneEffect,
  createCallRecordReplayLayer,
  runIsolationConformanceEffect,
} from "clawql-sandbox";

await Effect.runPromise(
  runIsolationConformanceEffect("microvm").pipe(Effect.provide(createMockFirecrackerLayer()))
);
```

- **C2:** `forkPilotTrialsEffect` — Firecracker-first checkpoints.
- **C3:** `CallRecordReplayService` / `assertReplaySpikeDoneEffect`.
- **C4:** `assertNoGatewayBypassEffect`.

## License CI

```bash
node scripts/check-isolation-backend-licenses.mjs
```

Allowlist: `ISOLATION_OSI_LICENSE_ALLOWLIST` in `license-registry.ts`.
