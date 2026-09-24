# clawql-k8s-operator

**Status:** Draft scaffold (Effect Tag + Layer + WORM entry types). Not a shipped controller.

**Spec:** [`docs/streams/aws-celld-burst.md`](../../docs/streams/aws-celld-burst.md)

## vs `clawql-operator`

| Package                          | Job                                                                                                                                                                                              |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **`clawql-operator`**            | `ClawQLInstance` CRD, tier ConfigMaps, optional MCP Deployment rolls                                                                                                                             |
| **`clawql-k8s-operator`** (this) | Mesh-policy **drift detection** (not generation), mesh denial → host `clawql-audit`, filler eviction / Karpenter headroom, celld fleet health, session-aware cell placement (Modal-sourced §8.2) |

Do not auto-generate Istio `AuthorizationPolicy` from ATR scopes — that collapses defense-in-depth into one source of truth.

## Scaffold today

- `BurstArchitectureWORMEntryType` — append to existing `clawql-audit` trail only (includes `SessionRoutingWORMEntryType`: `THICC_SESSION_SPLIT`, `CELL_PLACEMENT_LOAD_AWARE`, `NEW_CAPACITY_PREFERRED_ROUTING`)
- `detectMeshAtrDrift` — pure Effect comparison of mesh allow-set vs ATR allow-set
- `BurstOperatorService` Context.Tag + Live layer
- `BurstWatchStub` / `BurstWatchLoop` — in-memory watch queue + drain loop
- `PodInformerService` — `@kubernetes/client-node` Watch on pods → node_load / eviction events when kubeconfig works; otherwise unavailable
- `IstioDenialWatchService` — parse Envoy/ztunnel access-log JSON/NDJSON → `mesh_denial` (denial bridging; no policy generation)
- `KarpenterLifecycleWatchService` — map NodeClaim/disruption-shaped records → watch events + WORM types (mock/CRD-feed)
- `NodeClaimInformerService` — `@kubernetes/client-node` Watch on `nodeclaims.karpenter.sh` → lifecycle map → BurstWatchStub when kubeconfig works; otherwise unavailable (fail-closed)
- `CelldFleetHealthService` — evaluate injected S3 lease snapshots → `CELLD_FLEET_NODE_DROPPED` (no AWS SDK; hosts supply lease records)
- Placement variance simulation + `infra/aws-celld-burst/loadtest/dry-run.mjs` (`status: dry-run`, null `$Y`)

## Not yet implemented (needs real cluster / AWS)

Live Istio telemetry subscription (cluster log pipeline), live Karpenter eviction _actions_ (informer watches NodeClaims only), live S3 ListObjects lease scraping, calibrated three-arm Cost Explorer numbers (§13.5). In-repo adapters + NodeClaim/Pod informers parse/feed the watch queue when kubeconfig works; production eviction APIs and Cost Explorer remain external.
