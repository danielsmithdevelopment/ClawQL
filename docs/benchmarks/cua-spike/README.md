# Cua spike evidence (non-publish)

**Status:** interface + mock conformance in CI; live Mac host runs operator-gated  
**ADR:** [0018](../../adr/0018-cua-isolation-backend.md)

## Rules

- Pin **`@trycua/cua@0.9.0`** in every file (`cuaPinnedPackage` / `cuaPinnedVersion`).
- Record **Mac model + macOS version** on every Mac-hosted run (`macModel`, `macOsVersion`).
- **`publishGradeAllowed` must be `false`.** Do not cite these numbers publicly.
- Do not run governance / injection / AgentDojo / token boards here.

## Template

Copy [`evidence.template.json`](./evidence.template.json). Fill `host` via `collectIsolationHostEvidence()` (override Mac fields with `CLAWQL_ISOLATION_HOST_MAC_*`).

## What belongs here

| Arm                         | Source                                  |
| --------------------------- | --------------------------------------- |
| C1 conformance (per tier)   | `runIsolationConformanceEffect`         |
| C2 N=50 checkpoint forks    | `forkPilotTrialsEffect`                 |
| C3 replay spike             | `assertReplaySpikeDoneEffect`           |
| C4 gateway bypass           | `assertNoGatewayBypassEffect`           |
| O4 / C3 joint snapshot cost | Ontologiql + ClawQL on a real Mac Space |

Practical costs (session start p50/p99, shared-folder I/O, memory, concurrency) are **Ontologiql O3** — record them only for usability decisions, never as publish headlines.
