# ClawQL Cloud: platform plan

Nov 3, 2026 · @Daniel

**In-repo canonical copy** of the living Cloud plan (Claude artifact remains a working surface). Durability evidence: [`../benchmarks/program-cell-fleet-kill/V4_CLAIM.md`](../benchmarks/program-cell-fleet-kill/V4_CLAIM.md) · during-call settle [`../benchmarks/program-cell-fleet-kill/v4-identity-remeasure-during-call-settle.json`](../benchmarks/program-cell-fleet-kill/v4-identity-remeasure-during-call-settle.json). Network whitepaper (§11 runtime substrate): [`../vision/clawql-network-whitepaper-v0.2.md`](../vision/clawql-network-whitepaper-v0.2.md).

## Status and summary

ClawQL Cloud is an agent-specific cloud that is governed by default, plus a simple container runtime for customer images that run alongside agents. This plan was frozen on 2026-11-03 and is the next build track, developed alongside or as part of the managed gateway offering.

The price edge comes from the density work: parked durable agents cost almost nothing to host. Everything except the container runtime stays agent-specific: approvals, untrusted labels, vault credentials, crash-safe writes, tamper-evident audit, and sandboxed execution.

This is a living plan. Additions are recorded in the changelog at the end; the v2 and v3 tabs hold earlier amendments and still apply. **Durability gate: met (2026-11-09).** Revisit when unit costs are measured on a real host, when the Stripe idempotency fix lands, and when the next durability board profiles recovery time and injection reliability.

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

**Conditions before choosing Docker Sandboxes:** written terms for running customers' workloads as a paid service; an account model for customer sandboxes; supported headless server operation (KVM, keyring); a server-side orchestration path; and a story for BYOC. Docker's cloud sandboxes also cap each session at 24 hours, which rules them out for always-on containers.

**Interface:** define a `SandboxRuntime` interface now (create, start, stop, snapshot, attach network policy, inject credentials through the proxy, destroy). Everything above it stays runtime-agnostic.

**Decision criteria:** isolation strength, density and cold start measured on one real host, operating load, licensing, BYOC fit, and cost.

**Either way,** Docker's isolation model is the checklist for the phase 4 security gate: UDP off by default, ICMP blocked, DNS through a policy-enforcing resolver, no host Docker socket, no credentials inside the VM, and no stdio MCP servers running on the host.

### Runtime pricing (checked 2026-11-09)

| Option | What you pay | Notes |
| --- | --- | --- |
| AWS Nitro Sandboxes | No additional charge; only the EC2 instances they run on | Cost per sandbox is the instance price divided by how many sandboxes it packs, so density sets the unit cost |
| Firecracker or Kata | Nothing for the software; only the host compute | Check whether Nitro Sandboxes removes the need for bare-metal instances on AWS |
| Docker local sandboxes | Free, including commercial use, on your own machines | Hosting customers' workloads still needs written terms |
| Docker Cloud Sandboxes | Per second: 1 vCPU / 2 GiB $0.07/h; 2 / 4 $0.14/h; 4 / 8 $0.28/h; 8 / 16 $0.56/h; 16 / 32 $1.12/h | Paused sandboxes cost nothing; 1 hour default and 24 hours maximum per session |

**Market reference for ClawQL's container prices.** Managed agent sandboxes cluster around $0.05 per vCPU-hour plus about $0.016 per GiB-hour: E2B and Daytona both list $0.0504 per vCPU-hour and $0.0162 per GiB-hour, and Vercel Sandbox lists $0.128 per active vCPU-hour plus $0.0212 per GB-hour. Primcloud's long-running containers start at $5 per 512 MB per month. "Market rates" for ClawQL containers means pricing in this range; the margin comes from packing sandboxes densely onto instances, which is why density is measured before any price is published.

## Observability

Every customer gets default dashboards on a multi-tenant LGTM stack (Loki, Grafana, Tempo, Mimir), separated by tenant ID and stored on object storage.

- **Cardinality caps per tenant:** limits on series, ingestion rate and retention. Unique label combinations, not volume, drive cost. Retention length is a tier lever.
- **Agent-specific dashboards:** pending and expired approvals, blocked egress attempts, untrusted-label propagation, tool calls by outcome, token spend per agent, resume and replay counts. Container CPU and memory come standard as well.
- **Telemetry is sensitive:** run the same redaction as agent traffic before ingestion, and enforce tenant isolation on queries as well as ingestion.
- **Audit stays separate:** logs may be sampled or dropped; the hash-chained, WORM-capable audit log never is.

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

Each phase also has a security gate that is part of its definition of done. The gates live in the ClawQL security testing plan (working artifact).

**Durability gate status (2026-11-09): met.** v4 is authorized on ClawQL's lab build of celld (stock 0.6.3 plus the supersede and expiry fixes). The authorizing soak (1,000/1,000 cycles, no void) and the v4 board (N=1,000) ran the same binary, proven inside both artifacts: commit `36d53565`, matching SHA-256. Results: zero wrong outcomes; in 241 of 243 crashes during an external call the journaled intent was visible on recovery, and the other 2 never sent the call (settled through their effect ledgers as no effect and no lost intent — [`settle`](../benchmarks/program-cell-fleet-kill/v4-identity-remeasure-during-call-settle.json)); 18 of 1,000 trials missed the recovery deadline (1.8%, under the 2% gate), 11 of them from failures in the harness's own fault injection. Recovery is slower than on the first v4 board (median about 17 seconds versus about 7) because a stalled owner is now fenced rather than presumed dead, a deliberate trade of speed for correctness. Open items stay beside the claim: an earlier 3-second-TTL board recorded 2 lost intents in 100 (one later classified as an injection miss on journal evidence, one unsettled), and forced-latency tests are in progress.

**Next durability board (locked beside the claim):** keep counting all `pause_failed` trials against availability; fix injection reliability before the run. Treat resume time as a product metric and profile the remesure ≈17s median against the 3s lease (excess over TTL is the open engineering question). See [`V4_CLAIM.md`](../benchmarks/program-cell-fleet-kill/V4_CLAIM.md).

## Distribution

- **Docker Sandboxes + ClawQL setup guide:** the agent runs in a Docker sandbox whose network policy allows only the model provider and the ClawQL gateway, and every tool call goes through ClawQL. Isolation comes from Docker, governance from ClawQL. It is cheap to write, reaches Docker's user base, and complements their product.

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
- No "denser than" or price-advantage claim until real-host unit costs are measured. Infinity history-memory board is ~29% (100k vs 77.5k under 2× latency), not full-stack density, and waits on maintainer review — see [Infinity + Nitro composition](./infinity-density-nitro-composition.md). Density and Nitro compose as **tenant VM × dense in-tenant runtime × per-execution sandbox**, not one agent per VM.
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
- [ ] Will Docker provide written terms for hosting third-party workloads on Sandboxes?

## Changelog

- **2026-11-03:** plan frozen as v1.
- **2026-11-05:** positioning update, personal-to-enterprise funnel (v2 · Positioning update).
- **2026-11-05:** scale targets and the Uber-day milestone (v3 · Scale targets).
- **2026-11-08:** container runtime marked under evaluation (Docker Sandboxes or Firecracker/Kata) with a `SandboxRuntime` interface; governance features (policy replay, shadow-mode intent allowlists); model-credential boundary; connectors plan; security gates linked to the build order; durability gate status; Docker Sandboxes distribution guide; two runtime open questions.
- **2026-11-08:** provider-network funnel (providers earn credits, policy as router, conditions) and supply-and-demand pricing per market segment.
- **2026-11-09:** AWS Nitro Sandboxes added as a third container-runtime path, with Firecracker as the likely common layer; runtime pricing and market reference prices added.
- **2026-11-09:** customer-tailnet connectivity through Tailscale OAuth apps added to Connectors as a lighter alternative to BYOC.
- **2026-11-09:** durability gate marked met: v4 authorized after the binary-identity remeasure, with results and open items recorded in the build order.
- **2026-11-10:** in-repo canonical copy at `docs/gtm/clawql-cloud-platform-plan.md`; next durability board notes (keep `pause_failed` on availability; profile ≈17s recovery vs 3s lease) linked beside the met gate.

---

# v2: Positioning update (frozen 2026-11-05)

This version amends v1's positioning only. Everything in v1 not changed here still stands: workload model, isolation tiers, governance per workload, webhook ingress, container security, observability, pricing gates, build order and claims discipline.

## What changed and why

v1 implied a split between personal and enterprise markets. That was wrong. Personal use is the adoption funnel into enterprise: developers adopt tools for their own problems, then ask for the same tools at work because they already know them. ClawQL has always targeted both ends; v2 makes that explicit.

The trigger was Executor v2's launch (2026-11-05), which repositions Executor as code-defined personal software (apps with skills, UI, tools, workflows, triggers and storage) with an MCP gateway as the entry point.

## Positioning: continuity, not market

ClawQL is the same tool, with the same guardrails, from a developer's laptop to their company. It is enterprise-grade and built for large scale, and equally meant for personal developers solving their own problems.

The differentiation is where authority lives:

- **Rules the agent can't rewrite.** Convenience rules (for example, auto-approve actions in my own GitHub org) are as easy to set up as anywhere else, but a person authors them and the agent cannot edit them.
- **The same property at work.** When a developer brings ClawQL into their company, the guarantee their security team needs is already there; nothing changes tools or habits.

Tagline candidate: *convenience rules the agent can't rewrite.*

## Personal on-ramp

- Short path to value: npx, local, useful in minutes, with no enterprise setup visible until someone needs it.
- Governance stays light by default for personal use, with stronger controls opt-in and the same mechanisms underneath.

## Lead personal demo

mcp-ui / htmx with mcp-api-adapter: build a custom frontend over any API added to ClawQL, or any site that exposes WebMCP tools. The demo should cover common personal-software asks, each with the rule held outside the agent's reach:

- Two accounts of one service at once (for example, company and personal Notion).
- A conditional approval (auto-approve in my own org, otherwise ask me).
- Skills pinned to a specific git SHA.

Present it as ClawQL's own demo, not as a reply to any peer launch.

## Competition notes

- **Executor v2:** overlaps on the gateway and on personal software. Its approval policy is code inside apps an agent can write; ClawQL's design difference is authority outside the agent. Frame as a design difference, never as a flaw.
- **Growing overlap:** Executor's triggers, workflows and storage approach ClawQL Cloud's webhook ingress and durable agents. The edge there stays the same: governed by default, crash-safe writes, tamper-evident audit, self-hostable.
- **Benchmarks:** compare where products overlap (gateway tokens, governance cells on each product's recommended v2 configuration). Whether the Executor HTTP concurrency row stays depends on whether its maintainer confirms multi-client serving is a supported v2 setup.

## Open questions added in v2

- [ ] Is there a free personal tier on shared durable agents, and what are its limits?
- [ ] What is the default rule set for personal installs, and how does a user author and lock convenience rules?
- [ ] Does the personal demo ship before or alongside the managed gateway (build phase 1)?

---

# v3: Scale targets (frozen 2026-11-05)

This version adds scale targets. v1 and v2 still stand.

## Goal and claim discipline

The internal goal is to beat the largest published agent-gateway deployments, with Uber as the reference point. Aim extremely high and prove it one piece at a time.

The public claim is always the measured result, never a comparison to a company we have not measured head to head. Example of an acceptable claim: "100M governed calls in 24 hours, zero audit gaps." Never "beats Uber." Uber's name stays out of ClawQL marketing.

## Targets from published figures

| Published reference (Uber, 2026) | ClawQL target |
| --- | --- |
| ~100M model requests per day across 800+ projects (~1,150/s average) | An "Uber day": 100M governed calls in 24 hours, then 10x |
| 800+ MCP servers and 5,000+ tools behind one gateway | Test catalog of 1,000 servers and 5,000+ tools |
| 40%+ token savings from the gateway | Beat 40% on an equal-arm workload against the same baseline |
| A production fleet | Scale-out with a measured efficiency curve at 1, 4 and 16+ instances |

Source figures come from Uber's public engineering writing and talks (2026). Re-check them before any milestone is published.

## Where we stand today

One instance on Bun sustained ~1,850 RPS at peak on a simple operation against a mock upstream, host-bound. Scale-out, governance enforcement under load, audit at volume, large catalogs, real upstreams and failover are not yet measured. The current safe claim is the single-instance figure with those limits stated.

## Milestones

1. **Single instance, governance and audit on.** Measure throughput and latency with enforcement, labels, approvals and hash-chained audit active. Answers early whether a single audit chain is a bottleneck (chains are sequential) and whether sharded chains are needed.
2. **Topology B: four instances behind a load balancer.** Report scaling efficiency (throughput at 4 ÷ 4× throughput at 1).
3. **5,000-tool catalog.** Confirm token savings, discovery cost and latency hold at catalog size.
4. **Sixteen or more instances** at and above the Uber-average rate, with failure injection.
5. **The Uber day.** 24 hours, 100M governed calls.

## Uber-day pass criteria (draft, freeze before the run)

- 100M governed calls completed in 24 hours.
- Governance enforcement and audit on for every call; no benchmark bypass modes.
- Failures injected during the run: instance kills, upstream outages, and slow or erroring upstreams.
- Zero audit gaps: every call has an audit entry and every chain verifies end to end.
- Zero duplicate side effects on consequential writes.
- A stated p99 latency target for gateway-added latency, set before the run.
- Same evidence rules as durability boards: frozen criteria, append-only logs, no overwrite, void only on monitored environment faults.

## Open questions

- [ ] p99 gateway-added latency target for milestones 4 and 5.
- [ ] Upstream model for realistic latency and error rates (mock with injected distributions, or real public APIs).
- [ ] Source for the 5,000-tool catalog (for example, public OpenAPI collections) and how to keep it representative.
- [ ] Token-savings baseline definition so the 40% comparison is like for like.
- [ ] Hardware and cost budget for the 16-instance and 24-hour runs.
- [ ] Whether each milestone is a ClawQL-only board or also invites peer arms.
