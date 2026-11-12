# ClawQL Cloud: platform plan

Nov 3, 2026 · @Daniel

**In-repo canonical copy** of the living Cloud plan (Claude artifact remains a working surface). Durability evidence: [`../benchmarks/program-cell-fleet-kill/V4_CLAIM.md`](../benchmarks/program-cell-fleet-kill/V4_CLAIM.md) · during-call settle [`../benchmarks/program-cell-fleet-kill/v4-identity-remeasure-during-call-settle.json`](../benchmarks/program-cell-fleet-kill/v4-identity-remeasure-during-call-settle.json). Network whitepaper (§9 policy-routed models; §10 BFT coordination; §11 runtime substrate; §28A governed on-chain actions): [`../vision/clawql-network-whitepaper-v0.2.md`](../vision/clawql-network-whitepaper-v0.2.md).

## Status and summary

ClawQL Cloud is an agent-specific cloud that is governed by default, plus a simple container runtime for customer images that run alongside agents. This plan was frozen on 2026-11-03 and is the next build track, developed alongside or as part of the managed gateway offering.

The price edge comes from the density work: parked durable agents cost almost nothing to host. Everything except the container runtime stays agent-specific: approvals, untrusted labels, vault credentials, crash-safe writes, tamper-evident audit, and sandboxed execution.

This is a living plan. It is kept as one document, and additions are recorded in the changelog at the end. **Durability gate: met (2026-11-09).** Revisit it when unit costs are measured on a real host, and when the Stripe idempotency fix lands.

## Positioning: from personal use to the enterprise

Personal use is the adoption funnel into enterprise: developers adopt tools for their own problems, then ask for the same tools at work because they already know them. ClawQL targets both ends, and the differentiation is continuity, not market: the same tool, with the same guardrails, from a developer's laptop to their company. It is enterprise-grade and built for large scale, and equally meant for personal developers solving their own problems. (This was made explicit on 2026-11-05, prompted by Executor v2 repositioning as code-defined personal software with an MCP gateway as its entry point.)

The differentiation is where authority lives:

- **Rules the agent can't rewrite.** Convenience rules (for example, auto-approve actions in my own GitHub org) are as easy to set up as anywhere else, but a person authors them and the agent cannot edit them.
- **The same property at work.** When a developer brings ClawQL into their company, the guarantee their security team needs is already there; nothing changes tools or habits.

Tagline candidate: *convenience rules the agent can't rewrite.*

### Personal on-ramp

- Short path to value: npx, local, useful in minutes, with no enterprise setup visible until someone needs it.
- Governance stays light by default for personal use, with stronger controls opt-in and the same mechanisms underneath.

### Lead personal demo

mcp-ui / htmx with mcp-api-adapter: build a custom frontend over any API added to ClawQL, or any site that exposes WebMCP tools. The demo covers common personal-software asks, each with the rule held outside the agent's reach:

- Two accounts of one service at once (for example, company and personal Notion).
- A conditional approval (auto-approve in my own org, otherwise ask me).
- Skills pinned to a specific git SHA.

Present it as ClawQL's own demo, not as a reply to any peer launch.

### Competition notes

- **Executor v2:** overlaps on the gateway and on personal software. Its approval policy is code inside apps an agent can write; ClawQL's design difference is authority outside the agent. Frame as a design difference, never as a flaw.
- **Growing overlap:** Executor's triggers, workflows and storage approach ClawQL Cloud's webhook ingress and durable agents. The edge stays the same: governed by default, crash-safe writes, tamper-evident audit, self-hostable.
- **Benchmarks:** compare where products overlap (gateway tokens, governance cells on each product's recommended v2 configuration). Whether the Executor HTTP concurrency row stays depends on whether its maintainer confirms multi-client serving is a supported v2 setup.

### Open questions on positioning

- [ ] Is there a free personal tier on shared durable agents, and what are its limits?
- [ ] What is the default rule set for personal installs, and how does a user author and lock convenience rules?
- [ ] Does the personal demo ship before or alongside the managed gateway (build phase 1)?

## Workload model

The platform offers two workload types, split the way buyers already understand serverless versus always-on.

|  | Durable agents | Containers |
| --- | --- | --- |
| Model | Serverless: wake, act, park | Always-on; rarely scales to zero |
| Runtime | ClawQL-managed runtime (celld); we deploy more instances | Any image, any language, any runtime |
| Best for | Agents that sleep between events | Long-running agents, databases, custom tools, MCP servers, workers |
| Cost driver | Active turns; idle is near-free | RAM and CPU held continuously |
| Price position | Cheapest tier | Market rates |

The two compose. A typical pattern is an always-on container, such as a stateful service, that wakes durable agents when work arrives. Making that handoff easy is the reason to offer both on one platform.

The durable tier is TypeScript-first today. Keep the runtime interface language-neutral so a thin protocol or SDK (Python first) can bring other languages to it later, since ClawQL is an open standard.

## Isolation tiers

Tiers are a grid of two independent choices, what runs and how isolated it is, so a customer can pick durable agents on dedicated tenancy without buying containers. Each step right adds control and cost.

|  | Shared | Dedicated | BYOC | Hardened |
| --- | --- | --- | --- | --- |
| Durable agents | Cheapest tier; idle near-free | Own runtime nodes, database and keys | Managed by us, in the customer's cloud account | Confidential VMs with attestation |
| + Containers | microVMs on shared hosts (runtime under evaluation) | microVMs on the customer's own machines | Same, in the customer's account | Confidential VMs with attestation |

Definitions to hold to:

- **Dedicated** means the customer's own runtime processes, database and encryption keys, with no other customer's code on those nodes.
- **BYOC** (bring your own cloud) means we operate the stack inside the customer's AWS or GCP account. Regulated buyers most often ask for this, a BAA, and SOC 2, so it may outsell a TEE tier.
- **Hardened** uses AMD SEV-SNP or Intel TDX confidential VMs (and confidential GPUs where needed). Market it as defense in depth that keeps even the operator out of memory, never as unbreakable; TEEs have a side-channel history and HIPAA does not require them.
- Shared-cluster containers in microVMs can be more isolated than shared durable agents running as isolates. The pricing page must not imply otherwise.

## Governance per workload

Durable agents get governance inside the runtime; containers get it only at the boundary (the gateway and egress proxy). Docs and pricing must state this difference plainly.

| Control | Durable agents | Containers |
| --- | --- | --- |
| Approvals and mandates | In runtime | When tool calls go through the gateway |
| Untrusted labels | In runtime | At the gateway |
| Vault credentials, none mounted | Yes | Yes; metadata endpoint blocked |
| Tamper-evident audit | Yes | Gateway and proxy decisions |
| Crash-safe external writes | Journal and resume | Gateway journals intent and adds an idempotency key before forwarding |
| Internal state, retries, own DB writes | Covered by journal | Not covered |

## Governance features to add

- **Policy replay:** run a proposed policy over recorded traffic from the audit log and report what it would have blocked or allowed before enforcing it. This answers the false-block concern every buyer has.
- **Shadow-mode intent allowlists:** observe an agent in shadow mode, propose a tool and intent allowlist from what it actually did, and have a person approve it. This makes the strict path the easy one.
- **False blocks and false allows reported together** in benchmarks and dashboards, never one without the other.
- **Preview before approval:** for any action that supports a dry run (APIs with preview modes, on-chain transactions through simulation), the approval screen shows the deterministic predicted effect, not just the agent's request. A model's plain-language summary may appear beside it, labeled untrusted whenever external content informed it.
- **Governed on-chain actions (web3 vertical):** every on-chain write follows simulate, exact diff, approve, sign, journal-then-broadcast with the nonce as idempotency key, and finality tracking; autonomous agents get two independent limit layers (gateway mandates plus smart-account session keys enforced by the chain); signing keys never enter an agent. Full design in whitepaper [section 28A](../vision/clawql-network-whitepaper-v0.2.md#28a-governed-on-chain-actions). With tokenized assets moving onchain, this is positioned for regulated finance first. On-chain policy and consensus execution through Chainlink CRE are an optional trust layer, opt-in per deployment and never the default, because running gateway logic in a hardware enclave means proxying all of its network traffic and storage; the integration sits behind a pluggable trust-backend interface so other protocols can be added later.

## Model credentials

- ClawQL Cloud uses API keys only: customers bring their own, including keys that draw on a plan's monthly API credits. The hosted service never handles consumer-subscription credentials.
- A CI lint fails if ClawQL code reads subscription credential paths or builds auth headers from subscription OAuth tokens. `COMPLIANCE.md` documents the boundary.
- Local orchestration that launches a provider's official CLI under the user's own login waits for written confirmation from that provider.

## Managed webhook ingress

One multi-tenant listener serves every customer, so it is cheap to offer as a service with no setup. It is also the natural entry point to durable agents.

- **Verify per tenant:** each provider's signature (Stripe, GitHub HMAC and others), replay rejection, and dedupe by event ID.
- **Durable before acknowledgment:** write the event durably before returning 200, the same output-gate lesson as celld. Acknowledging first and crashing loses the event, because the provider will not resend it.
- **Label as untrusted:** webhook bodies are external input and a prompt-injection path, so they enter the agent already carrying the untrusted label.
- **Per-tenant limits:** rate limits and payload size caps so one tenant cannot starve the listener.

## Connectors

Managed connectors give agents breadth across company systems. Onyx is under evaluation for removal.

- **Framework:** dlt (Apache 2.0), writing into Ontologiql staging tables with source labels attached. Its OpenAPI source generator covers the long tail using the specs ClawQL already loads.
- **Document-heavy sources** (Drive, Confluence, SharePoint, Gmail): vendored Onyx Community Edition connectors (MIT) wrapped as dlt sources, with attribution, and nothing from Onyx's Enterprise code.
- **Permission-sensitive sources:** live search through the gateway with each user's own OAuth token, so source permissions apply automatically. Where indexing is worth it, connectors fetch access lists and store them beside the documents.
- **License rule:** no ELv2 tools (Airbyte, Nango) in anything Cloud offers to customers, pending legal review.
- **Private connectivity without BYOC:** hosted ClawQL can join a customer's existing Tailscale network as a Tailscale OAuth app, scoped by posture attribute (Premium or Enterprise plans) or tag to only the private APIs and MCP servers it needs. Details and safeguards are in the [`clawql-network` specification v0.2](../specs/network/clawql-network-v0.2.md).

## Container security stack

Container tiers layer independent controls so that disabling one is caught by another. Ship them in the order listed.

| Order | Layer | Tools | Rule |
| --- | --- | --- | --- |
| 1 | Workload isolation | Under evaluation: Docker Sandboxes, or Firecracker via Kata or firecracker-containerd | One microVM per container; hard CPU and memory caps; no Docker socket |
| 1 | Egress, primary | ClawQL egress proxy | Default-deny; the authority for outbound policy, audit and labels |
| 1 | Image supply chain | Trivy or Grype, Cosign, Kyverno verifyImages | Scan, sign, enforce at admission; customers may sign their own |
| 2 | Mesh | Istio (ambient mode preferred) | mTLS and service policy; second egress enforcer |
| 2 | Network floor | Cilium network policy | Default-deny holds even if both layers above are misconfigured |
| 3 | Runtime detection and response | Tetragon, Falco, Falco Talon | Detect and auto-respond to suspicious process and syscall activity |

### Rules that make the layers real

- **One policy source:** write egress policy once and compile it into both ClawQL proxy rules and Istio policy, so they never drift.
- **Alert on disagreement:** log both layers' decisions into the same audit trail. If one allows what the other blocks, page: it is a bug or tampering.
- **No mesh escape:** Kyverno rejects NET_ADMIN, host networking and other settings that let a pod rewrite its own traffic rules.
- **Separate control:** different credentials and change paths for Istio config and ClawQL policy. ClawQL policy changes go through ClawQL's own approval flow.
- **Signature meaning:** our signature attests "ClawQL scanned this on this date," not "this is safe." Attach scan results and an SBOM as signed attestations.
- **Continuous rescans:** rescan running images and alert on new vulnerabilities; admission-time checks go stale.
- **microVM visibility gap:** host eBPF tools see only the VM process, not containers inside the guest kernel. Run sensors in the guest and confirm Kata support before promising runtime detection on microVM tiers.

### Container runtime: evaluating three paths

No decision yet. All three paths are evaluated against the same criteria, and the platform depends only on a ClawQL-owned interface. Firecracker is the likely common layer: AWS Nitro Sandboxes support it natively and the self-built path uses it directly, so the isolation model stays the same across environments.

|  | Docker Sandboxes | AWS Nitro Sandboxes (launched 2026-11-09) | Firecracker or Kata (self-built) |
| --- | --- | --- | --- |
| Isolation | microVM per sandbox with its own kernel and Docker Engine | Hardware-isolated VM per EKS pod, ECS task or VM, on the Nitro Hypervisor | microVM per container |
| Orchestration | Local `sbx` is a CLI; the programmatic API is for Docker's cloud sandboxes | Built into EKS and ECS (a one-line change), or run directly on EC2 with our own orchestration | Ours to build: scheduling, placement, health, density |
| Attestation | Not offered | Cryptographic attestation; secrets released only to sandboxes that prove their integrity | Possible; ours to build |
| Egress and credentials | Host proxy enforcing policy; credentials injected at the proxy | ClawQL egress proxy and vault, with attestation gating secret release | ClawQL egress proxy and vault |
| Identity and dependencies | Docker sign-in tied to a person; Docker endpoints reachable from every host | Our own AWS account | None |
| Where it runs | Docker's model | AWS only | Anywhere with KVM |
| Self-host and BYOC | Customers inherit the Docker dependency | Fits BYOC on AWS | Fits every other environment |
| Licensing for hosting customers | Written terms needed | Standard AWS use | Apache 2.0 |

**Working direction:** Nitro Sandboxes for ClawQL Cloud on AWS and for BYOC on AWS; self-built Firecracker or Kata for other clouds and on-premises; Docker Sandboxes only if Docker provides written terms and a server-side orchestration path.

**Checks before choosing Nitro Sandboxes** (launched 2026-11-09): supported instance types, density and cold start measured on one real instance, and how its attestation fits with the ClawQL egress proxy and vault.

**First independent results (Emir Beganovic, 2026-11-11; to be reproduced on our own instances):** Firecracker 1.18 runs through `/dev/nitro_enclaves` with no KVM in the instance, so on AWS it needs neither bare-metal instances nor nested virtualization. Nitro starts each microVM as a sibling of the instance: the instance provides its memory and runs its virtio backends, and Nitro runs its vCPUs. A cold boot to a finished command took about 319 ms on c8a (AMD) and 524 ms on c8i (Intel), with a tuned minimal guest kernel at 1 vCPU and 1 GiB. Current limits:

- **No snapshots or pause:** every start is a cold boot, never a near-instant restore.
- **No memory overcommit,** and CPU overcommit stops at 5×: an idle sandbox still holds all of its RAM.
- **Confidential mode with attestation exists;** check how its I/O, which passes through the parent instance's virtio backends, fits the confidentiality boundary before relying on it.

**What this means for ClawQL Cloud:** Nitro Sandboxes fit always-on containers and confidential workloads well, priced on reserved memory since nothing can be oversold. They fit poorly for bursty per-execution sandboxes, where cold boots add latency and warm pools hold idle RAM; for those, Firecracker over KVM (nested virtualization on some Intel instance types since February 2026, or bare metal) keeps snapshot and restore. ClawQL's density advantage stays in parked durable agents, not in containers.

**Conditions before choosing Docker Sandboxes:** written terms for running customers' workloads as a paid service; an account model for customer sandboxes; supported headless server operation (KVM, keyring); a server-side orchestration path; and a story for BYOC. Docker's cloud sandboxes also cap each session at 24 hours, which rules them out for always-on containers.

**Interface:** define a `SandboxRuntime` interface now (create, start, stop, snapshot, attach network policy, inject credentials through the proxy, destroy). Everything above it stays runtime-agnostic.

**Decision criteria:** isolation strength, density and cold start measured on one real host, operating load, licensing, BYOC fit, and cost.

**Either way,** Docker's isolation model is the checklist for the phase 4 security gate: UDP off by default, ICMP blocked, DNS through a policy-enforcing resolver, no host Docker socket, no credentials inside the VM, and no stdio MCP servers running on the host.

### Runtime pricing (checked 2026-11-09)

| Option | What you pay | Notes |
| --- | --- | --- |
| AWS Nitro Sandboxes | No additional charge; only the EC2 instances they run on | Cost per sandbox is the instance price divided by how many sandboxes it packs, so density sets the unit cost |
| Firecracker or Kata | Nothing for the software; only the host compute | On AWS, Firecracker 1.18 runs through Nitro without bare-metal instances or nested virtualization; the KVM path (nested virtualization or bare metal) is what keeps snapshots |
| Docker local sandboxes | Free, including commercial use, on your own machines | Hosting customers' workloads still needs written terms |
| Docker Cloud Sandboxes | Per second: 1 vCPU / 2 GiB $0.07/h; 2 / 4 $0.14/h; 4 / 8 $0.28/h; 8 / 16 $0.56/h; 16 / 32 $1.12/h | Paused sandboxes cost nothing; 1 hour default and 24 hours maximum per session |

**Market reference for ClawQL's container prices.** Managed agent sandboxes cluster around $0.05 per vCPU-hour plus about $0.016 per GiB-hour: E2B and Daytona both list $0.0504 per vCPU-hour and $0.0162 per GiB-hour, and Vercel Sandbox lists $0.128 per active vCPU-hour plus $0.0212 per GB-hour. Primcloud's long-running containers start at $5 per 512 MB per month. "Market rates" for ClawQL containers means pricing in this range; the margin comes from packing sandboxes densely onto instances, which is why density is measured before any price is published. AWS Lambda MicroVMs, which do offer snapshots and suspend and resume, were reported at about $0.11 per vCPU-plus-GiB-hour, roughly 3.5 times the cost of running Nitro Sandboxes yourself even half-empty (Emir Beganovic, 2026-11-11).

## Observability

Every customer gets default, agent-specific dashboards. How their telemetry is stored and isolated depends on their tier (see "Telemetry isolation by tier" below): paid customers get structural isolation, where leaking one customer's telemetry to another is impossible by construction, not merely prevented by configuration.

- **Cardinality caps per tenant:** limits on series, ingestion rate and retention. Unique label combinations, not volume, drive cost. Retention length is a tier lever.
- **Agent-specific dashboards:** pending and expired approvals, blocked egress attempts, untrusted-label propagation, tool calls by outcome, token spend per agent, resume and replay counts. Container CPU and memory come standard as well.
- **Telemetry is sensitive:** run the same redaction as agent traffic before ingestion, and enforce tenant isolation on queries as well as ingestion.
- **Audit stays separate:** logs may be sampled or dropped; the hash-chained, WORM-capable audit log never is.

### Telemetry isolation by tier

Two requirements drive this: it must be **structurally impossible** for one customer's telemetry to reach another, and deletion must be **provable**. Isolation by tenant ID alone is a policy boundary (one bug in a proxy or a cache key and data crosses), because a shared stack's processes and caches hold every tenant's data in the same memory. So shared stacks are limited to customers who accept logical isolation.

| Tier | Architecture | Isolation |
| --- | --- | --- |
| Free and trial | Shared multi-tenant LGTM stack (Loki, Grafana, Tempo, Mimir) on object storage | Logical, by tenant ID, disclosed as such |
| Paid (default) | Per-tenant data plane | Structural: credentials and keys make cross-tenant access impossible |
| Full-isolation add-on (paid extra) | Dedicated LGTM stack with Grafana, high availability, its own compute and network | Complete |
| ClawQL's own platform telemetry | Shared internal stack | Carries no customer data |

**Free and trial: shared stack, with guardrails.** Loki, Mimir and Tempo separate tenants by the `X-Scope-OrgID` header and trust whatever value arrives, so an authenticating proxy sets the header from the caller's verified identity and strips any client-supplied value; nothing else can reach those APIs. Per-tenant limits on series, ingestion and retention apply, retention is short, and the free tier's terms state that isolation is logical and that regulated data (such as PHI) is not permitted. Upgrading moves a tenant's data to the paid architecture.

**Paid: per-tenant data planes.**

- **Storage and keys:** each tenant's telemetry goes to its own bucket, encrypted with its own key. Edge agents (Vector) write directly to it in a columnar format such as Parquet.
- **Workers with tenant-only credentials:** queries and alert evaluation run in short-lived workers holding only that tenant's role, which can read only that tenant's bucket and decrypt only with that tenant's key. A bug in a worker cannot leak another tenant's data, because the worker has no permission to read it.
- **Shared components route, never hold data:** a router authenticates the caller and starts a worker with the matching role; it never touches telemetry.
- **Query engine:** DuckDB over the tenant's Parquet files, serving dashboards in ClawQL's own interface. Idle cost is storage alone, with compute only while someone is querying.
- **Tradeoffs accepted:** a cold worker adds roughly a second of query latency (active tenants' workers are kept warm); alerts are evaluated at the edge for simple thresholds or by scheduled per-tenant workers; and it is more engineering than deploying a shared stack.

**Full-isolation add-on.** A dedicated LGTM stack per customer for those who want the full Grafana experience, heavy high-cardinality workloads, or complete separation. A minimal single-instance stack is roughly 2 to 4 vCPUs and 4 to 8 GB of RAM (Grafana's own small-deployment minimum is 2 cores and 2 to 4 GB, before the Loki, Mimir and Tempo backends), and two to three times that with high availability, held whether idle or not. Priced as an add-on accordingly; measure before publishing a price.

**Provable deletion (paid tiers).** Disable the tenant's key immediately (which blocks all access at once), schedule its destruction (AWS key deletion has a mandatory waiting period of days), and delete the bucket. Each step is recorded in the WORM trail. Once the key is destroyed, any surviving copy, in a backup or a cache, is unreadable.

**Licensing.** Grafana, Loki, Tempo and Mimir are AGPLv3. Offering them in a hosted service is allowed, but modified versions must have their source made available to the users who interact with them over a network. Running them unmodified behind ClawQL's proxy avoids most of that; confirm with counsel before launch.

### Edge and self-hosted telemetry

Provider-network nodes and self-hosted installs run on networks ClawQL does not control, often on someone's home or office connection. Their telemetry follows the pattern large edge fleets use (Chick-fil-A runs it across about 2,800 restaurant clusters):

- **One controlled egress path.** Nothing on a node ships telemetry directly to any cloud, including third-party tools and MCP servers that would otherwise phone home. Everything leaves through the node's own pipeline, under the same default-deny egress rule as everything else.
- **Errors by default, detail on demand.** Nodes ship errors and first-class metrics; debug logs stay in rolling local storage. Raising a node to debug is a governed action: a person approves it with a time limit, it reverts on its own, and it is audited.
- **Never degrade the owner's network.** The edge gateway caps its own bandwidth, so contributing compute can never slow the owner's connection. This is a condition of the provider network, enforced by the agent and backstopped at the operating-system level.
- **Buffer offline, drain later.** Telemetry buffers to disk while offline and uploads when the connection returns.
- **Redact before it leaves the machine,** with the same redaction rules as live traffic.

**Agent: Vector.** Vector is an open-source observability pipeline written in Rust, licensed MPL-2.0 and maintained by Datadog's open-source team, with collection, in-flight filtering and redaction, disk buffers, and fan-out to many backends, including the Loki and Mimir stores in ClawQL's LGTM stack. MPL-2.0 is file-level copyleft: using and distributing Vector is fine for a hosted service, and only changes made to Vector's own files must be shared. Two limits: Vector's metrics support is still marked beta and traces are not yet supported, so traces go through an OpenTelemetry Collector to Tempo; and Vector is never the audit path.

**The audit stream has its own pipeline.** Logs and metrics can be filtered, sampled and dropped; WORM entries cannot. On every node, audit entries are hash-chained locally, buffered through the outbox, never sampled or filtered, and drained in full.

## Pricing and unit economics

The price edge applies to parked durable agents only. In the measured offloaded mode an idle agent costs about 1 KiB of RAM plus about 66 KB of disk, a tiny fraction of a cent per month. Containers cost RAM and CPU like on any platform, so they price at market rates.

| Item | Pricing shape |
| --- | --- |
| Durable agents | Free or near-free while parked; billed per active turn or active minute; governance included |
| Webhook ingress | Included or near-free; billed by event volume above a cap |
| Containers | Per-minute, at market rates (reference: Primcloud at $5 per 512 MB) |
| Model calls | Bring your own keys, kept in the vault, or passed through at cost |
| Observability | Included; retention and cardinality limits scale by tier |
| Dedicated, BYOC, hardened | Premium per tier |

**Gate:** no public price until unit costs are measured on one real host. That means agents driven through real runtime turns, containers at realistic sizes, and the host's monthly cost divided by what it carries. Current density figures are lab results, partly written directly to disk, and do not set prices.

**Competition:** Cloudflare Durable Objects also charge almost nothing for idle objects. Price alone will not win there; the edge is governance built in, the same stack self-hostable for free, and no lock-in.

## Build order and gates

Phases ship in order, and three gates block progress until their criteria are met. Billing on any tier waits on the Stripe fix, and no public price ships before real-host costs are measured.

**Build order:** seven phases with three blocking gates (diagram may live in the working Claude artifact). The density advantage first shows in phase 2, so that is where pricing is tested. Phase 7 is built only on demand. Phase 2 also opens schema work for the [Streams autonomous loop](../streams/clawql-streams-autonomous-loop.md) (workers as durable agents); phase 1 has no loop work.

Each phase also has a security gate that is part of its definition of done. The gates live in the [ClawQL security testing plan](../security/clawql-security-testing-plan.md).

**Durability gate status (2026-11-09): met.** v4 is authorized on ClawQL's lab build of celld (stock 0.6.3 plus the supersede and expiry fixes). The authorizing soak (1,000/1,000 cycles, no void) and the v4 board (N=1,000) ran the same binary, proven inside both artifacts: commit `36d53565`, matching SHA-256. Results: zero wrong outcomes; in 241 of 243 crashes during an external call the journaled intent was visible on recovery, and the other 2 never sent the call (settled through their effect ledgers as no effect and no lost intent — [`settle`](../benchmarks/program-cell-fleet-kill/v4-identity-remeasure-during-call-settle.json)); 18 of 1,000 trials missed the recovery deadline (1.8%, under the 2% gate), 11 of them from failures in the harness's own fault injection. Recovery is slower than on the first v4 board (median about 17 seconds versus about 7) because a stalled owner is now fenced rather than presumed dead, a deliberate trade of speed for correctness. Open items stay beside the claim: an earlier 3-second-TTL board recorded 2 lost intents in 100 (one later classified as an injection miss on journal evidence, one unsettled), and forced-latency tests are in progress. See [`V4_CLAIM.md`](../benchmarks/program-cell-fleet-kill/V4_CLAIM.md).

## Scale targets

### Goal and claim discipline

The internal goal is to beat the largest published agent-gateway deployments, with Uber as the reference point. Aim extremely high and prove it one piece at a time.

The public claim is always the measured result, never a comparison to a company we have not measured head to head. Example of an acceptable claim: "100M governed calls in 24 hours, zero audit gaps." Never "beats Uber." Uber's name stays out of ClawQL marketing.

### Targets from published figures

| Published reference (Uber, 2026) | ClawQL target |
| --- | --- |
| ~100M model requests per day across 800+ projects (~1,150/s average) | An "Uber day": 100M governed calls in 24 hours, then 10x |
| 800+ MCP servers and 5,000+ tools behind one gateway | Test catalog of 1,000 servers and 5,000+ tools |
| 40%+ token savings from the gateway | Beat 40% on an equal-arm workload against the same baseline |
| A production fleet | Scale-out with a measured efficiency curve at 1, 4 and 16+ instances |

Source figures come from Uber's public engineering writing and talks (2026). Re-check them before any milestone is published.

### Where we stand

One instance on Bun sustained ~1,850 RPS at peak on a simple operation against a mock upstream, host-bound. Scale-out, governance enforcement under load, audit at volume, large catalogs, real upstreams and failover are not yet measured. The current safe claim is the single-instance figure with those limits stated.

### Milestones

1. **Single instance, governance and audit on.** Measure throughput and latency with enforcement, labels, approvals and hash-chained audit active. Answers early whether a single audit chain is a bottleneck (chains are sequential) and whether sharded chains are needed.
2. **Topology B: four instances behind a load balancer.** Report scaling efficiency (throughput at 4 ÷ 4× throughput at 1).
3. **5,000-tool catalog.** Confirm token savings, discovery cost and latency hold at catalog size.
4. **Sixteen or more instances** at and above the Uber-average rate, with failure injection.
5. **The Uber day.** 24 hours, 100M governed calls.

### Uber-day pass criteria (draft, freeze before the run)

- 100M governed calls completed in 24 hours.
- Governance enforcement and audit on for every call; no benchmark bypass modes.
- Failures injected during the run: instance kills, upstream outages, and slow or erroring upstreams.
- Zero audit gaps: every call has an audit entry and every chain verifies end to end.
- Zero duplicate side effects on consequential writes.
- A stated p99 latency target for gateway-added latency, set before the run.
- Same evidence rules as durability boards: frozen criteria, append-only logs, no overwrite, void only on monitored environment faults.

### Open questions on scale

- [ ] p99 gateway-added latency target for milestones 4 and 5.
- [ ] Upstream model for realistic latency and error rates: mock with injected distributions, real public APIs, or AWS Emulator (released November 2026, public domain under CC0, 200+ AWS services running locally and offline; see whitepaper [§7 Smithy](../vision/clawql-network-whitepaper-v0.2.md#smithy-governance-metadata-from-the-spec-itself)), which gives real API behavior with no cost, no rate limits and no risk; real APIs remain necessary for realistic latency.
- [ ] Source for the 5,000-tool catalog (for example, public OpenAPI collections) and how to keep it representative.
- [ ] Token-savings baseline definition so the 40% comparison is like for like.
- [ ] Hardware and cost budget for the 16-instance and 24-hour runs.
- [ ] Whether each milestone is a ClawQL-only board or also invites peer arms.

## Distribution

- **Docker Sandboxes + ClawQL setup guide:** the agent runs in a Docker sandbox whose network policy allows only the model provider and the ClawQL gateway, and every tool call goes through ClawQL. Isolation comes from Docker, governance from ClawQL. It is cheap to write, reaches Docker's user base, and complements their product.
- **One-click personal agent harnesses: Hermes Agent and Pi.** Two of the most common personal agent harnesses can be enabled from the same ClawQL Cloud dashboard as everything else, already wired to ClawQL as their governed tool layer. Hermes users reach their agent from about thirty messaging platforms; Pi users get virtual-model routing. Both are the personal-to-enterprise funnel. What ClawQL adds to each:
  - **Tool-level governance for chat.** Messages from anyone other than an admin carry untrusted labels, so a consequential tool call they drive needs an admin's approval, beyond any harness-level gating of slash commands.
  - **Risk-tiered approval channels.** Low-risk approvals can be answered with a chat button; consequential ones require a stronger person-bound signature, such as a passkey, because a chat or SMS account can be taken over.
  - **Channel identity checked, not assumed.** Senders on channels whose identity is easy to forge (email From headers, SMS sender IDs) are treated as untrusted unless verified (for example, by DKIM on email).
  - **Policy-routed virtual models** behind ClawQL's endpoint, with labels as hard constraints on where a request may go (whitepaper [section 9](../vision/clawql-network-whitepaper-v0.2.md#9-the-centralized-path-enterprise-deployment)).
  - **Honest outbound delivery.** Messages whose delivery is uncertain after a crash are resent with a visible "may be a duplicate" label, never silently, since chat platforms offer no idempotency keys.

  Integrations are credited to their projects, and no comparison is attached.

## Funnel: the provider network

ClawQL Inference already has one door: developers swap in an OpenRouter-compatible URL and become consumers. The provider network adds a second door: people with idle hardware join as inference providers, the way they do with Darkbloom. Either way they sign up for ClawQL Cloud. This is a funnel layered on top of Cloud, not a new build phase.

- **Providers already run ClawQL.** A node runs the ClawQL edge gateway, so every provider has the software installed, an account, and a reason to explore the rest of the platform.
- **Earnings flow back into the platform.** Providers earn ClawQL credits and spend them on governed agents, durable runtime and containers.
- **Policy is the router.** Labels and the ontology decide where each request may run: public, low-sensitivity work on community nodes; confidential work on attested TEE nodes or ClawQL-operated capacity; PHI only on providers with a BAA. This is the governance engine's most visible demo, and it closes the gap Darkbloom admits (the provider is a plaintext endpoint) by policy rather than by trust.
- **Loops give providers more than chat completions.** Planner-and-worker tasks, evals and batch jobs are dispatched as typed intents with leases.

### Conditions

1. **Credits before cash.** Cash payouts bring money-transmission, KYC, tax-reporting and sanctions obligations; credits largely avoid them (confirm with counsel). Cash payouts (x402, Stellar) come later.
2. **Careful seed demand.** First demand is ClawQL's own low-sensitivity batch work: open-weight evals, benchmark runs and public-data jobs. Customer memories, embeddings of customer data, and dreaming over them never run on community nodes.
3. **Verify untrusted output.** Re-run a sample of community-node work on trusted capacity and feed the results into DAOS reputation.
4. **Test demand first.** Routing to Darkbloom as a labeled upstream ("plaintext at a third party") can test demand for community-grade inference before ClawQL builds its own provider side.
5. **Depends on billing.** The provider network waits for the Stripe idempotency fix, and cash payouts wait for legal review.

### Pricing: markets that clear on supply and demand

Consumers and providers meet on a price that moves with supply and demand. Excess supply lowers the price and attracts consumers; excess demand raises it and attracts providers. Batch work can wait for cheap periods while interactive work pays a premium. Pricing balances the market; it does not verify output or settle the legal questions above.

- **One market per segment:** price per model, trust tier (community, attested TEE, ClawQL-operated, BAA) and latency class. Policy decides which markets a request may clear in, so a PHI request never clears against community supply.
- **Utilization-targeted base price:** each market's base price moves toward a target utilization (for example 70%) with a capped change per interval, in the style of Ethereum's EIP-1559. Per-request auctions are avoided because they add latency and consumers need the price before sending.
- **Bids and floors:** consumers set a maximum price and providers a minimum. ClawQL Cloud capacity at a fixed price is the ceiling and backstop, so consumers always have a guaranteed option.
- **A floor for early supply:** a small base reward for attested, online nodes (as Darkbloom pays) keeps providers through thin early demand.
- **Anti-manipulation:** a spread or fee on every match, rate caps on price changes, and reputation weighting make withholding supply or self-dealing unprofitable.
- **Stable credits for consumers:** the market sets how many credits a unit of compute earns, but a credit's spending value on ClawQL Cloud stays fixed.

### Open questions

- [ ] Trust tier for Apple Silicon nodes, which lack SEV-SNP, TDX or Nitro-style confidential VMs.
- [ ] Target utilization, change cap and spread for each market.
- [ ] Size and funding of the base reward pool.
- [ ] Whether to route to Darkbloom as an upstream before building ClawQL's own provider side.

## Claims discipline and open questions

Marketing for ClawQL Cloud follows the same standard as the benchmarks: claim only what is measured.

- Crash-safety claims for the durable runtime are scoped to the authorized lab build and its measured numbers (v4 authorized 2026-11-09), and open items are always shown beside the claim.
- No payment crash-safety or billing claims until the Stripe write-ahead fix lands and is measured.
- No "denser than" or price-advantage claim until real-host unit costs are measured. Infinity history-memory board is ~29% (100k vs 77.5k under 2× latency), not full-stack density, and waits on maintainer review — see [Infinity + Nitro composition](./infinity-density-nitro-composition.md). Density and Nitro compose as **tenant VM × dense in-tenant runtime × per-execution sandbox**, not one agent per VM. Independent Nitro Sandboxes cold-boot figures (Emir Beganovic, 2026-11-11) are recorded here for direction and must be reproduced on ClawQL-owned instances before any Cloud price or density claim cites them.
- No runtime-detection promise on microVM tiers until in-guest sensors are confirmed.
- Containers are never described as getting the same crash safety as durable agents.

### Open questions

- [ ] Exact meaning and enforcement of "dedicated" for durable agents: separate nodes only, or separate clusters?
- [ ] Does Kata support Falco and Tetragon sensors in the guest well enough to ship?
- [ ] Istio ambient or sidecar mode on microVM pods?
- [ ] Per-turn or per-active-minute billing for durable agents?
- [ ] First language for a durable-tier SDK beyond TypeScript (Python assumed)?
- [ ] Which compliance path first: BAA template, SOC 2 Type I, or both?
- [ ] Acceptable use policy and abuse detection for customer containers (outbound scanning, crypto mining).
- [ ] Container runtime: AWS Nitro Sandboxes, Docker Sandboxes, or self-built Firecracker/Kata, decided against the criteria above.
- [ ] Recovery time: evaluate hedged execution of decided intents for upstream services that accept idempotency keys, so recovery does not wait for a lease to expire; model it in TLA+ first (whitepaper [section 11](../vision/clawql-network-whitepaper-v0.2.md#11-clawql-cellrt-the-runtime-substrate)).
- [ ] Provider-network coordination: DAG-based asynchronous BFT versus TEE-assisted BFT for public Virtual Gateways, and QuePaxa for single-organization gateways over wide-area links (whitepaper [section 10](../vision/clawql-network-whitepaper-v0.2.md#10-the-decentralized-path-the-provider-network)).
- [ ] Will Docker provide written terms for hosting third-party workloads on Sandboxes?

## Changelog

- **2026-11-03:** plan frozen as v1.
- **2026-11-05:** positioning update, personal-to-enterprise funnel (now the "Positioning" section).
- **2026-11-05:** scale targets and the Uber-day milestone (now the "Scale targets" section).
- **2026-11-08:** container runtime marked under evaluation (Docker Sandboxes or Firecracker/Kata) with a `SandboxRuntime` interface; governance features (policy replay, shadow-mode intent allowlists); model-credential boundary; connectors plan; security gates linked to the build order; durability gate status; Docker Sandboxes distribution guide; two runtime open questions.
- **2026-11-08:** provider-network funnel (providers earn credits, policy as router, conditions) and supply-and-demand pricing per market segment.
- **2026-11-09:** AWS Nitro Sandboxes added as a third container-runtime path, with Firecracker as the likely common layer; runtime pricing and market reference prices added.
- **2026-11-09:** customer-tailnet connectivity through Tailscale OAuth apps added to Connectors as a lighter alternative to BYOC.
- **2026-11-09:** durability gate marked met: v4 authorized after the binary-identity remeasure, with results and open items recorded in the build order.
- **2026-11-10:** edge and self-hosted telemetry added to Observability: one controlled egress path, time-boxed debug escalation, bandwidth caps for provider nodes, Vector as the agent, and a separate audit pipeline.
- **2026-11-10:** preview-before-approval and governed on-chain actions added to governance features.
- **2026-11-10:** in-repo canonical copy at `docs/gtm/clawql-cloud-platform-plan.md`; next durability board notes linked beside the met gate.
- **2026-11-11:** first independent Nitro Sandboxes results recorded (Firecracker 1.18 without KVM, cold-boot times, no snapshots or memory overcommit), with the fit for always-on versus bursty sandboxes and a Lambda MicroVMs price reference.
- **2026-11-11:** telemetry isolation by tier: shared stack for free and trial only, per-tenant data planes with structural isolation for paid customers, a dedicated-stack add-on, and provable deletion.
- **2026-11-11:** two open questions added: hedged execution to cut recovery time, and the consensus choice for provider-network coordination.
- **2026-11-11:** Hermes Agent and Pi added as one-click harnesses on the dashboard, with tool-level chat governance, risk-tiered approval channels, channel identity checks, policy-routed virtual models, and labeled ambiguous resends.
- **2026-11-11:** the positioning and scale-target tabs merged into this single document; their content is unchanged.
- **2026-11-11:** AWS Emulator added as an upstream option for scale testing.
- **2026-11-11:** security testing plan landed in-repo (`docs/security/clawql-security-testing-plan.md`) with on-chain, telemetry-isolation, and AWS Emulator destructive-action gates.
