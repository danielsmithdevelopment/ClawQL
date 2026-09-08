# clawql-k8s-operator

**Status:** Draft scaffold (Effect Tag + Layer + WORM entry types). Not a shipped controller.

**Spec:** [`docs/streams/aws-celld-burst.md`](../../docs/streams/aws-celld-burst.md)

## vs `clawql-operator`

| Package | Job |
| ------- | --- |
| **`clawql-operator`** | `ClawQLInstance` CRD, tier ConfigMaps, optional MCP Deployment rolls |
| **`clawql-k8s-operator`** (this) | Mesh-policy **drift detection** (not generation), mesh denial → host `clawql-audit`, filler eviction / Karpenter headroom, celld fleet health |

Do not auto-generate Istio `AuthorizationPolicy` from ATR scopes — that collapses defense-in-depth into one source of truth.

## Scaffold today

- `BurstArchitectureWORMEntryType` — append to existing `clawql-audit` trail only
- `detectMeshAtrDrift` — pure Effect comparison of mesh allow-set vs ATR allow-set
- `BurstOperatorService` Context.Tag + Live layer

## Not yet implemented

Kubernetes watch loops, Istio telemetry bridge, Karpenter API calls, S3 lease fleet health.
