---
title: "Bursty Streams on AWS — celld, Karpenter, Istio Ambient Mesh, and the clawql-k8s-operator"
status: "September 2026"
version: "0.1"
package: "infra/aws-celld-burst/ + packages/clawql-k8s-operator/"
---

# Bursty Streams on AWS

## celld, Karpenter, Istio Ambient Mesh, and the clawql-k8s-operator — Specification v0.1

**September 2026** · **Status:** Draft / unverified until §12 checklist has measured results

**Hands-on today:** [Streams getting started](https://docs.clawql.com/learn/streams-getting-started) · Lab 5b [`examples/streams-celld`](../../examples/streams-celld/) · evidence [`streams-celld-evidence.md`](./streams-celld-evidence.md)

**Related:** [`clawql-celld.md`](./clawql-celld.md) · [`clawql-streams.md`](./clawql-streams.md) · [`clawql-cellrt.md`](./clawql-cellrt.md) · [`clawql-network-v0.1.md`](../specs/network/clawql-network-v0.1.md) · [`clawql-operator` (Instance CRD)](../deployment/clawql-operator-helm.md) · [defense-in-depth](../security/clawql-security-defense-in-depth.md)

**Repo homes:** `infra/aws-celld-burst/` (manifests) · `packages/clawql-k8s-operator/` (planned controller — **not** the same package as `clawql-operator` / ClawQLInstance)

---

## 1. Purpose and Scope

This document specifies how ClawQL's Streams architecture (celld-hosted Durable Object cells) runs on AWS, under genuinely bursty traffic — the specific pattern under analysis throughout this spec is **1M requests arriving within a minute, dropping to zero for roughly 10 minutes, then a further 2M arriving all at once.** It covers the cost model (verified against real 2026 rate cards, not vendor sketches), why this traffic shape specifically favors celld's architecture over a Karpenter-autoscaled EC2 fleet, how filler workloads and priority-based preemption are used to avoid paying for idle peak capacity, how Istio's ambient mesh (ztunnel/waypoint) fits as a genuine second, independently-failing security layer rather than a redundant restatement of the same policy, how clawql-network's Headscale/tailcat layer interacts with all of this, and the `clawql-k8s-operator` component that ties mesh policy, node lifecycle, and audit correlation together under one fail-closed, WORM-audited posture.

Every cost figure, latency figure, and platform behavior cited here was checked against a real, current source at the time of writing (August–September 2026) — none of it is copied vendor marketing arithmetic. Where a figure is a projection rather than a measured result from ClawQL's own infrastructure, it is marked as such, and the required verification step is stated explicitly. **This spec should not be treated as complete until every item in Section 12 (Verification Checklist) has a real, measured result attached.**

**Honesty carry-over from Lab 5b:** do **not** cite vendor $/cell-month hibernation economics as ClawQL-measured (see [`streams-celld-evidence.md`](./streams-celld-evidence.md)). Lead with the structural argument (Mechanism B below) until ClawQL measures idle ratio on a real subscription mix. Compliance WORM for cell-hosted agents is host [`clawql-audit`](../audit/clawql-audit-spec-v0.1.md), not cell LTX alone.

---

## 2. Why This Traffic Shape Is the Right Thing to Design Around

The 1M-then-zero-then-2M pattern is not an arbitrary stress test. It is the shape that most sharply distinguishes celld's architecture from a conventional Kubernetes-autoscaled EC2 fleet, because it exercises the exact failure mode that node-provisioning-based autoscaling structurally cannot avoid: **any autoscaler that correctly scales down during the zero-traffic gap (to avoid paying for idle capacity) will necessarily incur a provisioning delay when traffic returns**, because provisioning new compute — whether a Karpenter-launched EC2 node, a Lambda cold start, or a Fargate task — is an inherently slower operation than resuming an already-running process. The only way to avoid this tradeoff entirely is to keep something warm through the gap that can absorb the burst without provisioning anything new — which is precisely what a V8-isolate-based Durable Object model provides at the individual-object level, and precisely what filler workloads plus priority-based eviction provide at the node level.

---

## 3. Cost Model — AWS EC2/Karpenter vs. Cloudflare-style Durable Object Billing

### 3.1 Real 2026 rate cards used in this analysis

> **Projection only.** Figures below are public rate-card arithmetic applied to a hypothetical load model — **not** ClawQL-measured production cost. Re-benchmark before GTM citation (§12).

```
Cloudflare Durable Objects (Workers Paid plan):
  Requests: 1M/month free, then $0.15/million
            (RPC sessions, WebSocket messages, alarm invocations
             all count as requests)
  Duration: 400,000 GB-s/month free, then $12.50/million GB-s
            - billed WALL-CLOCK time, ONLY while the DO is actively
              running or idle-but-not-yet-hibernation-eligible
            - a properly hibernating DO pays ZERO duration cost
              while idle
            - billed at the DO's full 128MB memory allocation
              regardless of actual usage

AWS Lambda:
  Requests: $0.20/million (after 1M/month free)
  Duration: $0.0000166667/GB-second (x86), ~20% less on Arm
            (after 400,000 GB-s/month free)
  Cold starts: 100ms-1000ms typical without Provisioned Concurrency;
               AWS now bills the INIT phase itself in fractional
               GB-second increments - cold starts became a direct
               cost item, not just a latency concern, as of a recent
               2026 billing change

EC2 On-Demand (t3.large, us-east-1):
  $0.0832/hour  =~  $60.74/month if run continuously
  1-year All-Upfront Savings Plan: ~$0.052/hour (~37% discount)

EC2 Spot:
  Typically 60-90% off On-Demand
  (a c7i.xlarge at $130/mo On-Demand runs $15-25/mo on Spot)

Karpenter node provisioning:
  45-60 seconds (direct EC2 API call) - best case
Cluster Autoscaler (older/simpler):
  3-4 minutes (polls every 10s, simulates scheduling, then
  modifies the Auto Scaling Group)
Real-world documented incident:
  a Kubernetes-edge deployment saw 12-second autoscaling under
  a flash-sale traffic spike and it "cost them thousands in
  dropped checkouts" - this is the concrete failure mode this
  whole spec exists to avoid
```

### 3.2 Raw compute cost comparison at 100 events/sec sustained (259.2M events/month)

This is the baseline "if load were uniform" comparison — worth having, but **NOT** the number that matters for bursty traffic specifically (see 3.3).

```
Cloudflare DO-style billing:
  Requests: 259.2M x $0.15/M = ~$38.88
  Duration: 259.2M x 0.2s x 0.125GB = 6.48M GB-s,
            minus 400K free = 6.08M billable
            6.08M x $12.50/M = ~$76.00
  TOTAL: ~$115/month

AWS Lambda:
  Requests: 259.2M x $0.20/M = ~$51.84
  Duration: same 6.08M billable GB-s x $0.0000166667 x 1000
            = ~$101.33
  TOTAL: ~$153/month

Cloudflare-style DO billing is ~25% cheaper on raw, uniform-load
compute at this volume, per current rate cards. This delta is
NOT the main argument for celld - see 3.3.
```

### 3.3 Why raw compute cost is the wrong metric for bursty, skewed, or hard-zero traffic

Two distinct, non-overlapping mechanisms matter more than the raw per-request/duration delta above, and they apply to different traffic shapes:

**Mechanism A — idle-cost avoidance (matters for traffic that is SKEWED across many subscriptions, not necessarily bursty in time).** A hibernating Durable Object costs zero in duration billing while idle. An EC2 fleet sized for many mostly-idle, occasionally-active subscriptions either (a) runs one lightweight process per subscription 24/7 regardless of activity (the naive, expensive baseline), or (b) uses Karpenter/Spot to consolidate — which per real production findings ("Karpenter won't save you money if your workloads are already well-packed… it's better when you have variable utilization… services with idle capacity") only pays off when utilization is genuinely uneven. This mechanism is about avoiding paying for capacity that sits unused.

**Mechanism B — provisioning-latency avoidance (matters specifically for HARD-ZERO bursty traffic — the pattern under analysis in this spec).** This is the more decisive mechanism for the 1M-then-zero-then-2M pattern. Any autoscaler that correctly scales down during the zero-traffic gap will pay a real provisioning delay (45–60 seconds minimum, per Karpenter's own best-case numbers; 3–4 minutes for Cluster Autoscaler; 12 seconds with real dropped-checkout consequences in a documented production incident) when the burst returns. V8 isolate cold starts are sub-1ms to sub-5ms, structurally eliminating this delay at the object level, because starting an isolate inside an already-running process is not the same class of operation as provisioning a new machine.

**These two mechanisms are not interchangeable, and conflating them is the exact mistake this spec exists to avoid repeating.** Mechanism A's savings are real but marginal in a uniform-load, well-packed regime (Karpenter's own documentation admits this — "the difference was maybe 2%" against a well-utilized baseline). Mechanism B's advantage is decisive and does not require uniform load or good packing to matter — it specifically shows up in exactly the hard-zero-gap traffic shape this spec is designed around, and no amount of Karpenter/Spot optimization on the EC2 side removes the provisioning-delay penalty, because that penalty is inherent to provisioning a machine rather than resuming an isolate.

**The one sentence worth keeping as the permanent, defensible summary of this whole section:** _for bursty traffic with hard zeros between spikes, celld's Durable-Object model wins decisively on availability/latency (Mechanism B), independent of and in addition to whatever raw compute cost delta exists (3.2) — Karpenter/Spot can match or beat celld on cost when load is uniform, but cannot match it on burst-absorption latency when load has hard zero-gaps, because no EC2-based autoscaler can provision a machine as fast as a V8 isolate resumes._

---

## 4. What "Running celld on AWS" Actually Means

celld is genuinely deployable on real AWS infrastructure — this is a first-class, documented path, not a workaround:

```bash
# Real AWS S3 bucket, standard AWS credential chain, no
# Cloudflare/R2 dependency required

celld deploy . --bucket s3://your-clawql-cells-bucket

celld \
  --bucket s3://your-clawql-cells-bucket \
  --listen 0.0.0.0:8080 \
  --internal-listen 10.0.0.12:8081 \
  --advertise 10.0.0.12:8081

# On Amazon EKS: celld reads Pod Identity credentials from
# injected environment variables and the authorization-token
# file automatically - no explicit AWS_ACCESS_KEY_ID needed
```

Multiple nodes pointed at the same bucket form a fleet automatically — no consensus service, no explicit join step; nodes discover each other and negotiate cell ownership through conditional writes and lease records in the bucket. Run 2+ nodes for the write-latency benefit: a write finishes as soon as a second node holds the data on its own disk, which is faster than a full S3 round trip for every write.

See also [`clawql-celld.md`](./clawql-celld.md) § fleet / bucket layout.

### 4.1 The correct scaling unit: cells within nodes, not pods per request

**This is not 1M pods, or anything close to it.** A "node" is one running celld process, one per machine — you provision a small, fixed number of these (2–5 to start, sized for peak concurrent-resident-cell memory, not per-request throughput). A "cell" is an individual Durable Object — thousands of cells share a small number of already-running celld processes. Per celld's own v0.2 release, shared isolates bring a resident cell down to ~471KB, supporting up to ~2,500 resident cells per node at ~1.2GB.

A burst of 1M events spins up (up to) 1M short-lived cells across your existing few nodes — an in-memory, sub-millisecond operation _inside already-running processes_ — not 1M new processes, pods, or EC2 instances. Most complete their work in milliseconds and are immediately eligible for hibernation/eviction, freeing memory for the next wave.

**What you are actually provisioning: a small number of large, memory-optimized EC2 instances** (e.g., r6g.2xlarge or larger — memory-headroom matters more than CPU count here, since resident-cell-count × per-cell-memory is the binding constraint), each running one celld process, always on, sized in advance for your expected peak concurrent-resident-cell footprint. You add more nodes only if peak concurrent memory exceeds what your current fleet can hold — a capacity-planning decision made ahead of time, not a per-burst autoscaling event for the celld layer itself.

---

## 5. Filler Workloads and Priority-Based Preemption

### 5.1 The pattern

Given a small, fixed set of celld nodes sized for peak, the "spare" capacity that exists during quiet periods (celld is not using its full peak memory allocation) can run other, genuinely disposable workloads, evicting them the instant celld needs the memory back for a burst. This is a deliberate, accepted tradeoff: it saves provisioning nodes sized for peak-and-idle simultaneously, in exchange for building and testing real Kubernetes priority/preemption configuration, and accepting that filler workloads are killed — not gracefully drained — the moment a burst arrives.

Sample manifests: [`infra/aws-celld-burst/manifests/priority-classes.yaml`](../../infra/aws-celld-burst/manifests/priority-classes.yaml).

### 5.2 PriorityClass tiering

```yaml
# Tier 1 - celld itself, never preempted, always wins the node
apiVersion: scheduling.k8s.io/v1
kind: PriorityClass
metadata:
  name: celld-critical
value: 1000000
preemptionPolicy: PreemptLowerPriority
globalDefault: false

---
# Tier 2 - the small set of genuinely critical services that
# cannot tolerate a kill-and-reschedule cycle
apiVersion: scheduling.k8s.io/v1
kind: PriorityClass
metadata:
  name: business-critical
value: 500000
preemptionPolicy: PreemptLowerPriority
globalDefault: false

---
# Tier 3 - everything else: the actual filler. globalDefault
# ensures anything without an explicit class lands here, so
# nothing becomes uninterruptible by accidental omission.
apiVersion: scheduling.k8s.io/v1
kind: PriorityClass
metadata:
  name: filler-workload
value: 100
preemptionPolicy: Never
globalDefault: true
```

### 5.3 Two details that determine whether this works or silently fails

**terminationGracePeriodSeconds on filler workloads must be short and deliberate**, not left at Kubernetes' 30-second default. If celld needs memory immediately during a burst, waiting 30 seconds for a filler pod's graceful shutdown erodes exactly the burst-absorption advantage this whole architecture exists to provide. Filler workloads must either checkpoint and exit in a few seconds, or — if they genuinely cannot be interrupted cleanly in that window — they do not belong in Tier 3 at all; they belong in Tier 2, with the understanding that Tier 2 is meant to stay small.

**Karpenter's own consolidation/disruption behavior must be explicitly bounded** so its own cost-optimization activity doesn't add churn on top of the burst-driven eviction being deliberately engineered here. Set an explicit disruptionBudget on the filler NodePool so Karpenter stays reactive (fast to provision replacement capacity for evicted filler pods) without being simultaneously proactive in ways that add unpredictable noise at exactly the moment predictable behavior matters most.

---

## 6. Istio Ambient Mesh as an Independently-Failing Second Security Layer

### 6.1 Why ambient mode, not sidecar mode

Sidecar mode injects a full Envoy proxy into every pod — additional memory/CPU per pod, mandatory restarts for injection, per-pod proxy management. Ambient mode splits this into two layers: **ztunnel**, a lightweight L4 proxy running once per node as a DaemonSet (mTLS, basic authorization, telemetry — no HTTP awareness at all), and **waypoint proxies**, optional, per-namespace, L7-aware components deployed only where HTTP-level policy (path, method) is actually needed. Enrolling a namespace into ambient mode does not require restarting existing pods — the ztunnel picks them up live, which matters directly for the burst scenario: a freshly Karpenter-provisioned node's pods are meshed via the node's own ztunnel DaemonSet pod, not via N individual sidecar injections and startups.

### 6.2 The defense-in-depth principle, stated precisely

**A denial at either layer means denial. Fail-closed applies throughout, at every layer, without exception.** For this to be genuine defense-in-depth rather than the same single point of failure wearing two hats, the two layers must be capable of failing independently — meaning Istio's mesh-level policy must not be mechanically derived from the exact same source of truth as clawql-core's hook-based ATR scope enforcement, or a single misconfiguration in that shared source breaks both layers simultaneously.

The correct shape:

```
Layer 1 - ztunnel (L4, always on, every node, no HTTP awareness):
  Coarse network-identity enforcement. Which SERVICE may talk to
  which SERVICE at all, mTLS-verified. Catches: something that
  should have zero network reachability to celld's internal peer
  port, the payments signer, or the audit WORM endpoint, attempting
  to connect at all - independent of whether clawql-core's own
  hook configuration is even loaded correctly.

Layer 2 - waypoint (L7, opt-in per namespace, HTTP-aware):
  Coarser HTTP-level policy, e.g. "only the celld namespace may
  POST to the audit WORM endpoint's /entries route." Deployed
  specifically for namespaces hosting security-critical services:
  the payments signer, the audit WORM endpoint, anything Panguard-
  adjacent. Evaluated by a completely separate policy engine,
  reading independently-authored AuthorizationPolicy resources -
  NOT generated from the same ATR scope definitions the hooks use,
  specifically so the two layers can fail independently.

Layer 3 - clawql-core hooks (application-level, ATR-scope-aware,
  restrict-only invariant, WORM-audited):
  The fine-grained, business-logic-aware enforcement already
  specified in the plugin architecture spec.
```

### 6.3 ztunnel's known L7 limitation, and why it matters here

ztunnel explicitly cannot enforce HTTP-attribute rules (path, method) — Istio's own status output states this plainly: _"ztunnel does not support HTTP attributes (found: methods, paths). In ambient mode you must use a waypoint proxy to enforce HTTP rules."_ Critically, when ztunnel encounters a policy rule it cannot enforce at L4, it fails toward being _more_ restrictive, not less — the documented behavior is "this will be more restrictive than requested." This is the correct fail-closed behavior and should not be worked around; any HTTP-path/method-level policy that matters must be pushed to an explicit waypoint deployment for the relevant namespace, not assumed to be covered by ztunnel alone.

### 6.4 celld's peer protocol and the mesh boundary

celld's own peer-to-peer protocol (node discovery and write-replication through the shared S3 bucket) is HMAC-authenticated, versioned, and clock-bounded on its own terms, and upstream documentation explicitly states it does not terminate TLS itself and should be kept off the public internet. Because ztunnel operates purely at L4 with no HTTP interpretation, celld's peer traffic can very likely coexist with ambient mode without conflict or double-termination — but this should be explicitly decided and tested, not assumed. Recommendation: exclude celld's internal peer port from any L7 waypoint policy entirely (waypoints are opt-in per namespace/port, so this is a configuration choice, not a workaround), and verify celld's own peer handshake completes successfully with ztunnel's L4 tunnel present.

---

## 7. clawql-network (Headscale/tailcat) Interaction

Istio's ambient mesh and Karpenter's node provisioning both operate _within_ the AWS Kubernetes cluster. clawql-network's Headscale-managed mesh and tailcat's ephemeral-connection path operate one layer up, for connections that cross _outside_ the cluster entirely — to the homelab, to a different cloud region, to a genuinely one-off external peer. Nothing about running on AWS with Istio changes the existing selector logic or its safe-under-ambiguity default (see [`clawql-network-v0.1.md`](../specs/network/clawql-network-v0.1.md)):

```typescript
// unchanged from the clawql-network specification
export function selectTransport(req: ConnectionRequest): "headscale-mesh" | "tailcat" {
  if (req.targetType === "known-fleet-node") return "headscale-mesh";
  if (
    req.targetType === "ephemeral-peer" ||
    (req.expectedDurationMs !== undefined && req.expectedDurationMs < 60_000)
  ) {
    return "tailcat";
  }
  return "headscale-mesh"; // default under ambiguity - never the
  // ungoverned option
}
```

**A real architectural constraint worth stating explicitly:** tailcat's own compiled Go binary cannot run _inside_ a celld cell, for the same reason full clawql-core, Express, and child_process-based stdio MCP cannot run inside a cell — the isolate sandbox has no child_process capability. If cell-hosted agent logic ever needs a tailcat ephemeral connection, that request must be proxied to an out-of-process sidecar capable of spawning the tailcat binary, following the exact same "cell fetches, sidecar does the real work" pattern already established for clawql-mcp-http and mcp-api-adapter (Lab 5b). Tailcat is never called in-cell; it is always a sidecar operation the cell fetches out to.

---

## 8. The clawql-k8s-operator

### 8.1 Purpose

A Kubernetes operator whose job is making "fail closed throughout, WORM-audit everything" a real, enforced property of the cluster rather than an aspiration maintained by hand across several independently-configured systems (Istio policy, Karpenter node lifecycle, celld fleet health).

**Distinct from [`clawql-operator`](../deployment/clawql-operator-helm.md):** that package scaffolds `ClawQLInstance` CRDs / tier ConfigMaps. **`clawql-k8s-operator`** owns burst/mesh/fleet watch functions described here. Do not merge the two packages.

### 8.2 Responsibilities

**Mesh-policy drift detection, not mesh-policy generation.** The operator does NOT automatically generate Istio AuthorizationPolicy/waypoint config from clawql-core's ATR scope definitions — doing so would recreate the single-source-of-truth failure mode Section 6.2 explicitly warns against. Instead, the operator reads both the independently-hand-authored mesh policy and the ATR scope definitions, and **alerts on drift** — cases where the two have diverged in a way that either over-restricts (mesh blocks something the hooks would allow, potentially breaking legitimate traffic) or under-restricts (mesh allows something the hooks would deny, meaning the mesh layer isn't actually providing independent coverage for that path). This preserves genuine defense-in-depth: a human authored each layer separately, and the operator's job is surfacing when they've quietly drifted apart, not keeping them in automatic lockstep.

**Denial event bridging.** Istio's access logs and ztunnel/waypoint telemetry are not, by default, visible to clawql-audit. The operator watches the mesh's own telemetry pipeline for denied requests and writes a corresponding entry to the real WORM trail via clawql-audit's existing append path — same hash chain, same tip-continuity guarantee, correlated by session ID where one is derivable from the denied request's mTLS identity or headers.

```typescript
export type MeshWORMEntryType =
  | "MESH_POLICY_DENIED" // ztunnel or waypoint blocked a request
  | "MESH_POLICY_DRIFT_DETECTED"; // hand-authored mesh policy and ATR
// scope have diverged
```

**Node/burst lifecycle coordination.** Owns the PriorityClass/filler-eviction logic from Section 5 as a deliberate controller action — not generic Kubernetes scheduler pressure alone, but an explicit decision the operator makes ("celld needs N more GB of headroom, evict these specific filler pods, this triggers Karpenter to provision replacement capacity for them") — logged the same way as any other consequential action.

```typescript
export type OperatorLifecycleWORMEntryType =
  "FILLER_WORKLOAD_EVICTED" | "CELLD_CAPACITY_HEADROOM_REQUESTED" | "KARPENTER_NODE_REQUESTED";
```

**celld fleet health.** Verifies celld nodes remain correctly part of the shared S3-backed fleet (bucket lease records current, peer discovery functioning) and alerts/remediates if a node silently drops out without anyone noticing — this is an availability concern, not primarily a security one, but it belongs in the same operator since it's the same class of "is the infrastructure actually behaving as specified" watch function.

### 8.3 The operator's own actions are themselves audited

Every operator action that changes cluster state — evicting a filler pod, flagging policy drift, requesting Karpenter capacity — produces its own WORM entry, following the same discipline already applied to plugin install/uninstall, hook firings, and spend-tier changes throughout this project. An operator that silently reconciles cluster state without leaving a record would itself be exactly the kind of unaudited privileged actor this entire architecture exists to prevent.

**Fail-closed + tip continuity:** mesh denial bridging and lifecycle events must append to the tip-loaded host `WORMAuditTrail` (same rule as Lab 5b dual-write). No parallel audit schema.

---

## 9. WORM Audit Trail — Complete Entry Type Summary for This Spec

```typescript
export type BurstArchitectureWORMEntryType =
  | "MESH_POLICY_DENIED"
  | "MESH_POLICY_DRIFT_DETECTED"
  | "FILLER_WORKLOAD_EVICTED"
  | "CELLD_CAPACITY_HEADROOM_REQUESTED"
  | "KARPENTER_NODE_REQUESTED"
  | "CELLD_FLEET_NODE_DROPPED"; // fleet health remediation event
```

All of these append to the same clawql-audit `WORMAuditTrail` already used by every other subsystem in this project (hooks, plugin lifecycle, spend governance, execute batching, payments). There is no separate audit mechanism for cluster/mesh-level events — the entire point of this section is that the WORM trail remains the single, complete, correlatable record regardless of which layer (application hook, mesh policy, or cluster operator) produced the event.

Types live in `packages/clawql-k8s-operator` (draft).

---

## 10. What This Spec Deliberately Does Not Claim

- No dollar figure in Section 3 should be read as ClawQL's own measured production cost — every figure there is derived from current, real, publicly documented rate cards, applied to a hypothetical load model. Real costs depend on your actual subscription distribution, actual cell memory footprint, and actual burst frequency.
- celld's cold-start latency inherits from V8 isolate architecture in principle; it has not yet been measured on ClawQL's own AWS deployment specifically (see Section 12).
- Istio ambient mesh's own ztunnel startup time on a freshly-provisioned node has not yet been measured as part of an end-to-end burst test (see Section 12).
- The `clawql-k8s-operator` as described here is a specification plus Effect type/service scaffold, not yet a shipped controller.

---

## 11. Package Boundaries — Summary

| Concern                                                                    | Owner                                                   | Why                                                                            |
| -------------------------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Cell hosting, in-memory burst absorption                                   | celld (forked as clawql-cellrt eventually)              | V8 isolate model, sub-ms cell startup                                          |
| Node-level compute provisioning                                            | Karpenter + EC2                                         | Handles filler-workload replacement capacity, not celld's own burst absorption |
| Filler-workload preemption policy                                          | Kubernetes PriorityClass, driven by clawql-k8s-operator | Deliberate, audited eviction — not generic scheduler pressure                  |
| L4 mesh security (mTLS, coarse network identity)                           | Istio ztunnel                                           | Always-on, per-node, no HTTP awareness                                         |
| L7 mesh security (HTTP path/method policy)                                 | Istio waypoint, opt-in per namespace                    | Independently-authored from ATR scope, for genuine defense-in-depth            |
| Fine-grained, business-logic enforcement                                   | clawql-core hooks                                       | Restrict-only invariant, ATR-scope-aware, already specified                    |
| Cross-cluster / external ephemeral connections                             | clawql-network selector (Headscale/tailcat)             | Unchanged by anything in this spec; tailcat never runs in-cell                 |
| Mesh-policy drift detection, denial bridging, node lifecycle, fleet health | clawql-k8s-operator                                     | Ties the above together under one fail-closed, WORM-audited posture            |
| ClawQLInstance / tier ConfigMaps                                           | clawql-operator (existing)                              | Separate CRD scaffold — do not conflate                                        |
| Every consequential event above                                            | clawql-audit WORM trail                                 | Single, complete, correlatable record — no parallel audit mechanism            |

---

## 12. Verification Checklist — Nothing Above Is a Claim Until This Is Run

```
[ ] Deploy 2+ celld nodes on real EC2 (or EKS w/ Pod Identity),
    pointed at a real S3 bucket. Confirm fleet formation via bucket
    lease records.

[ ] Run the synthetic burst test: zero traffic for 10 minutes with
    filler workloads occupying spare node capacity, then a sudden
    spike to 1M events, then zero again, then 2M events. Measure:
      - celld's own cell spin-up latency under real AWS conditions
        (not assumed to equal Cloudflare's managed-platform number)
      - end-to-end time from "celld needs memory" to "filler pods
        evicted, Karpenter node request fired, celld has headroom"
      - ztunnel startup time on a freshly Karpenter-provisioned node

[ ] Confirm celld's peer protocol completes its handshake correctly
    with ztunnel's L4 tunnel present, with the peer port explicitly
    excluded from any waypoint L7 policy.

[ ] Author the initial hand-written Istio AuthorizationPolicy/
    waypoint config for the payments-signer, audit-WORM, and
    Panguard-adjacent namespaces - independently from, not
    generated from, the existing ATR scope definitions.

[ ] Build the clawql-k8s-operator's drift-detection pass and
    confirm it correctly flags a deliberately-introduced mismatch
    between mesh policy and ATR scope in a test environment.

[ ] Confirm MESH_POLICY_DENIED, FILLER_WORKLOAD_EVICTED, and
    CELLD_CAPACITY_HEADROOM_REQUESTED entries land in the same
    real WORM chain as every other subsystem's entries, with
    correct tip continuity.

[ ] Only after every item above has a real, measured result:
    update Section 3 and Section 12 with actual figures, and only
    then is this architecture's burst-handling claim ready to cite
    externally.
```

---

_Bursty Streams on AWS — celld, Karpenter, Istio Ambient Mesh, and the clawql-k8s-operator — Specification v0.1 — September 2026_  
_Location: `infra/aws-celld-burst/`, `packages/clawql-k8s-operator/`, `docs/streams/aws-celld-burst.md`_  
_Contact: daniel@clawql.com_
