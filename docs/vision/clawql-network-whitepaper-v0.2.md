# The ClawQL Network

## A Unified Architecture for Verifiable Compute, Agent Intelligence, and Decentralized Provenance

**Whitepaper v0.2 (draft) — November 2026**

**Daniel Smith · daniel@clawql.com · clawql.com**

*Revision note: v0.2 adds section 28A, revises sections 7, 10, 11, 14, 19, 20, 22, 24, 35, 36, 38, 44, 46 and 47, adds a glossary entry for trust tiers, and updates the `clawql-cellrt` row of the package reference. All other text is unchanged from v0.1 (August 2026).*


**In-repo canonical copy** of Whitepaper v0.2 (draft). Crash-safety numbers in §11 are authorized on the lab build; evidence: [`docs/benchmarks/program-cell-fleet-kill/V4_CLAIM.md`](../benchmarks/program-cell-fleet-kill/V4_CLAIM.md) · during-call settle [`v4-identity-remeasure-during-call-settle.json`](../benchmarks/program-cell-fleet-kill/v4-identity-remeasure-during-call-settle.json). Cloud plan: [`docs/gtm/clawql-cloud-platform-plan.md`](../gtm/clawql-cloud-platform-plan.md).

---

## Abstract

ClawQL began as infrastructure for making AI agents reliable, auditable, and deployable in regulated environments. This document describes what it has become: a protocol-agnostic fabric connecting compute, storage, payments, and provenance across any chain, any API, and any hardware — with AI agent intelligence as the first, but not the only, workload it carries.

The thesis is simple. Every serious digital workflow needs four things: a way to *do* work (compute), a way to *prove* the work was done correctly (verification), a way to *remember* what was done (durable storage and audit trail), and a way to *settle* value for the work (payments). Today these four needs are solved by different, incompatible stacks depending on whether you're an AI company, a law firm, an insurance underwriter, a notary, or a DeFi protocol. ClawQL is the substrate that solves all four needs once, behind a single protocol-agnostic interface, verifiable by anyone regardless of which blockchain, which API, or which model they trust.

This document covers the full architecture: the protocol fabric that makes any transport interchangeable, the compute layer that runs both centralized enterprise deployments and a decentralized opt-in swarm, the security and attestation layer that makes every claim checkable, the storage layer that makes data permanent without a company owning it, the multi-chain provenance layer that makes timestamps and audit trails simultaneously private and verifiable, the payment layer that settles value across every rail without requiring any single one, and the economic model that lets anyone — from a hyperscale data center to a Raspberry Pi — participate and earn.

---

## Table of Contents

**Part I — Foundations**

1. The Problem
2. Design Principles
3. System Overview

**Part II — The Protocol Fabric**

4. Search and Execute: The Two-Primitive Interface
5. Input-Side Compression
6. Output-Side Compression
7. Any Protocol, One Interface
8. Why This Compounds: Cost, Quality, and Cache

**Part III — Compute**

9. The Centralized Path: Enterprise Deployment
10. The Decentralized Path: The Provider Network
11. clawql-cellrt: The Runtime Substrate
12. DAOS: Swarm Coordination and Diversity-Guided Recruitment
13. Ouroboros: The Evolutionary Agent Loop

**Part IV — Security and Trust**

14. clawql-tee: Hardware-Attested Execution
15. Panguard: Scope Enforcement at the Infrastructure Layer
16. clawql-sandbox: Fail-Closed Containment
17. Identity: SPIFFE/SVID, DPoP, and Workload Federation

**Part V — Memory and Audit**

18. clawql-audit: The WORM Trail
19. Hash Chains vs Merkle Trees: Getting the Primitives Right
20. clawql-memory: The Vault and the Ontology
21. System Self-Knowledge: Seeding the Vault With ClawQL's Own Capabilities

**Part VI — Decentralized Storage**

22. clawql-ipfs: Content-Addressed Hot Storage
23. clawql-arweave: Permanent Storage
24. The Trace Marketplace: Licensing Reasoning With Consent

**Part VII — Multi-Chain Provenance**

25. clawql-web3: Publish Once, Anchor Everywhere
26. Chain Selection and the Tribalism Problem
27. Relay Layers: Axelar, LayerZero, Wormhole, CCIP
28. Provenance as a Service: Beyond AI · 28A. Governed On-Chain Actions

**Part VIII — Payments**

29. clawql-payments: Settlement Without a Single Rail
30. x402 and HTTP-Native Micropayments
31. Cross-Border Settlement via Stellar

**Part IX — Events and Automation**

32. clawql-streams: Any Event, Any Action
33. Comparison to Chainlink CRE
34. The Automation Loop End to End

**Part X — The Economic Model**

35. Who Runs a Node and Why
36. The Four Revenue Streams
37. The Flywheel: Inference → Traces → Better Models → More Inference
38. The Model Marketplace: Selling Improvement Back to the Network
39. Reputation and the Diversity Dividend

**Part XI — Applications**

40. AI Agent Infrastructure (RockYourLobster)
41. Document Processing at Verifiable Scale (SeeTheGreens and Beyond)
42. Provenance for Regulated, Non-AI Industries
43. The Regulated Enterprise Thesis

**Part XII — Governance, Risk, and Roadmap**

44. What ClawQL Is Not
45. Risks and Honest Limitations
46. Relationship to Adjacent Projects
47. Build Sequence and Milestones

**Appendix**

- A. Glossary
- B. Package Reference
- C. Research Citations

---

# Part I — Foundations

## 1. The Problem

Every organization building serious AI agent deployments today runs into the same wall at roughly the same point. The model works. The demo is convincing. Then someone asks: what happens when the agent does something wrong? Who approved it? Can we prove what it did to a regulator, an auditor, or a court? Can we trust that the record of what happened hasn't been altered after the fact? And — increasingly — can we run any of this without our data leaving our own infrastructure?

These are not model problems. GPT-5.6, Claude Opus 5, Gemini 4 — none of them are worse or better at answering these questions, because none of them were designed to answer these questions. They are designed to reason and generate. The scaffolding around them is supposed to handle scope, memory, audit, and trust. Most scaffolding doesn't.

The same wall appears, with different vocabulary, in five other places that have nothing to do with AI:

An insurance company needs to prove a policy document existed, unmodified, at the moment a claim was filed — without exposing the document's contents to a third party.

A notary needs to timestamp a signature in a way that survives the notary's own business closing, without relying on any single company's servers still existing in twenty years.

A supply chain needs to prove a shipment's provenance across six intermediaries who don't trust each other and don't share a database.

A hospital needs an audit trail of who accessed a patient record and when, tamper-evident enough to survive a lawsuit, without putting protected health information anywhere near a public ledger.

A researcher needs to prove a dataset hasn't changed since a hypothesis was pre-registered, so that a later "we found this in the data" claim can be checked against what was actually there before anyone looked.

Every one of these is the same underlying problem: prove that something happened, at a specific time, unmodified, in a way that doesn't require anyone to trust the party making the claim. AI agent audit trails are a special case of this general problem, not a separate one.

Today, solving it means picking a stack and living with its limitations. Pick a blockchain, and you've picked a tribe, a fee structure, a finality time, and a community that may or may not still exist in five years. Pick a centralized logging vendor, and your proof is only as good as that vendor's continued existence and honesty. Pick nothing, and you have no proof at all — just a claim.

ClawQL's premise is that this fragmentation is unnecessary. The primitives — hash chains, Merkle trees, hardware attestation, content-addressed storage, multi-chain anchoring — are well understood and mostly free. What's missing is the layer that ties them together behind one interface, so that a developer, an enterprise, or a consumer node doesn't have to choose a tribe. They get all of them, redundantly, automatically, through one call.

---

## 2. Design Principles

Six principles recur throughout every layer of this document. They are worth stating once, up front, because every specific design decision that follows is downstream of one or more of them.

**Protocol agnosticism at the edge, consistency at the core.** Any transport — REST, GraphQL, gRPC, WebSocket, CLI, native MCP, a blockchain RPC — can be a source or a sink. The security, audit, and compression guarantees are enforced once, in the fabric, regardless of what touches the edge.

**Compress both directions.** Token and bandwidth efficiency is not just an input-side problem (what the model sees before acting) or an output-side problem (what comes back after acting) — it is both, simultaneously, and solving only one side leaves half the cost and half the quality degradation on the table.

**Trust hardware, not promises.** Wherever a claim needs to be verified — that code ran unmodified, that a node is who it says it is, that an output came from a specific model — the answer is a hardware attestation or a cryptographic proof, not a policy document or a terms-of-service checkbox.

**Fail closed, not open.** Every enforcement boundary — scope, sandbox, budget, chain quorum — defaults to refusal when verification is inconclusive. A system that fails open under uncertainty is not a security boundary; it is a suggestion.

**No single point of failure, no single point of trust.** Every anchor, every payment rail, every storage layer, every relay has at least one fallback that does not share a failure mode with the primary. A chain going down, a relay pausing, a storage provider disappearing — none of these should be able to invalidate a ClawQL-issued proof.

**Redundancy is a feature, not a cost center.** Publishing the same Merkle root to eight chains instead of one costs fractions of a cent more but eliminates single-chain censorship, single-chain downtime, and single-community distrust simultaneously. At ClawQL's anchoring costs, redundancy is closer to free than to expensive.

---

## 3. System Overview

At the highest level, the ClawQL Network has five layers. Each is independently useful; together they form a coherent whole.

```
┌───────────────────────────────────────────────────────────────┐
│  LAYER 5 — APPLICATIONS                                          │
│  RockYourLobster · SeeTheGreens · Provenance-as-a-Service         │
│  Any customer-facing product built on the layers below            │
├───────────────────────────────────────────────────────────────┤
│  LAYER 4 — ECONOMY                                                │
│  clawql-payments · Trace marketplace · Reputation & Diversity      │
│  Dividends · x402 micropayments · Stellar settlement               │
├───────────────────────────────────────────────────────────────┤
│  LAYER 3 — PROVENANCE & STORAGE                                   │
│  clawql-web3 (multi-chain anchoring) · clawql-ipfs · clawql-arweave│
│  WORM audit trail · Hash chains · Merkle batch roots               │
├───────────────────────────────────────────────────────────────┤
│  LAYER 2 — COMPUTE                                                │
│  clawql-cellrt (runtime) · DAOS (swarm coordination)               │
│  Ouroboros (agent loop) · clawql-sandbox · clawql-tee              │
├───────────────────────────────────────────────────────────────┤
│  LAYER 1 — PROTOCOL FABRIC                                        │
│  clawql-core · mcp-api-adapter · search / execute                 │
│  REST · GraphQL · gRPC · WebSocket · CLI · MCP · any chain RPC     │
└───────────────────────────────────────────────────────────────┘
```

Layer 1 is the nervous system: it lets anything talk to anything. Layer 2 is the muscle: it does the actual computation, whether that's running an LLM, executing an agent task, or processing a document. Layer 3 is the memory: it proves what happened and stores it durably, both in ClawQL's own audit trail and, optionally, anchored across public chains and permanent decentralized storage. Layer 4 is the circulatory system: it moves value between participants so that contributing compute, storage, or data is economically rational. Layer 5 is what customers actually see and pay for.

The rest of this document walks through each layer in the order a builder would encounter them, then closes with the applications, the honest risks, and the build sequence.

# Part II — The Protocol Fabric

## 4. Search and Execute: The Two-Primitive Interface

Every agent that uses ClawQL, regardless of what it is trying to accomplish, interacts through exactly two tools: `search` and `execute`. This is not a simplification for the reader's benefit — it is the literal interface. There is no third tool, no growing catalog of API-specific functions, no schema dump at session start.

`search` accepts a natural-language description of intent and returns the specific operation identifiers and parameter hints relevant to that intent, ranked by relevance. A registry of 7,000 API operations across a dozen providers never enters the model's context; `search` returns the two or three operations that matter for the current step.

`execute` accepts an operation identifier, its arguments, and — critically — a projection describing exactly which fields of the response the caller wants back. The full API response is computed and returned by the underlying service, but the projection is applied before the result crosses back into the agent's context window. The agent never sees fields it didn't ask for.

This is deliberately the same interaction shape regardless of whether the underlying operation is a REST call, a GraphQL query, a gRPC method, a CLI invocation, or a call to another MCP server. The agent's experience of "look something up, then do something with it" does not change based on what protocol happens to be underneath. That invariance is the whole point.

## 5. Input-Side Compression

The cost of exposing a large tool catalog to a model is well documented. A GitHub API specification alone is on the order of 600,000 tokens if flattened into tool schemas. Even sophisticated on-demand fetching schemes that load schemas lazily still pay a discovery cost on every session.

`search` eliminates this by keeping the surface entirely server-side. The model is told, once, that two tools exist. Everything else is retrieved by describing what's needed, not by having it pre-loaded. Independent research on agent scaffolding design has found that minimalist tool surfaces — a shell and a handful of primitives, rather than dozens of pre-declared tools — are frequently cheaper and just as reliable as heavier scaffolding for well-specified tasks, precisely because the model isn't carrying catalog weight it never uses. `search` generalizes that same minimalism to arbitrarily large and heterogeneous API surfaces, because the two-tool interface never grows regardless of how many providers sit behind it.

## 6. Output-Side Compression

Input-side compression is now common practice across the MCP ecosystem — on-demand schema loading, CLI conversion, and code-execution-style tool interfaces all attack this side of the problem. Almost none of them attack the other side.

When an API call returns a fifty-field object and the agent needed three fields, the other forty-seven do not disappear. They enter context. They persist across every subsequent turn of the session. They compete with genuinely relevant content for the model's attention, and they inflate every later prompt whether or not they were ever read.

`execute`'s projection parameter is a GraphQL-style field selection applied at the point of response construction, before the payload leaves ClawQL's infrastructure. The agent specifies the shape of the answer it wants; the gateway returns exactly that shape. Independent measurement of this technique on typical enterprise API payloads shows reductions on the order of 80–90% in response tokens when a wide object is trimmed to the handful of fields actually needed downstream.

The combination — minimal input via `search`, minimal output via `execute`'s projection — is the part of this architecture that has no equivalent elsewhere. Every other approach solves one side of the ledger and leaves the other untouched.

## 7. Any Protocol, One Interface

`mcp-api-adapter` is the component that makes the two-primitive interface protocol-agnostic. Adding a new source to the fabric — a REST API, a GraphQL endpoint, a gRPC service, a CLI tool, a WebSocket stream, or another MCP server entirely — means writing an adapter that translates that protocol's operations into entries `search` can rank and `execute` can invoke with projection. The agent-facing interface never changes.

This matters enormously once the network extends beyond conventional software APIs into the provenance and payment layers described later in this document. A notary's legacy desktop software, a hospital's HL7 FHIR interface, a supply chain's EDI messages, a blockchain's RPC endpoint — all of these become sources through the same adapter pattern, discoverable through the same `search` call, invokable through the same `execute` call, with the same output compression applied regardless of how verbose the underlying protocol naturally is.

### Smithy: governance metadata from the spec itself

*Status: design.*

Smithy is Amazon's Apache-2.0 interface-definition language for describing APIs independent of the wire protocol: resources, operations, inputs, outputs, and errors, with the protocol (JSON-over-HTTP, CBOR, and so on) attached separately. AWS's public models cover more than 200 services, and the SDKs in each language are generated from them. Where OpenAPI describes HTTP paths and verbs, Smithy describes the service shape; models can still be exported to OpenAPI when a consumer only speaks that.

The useful part for ClawQL is traits — annotations tools can act on without asking a model to interpret the API. A Smithy adapter for `mcp-api-adapter` turns those traits into governance:

| Trait | What ClawQL does with it |
| --- | --- |
| `@readonly` | Classify the operation as a read, deterministically |
| `@idempotent` | Know a write is safe to repeat |
| `@idempotencyToken` | Fill this field from the journaled intent for crash-safe retries |
| `@sensitive` | Label and redact the field in logs and in model context |
| `@paginated` | Page correctly and apply output projection per page |

- **Deterministic classification.** Operations marked `@readonly` or `@idempotent` are classified as reads or safely repeatable writes straight from the model, never from a model's guess, which is exactly what ontology-backed policy requires.
- **Automatic crash safety.** Request fields marked `@idempotencyToken` tell the gateway where an idempotency key belongs. The gateway fills the field from the journaled intent, so a retried AWS write after a crash is deduplicated by AWS itself, with no per-service code.
- **Ready-made sensitivity.** AWS uses `@sensitive` to mark data that must not appear in logs; ClawQL's labels and redaction treat it as a source of truth for every modeled AWS field.
- **Ontology seeding.** Smithy is resource-oriented: a `resource` with identifiers and lifecycle operations (create, read, update, delete, list) is the same shape as Ontologiql asset types and ActionTypes. Importing Smithy models can seed the ontology for each AWS service with action types, read/write classification, and sensitivity already filled in from the spec rather than written by hand.
- **Testing without risk.** AWS Emulator, released by AWS in November 2026 under a public-domain dedication (CC0) and built from the same Smithy models, runs more than 200 AWS services locally and offline. Governance scenarios, such as an agent attempting to delete a bucket, wipe a table or open a security group, can be exercised against it repeatedly with no cost and no risk. It emulates service behavior, not AWS's security infrastructure (instance metadata, IAM), so those attacks still need a real cloud lab. For ClawQL Cloud CI and the personal on-ramp, Emulator is the default AWS lab target because it can be redistributed and run commercially without a per-developer subscription; LocalStack's current image requires an account and paid commercial use, so it is used only when a customer already pays for it. Emulator fidelity varies by service; scenarios for the demos ClawQL actually ships (S3, DynamoDB, SQS, and so on) are verified against real AWS before any claim depends on them. Tests that need a real database engine rather than an emulated one can use MiniStack or equivalent MIT-licensed runners beside Emulator.

OpenAPI remains first-class in `mcp-api-adapter`. Most third-party APIs ship OpenAPI; Smithy is an addition, not a replacement, and Smithy can export OpenAPI so ClawQL's own APIs stay usable by tools that only speak that format.

#### ClawQL APIs and a published trait library

*Status: design.*

ClawQL defines its own APIs in Smithy as well, so gateway surfaces, Streams intents, and Cloud control-plane operations carry the same governance metadata AWS services do. Smithy also lets libraries define custom traits. A small ClawQL trait library, published as part of the open standard, makes governance part of the API language itself — for ClawQL's APIs and for any third party that wants to be governable out of the box:

```smithy
@trait(selector: "operation")
structure consequential {}

@trait(selector: "operation")
structure actionType {
    @required name: String
}

@trait(selector: "member")
structure trustLabel {
    @required value: String
}
```

An API author annotates which operations are consequential (need approval under default policy), which Ontologiql ActionType each maps to, and which fields carry untrusted content. Adoption becomes "describe your API in Smithy with ClawQL traits," which is the kind of path a standard needs to spread.

Practical constraints stay explicit. The Smithy CLI and build plugins are JVM-based and run only at build time, never in the runtime. TypeScript and Rust generators already exist; a thin Effect Schema generator can keep typed clients and validation in ClawQL's own idiom. Model validators enforce the safe path before anything ships — for example, every non-`@readonly` operation must declare an `actionType`, so an ungoverned write fails the build rather than production.

## 8. Why This Compounds: Cost, Quality, and Cache

Three independent effects stack on top of each other once both sides of the token budget are under control, and none of them is purely a cost story.

**Cost** is the obvious one — fewer tokens in, fewer tokens out, lower bill, in direct proportion to how aggressively the catalog and the payloads have been trimmed.

**Quality** is the effect this architecture would still be worth building even if tokens were free. Research on long-context behavior — most notably the NoLiMa benchmark from LMU Munich and Adobe Research — has found that models claiming context windows in the hundreds of thousands of tokens degrade sharply well before that limit: eleven of thirteen tested models fell below half their short-context accuracy by 32,000 tokens once surface-level keyword shortcuts were removed from the evaluation. Separate work on "context rot" and on the "lost in the middle" phenomenon find the same pattern from different angles — irrelevant tokens do not sit inertly in the context window, they actively compete with relevant tokens for the model's attention and measurably degrade the model's ability to use what actually matters. A smaller, more precisely shaped context is not just cheaper; it produces better answers from the identical underlying model.

**Cache economics** compound both of the above. Prompt caching rewards a stable, unchanging prefix — the same system instructions and tool descriptions across turns — with steep discounts, often 90% off the cached portion. But caching is fragile: any dynamic content placed early in the prompt invalidates everything after it on every turn. When the dynamic tail of a session (tool outputs, new turns) is kept small by output-side compression, the stable prefix remains a larger share of the total context for a larger number of turns, which keeps the cache hit rate high for longer. Teams that have restructured prompts purely to separate static from dynamic content have reported cache hit rates moving from single digits to the eighties, with proportional cost reductions. A session compressed on both sides doesn't just cost less per turn — it stays cheap for more turns, because it stays cacheable for more turns.

These three effects are not additive; they are multiplicative. A smaller context is cheaper, more accurate, and more cache-friendly, and each of those improvements reinforces the others across the life of a long session. This is the concrete, measurable reason the protocol fabric is not merely an engineering convenience — it is the mechanism by which everything built on top of it inherits lower cost and higher reliability for free.

# Part III — Compute

## 9. The Centralized Path: Enterprise Deployment

For most enterprise customers, ClawQL runs entirely inside their own perimeter. A regulated organization — a hospital, a bank, a law firm, a defense contractor — deploys the full stack on infrastructure it owns or controls: on-premises servers, a private cloud tenancy, or an air-gapped facility with no external network path at all. In this mode, ClawQL is indistinguishable from any other piece of enterprise software: it is installed, configured, and operated entirely within the customer's trust boundary.

This is deliberate and important. Frontier closed-weight models — the ones with the strongest raw capability — are, without exception, cloud APIs. They cannot be deployed inside an air-gapped facility, because using them requires sending data to a vendor's servers. Any organization with a hard data-residency requirement is excluded from using them at all, independent of how good the model is. For these organizations, the entire question is: how do you get frontier-grade *capability* out of a model you *can* run on your own hardware? The answer, in ClawQL's experience, is scaffolding — structured retrieval, typed memory, and audit infrastructure closes most of the gap between an open-weight model with nothing around it and a frontier model with nothing around it. This is the centralized deployment story: your hardware, your data, your compliance boundary, ClawQL's scaffolding.

### Policy-routed virtual models

*Status: design.*

Scaffolding lets a small model do work that would otherwise need a large one, and routing makes that automatic. Personal agent harnesses already route each request between a small local model and larger remote ones by query complexity and machine load (Pi's virtual models are one example). ClawQL exposes the same idea as a virtual model behind its OpenRouter-compatible endpoint, with routing decided in two stages:

1. **Hard constraints first.** Labels decide where a request may go at all: anything carrying protected health information or confidential data goes only to endpoints the policy allows (local models, attested capacity, or providers under the required agreements), however complex the request. The operator's model-provenance policy can rule model lineages in or out, and tenant budgets cap spend and energy.
2. **Optimization second,** only among the endpoints that remain: estimated complexity, local load, cost, energy and latency.

A complexity estimate can be gamed, so it never overrides a constraint; at worst, a crafted request is routed to a different allowed endpoint. Every routing decision (the endpoint, the model and its version, and the reason) is recorded in the WORM trail, so which model produced an output is part of its provenance. Where providers support provable inference (see Section 14), outputs from remote endpoints can also carry a proof that they came from the committed model weights, which detects a provider silently substituting a cheaper model. The routed configuration is measured on the same task boards as fixed models, on success rate, cost and energy per successful task.

## 10. The Decentralized Path: The Provider Network

*Status: design. Not yet built. Depends on ClawQL Cloud billing.*

ClawQL Inference reaches most developers through an OpenRouter-compatible endpoint: change one URL, and every request flows through ClawQL's governance. The provider network opens a second door into the same platform. Anyone with idle hardware, whether a homelab server, a Mac Mini, or a data-center GPU node, can run the ClawQL Edge Gateway and contribute capacity. Consumers and providers both join through a ClawQL Cloud account, and providers earn credits they can spend on the rest of the platform.

The topology keeps three tiers. A **Regional Hub**, operated by ClawQL, anchors the public network. A **Virtual Gateway (VG)** coordinates one trust domain: an enterprise runs its own for its own machines, and ClawQL runs a public one for the community. An **Edge Gateway** is any individual node registered with a VG.

Work reaches nodes as typed intents with leases, not as broadcasts that every node races to complete. A node claims an intent, performs it, and reports the result. If it fails or goes silent, the lease expires and the intent is reassigned. This matters because racing duplicates side effects: if several nodes attempt a task that writes to an external system, the system receives several writes. Racing remains appropriate in one narrow case, pure computation with a cheap way to check the answer, and only there.

Which nodes may receive which work is decided by policy, not by trust. Every request carries labels, and every market segment has a trust tier: community nodes, attested nodes running inside a hardware TEE, ClawQL-operated capacity, and providers covered by a BAA. Public, low-sensitivity work may run on community nodes. Confidential work runs only on attested or ClawQL-operated capacity. Protected health information runs only where a BAA applies. Apple Silicon nodes, which lack SEV-SNP, TDX, or Nitro-style confidential VMs, belong to the community tier: verified software, but a plaintext endpoint. Networks such as Darkbloom have shown that consumer hardware can serve inference at real scale and are candid that their providers see prompts in the clear. ClawQL's answer is not to ask anyone to trust that, but to route by policy so that only work allowed in the clear ever arrives there.

Output from nodes without attestation is verified by sampling: a portion of community-node work is re-run on trusted capacity, and the results feed DAOS reputation (Section 12). Nodes serving open-weight models can additionally be required to produce a provable-inference proof for randomly selected requests on demand (Section 14), so a node that substitutes a different model is caught cryptographically, not just statistically. Prices are set per market segment (model, trust tier, and latency class), with a base price that moves toward a target utilization at a capped rate. Providers set floors, consumers set ceilings, and ClawQL Cloud capacity at a fixed price is the backstop. Providers earn credits first; cash settlement (Part VIII) follows legal review. Every attempt, result, and acceptance is recorded in the WORM audit trail described in Part V.

### Coordination and consensus

*Status: design. Protocol selection by a frozen-criteria evaluation.*

Public Virtual Gateways must agree on task claims, reputation updates and settlement records among operators ClawQL does not control. Crash-tolerant protocols such as Raft and Paxos assume nodes may fail but never lie, so they are not enough here: the network needs Byzantine fault tolerance, surviving up to a third of its validators acting maliciously, over internet links with unpredictable latency.

- **Primary candidate: DAG-based asynchronous BFT.** Every validator proposes a block each round, and each block references at least two-thirds of the previous round's blocks, so the network builds a directed acyclic graph of what every validator had seen. Each node then orders that graph by the same deterministic rule, with no further messages. In the fully asynchronous designs (such as DAG-Rider and Tusk), the block that anchors each commit is chosen after the fact by shared randomness, so progress never depends on timeouts and no node ever has to guess whether another has failed. Production descendants (Bullshark, Mysticeti, Shoal) add a faster path under normal timing that reintroduces timeouts as an optimization only.
- **Costs to accept:** several rounds per commit in the fully asynchronous mode; a known validator set with distributed key setup for the shared randomness, which suits identity-bound (proof-of-authority) membership rather than open membership; at least 3f+1 validators with signatures on everything, practical for tens to around a hundred validators. Mature implementations exist in Rust; reuse is preferred to writing consensus from scratch, subject to license review.
- **TEE-assisted BFT.** When validators run attested enclaves (Section 14), trusted hardware can stop a node from equivocating, which reduces the replicas needed from 3f+1 to 2f+1. This turns attestation, which the network already requires for confidential work, into cheaper consensus, at the cost of making a TEE compromise a consensus risk (Section 45).
- **Single-organization Virtual Gateways** need only crash tolerance. For those spanning wide-area links, leaderless designs such as QuePaxa, which avoid leader election and the timeouts it depends on, are the candidate.
- **Ordering is not execution.** Consensus agrees on what happened and in what order; an irreversible external action still executes exactly once only through idempotency keys and the write-ahead rules in Part V.

## 11. clawql-cellrt: The Runtime Substrate

*Status: ClawQL runs today on the open-source `celld` 0.6.3 with ClawQL's lab patches, and crash-safety is authorized on that build as of November 9, 2026 ([`V4_CLAIM.md`](../benchmarks/program-cell-fleet-kill/V4_CLAIM.md)). `clawql-cellrt` is the target design.*

The coordination primitives beneath both deployment paths (cell lifecycle, single-owner leases, durable state) come from `celld`, an open-source runtime in the Durable Objects style. Its compare-and-swap leases give exactly one owner per piece of state at a time, and its output gate holds every external acknowledgment until a **durability proof** covers the corresponding write.

What “durable” means depends on the configured mode. By default (`CELLD_DURABILITY=fleet`), a proof is a disk quorum among fleet peers (follower fsync), or a racing object-store proof; the write may still be uploading to the bucket after acknowledgment. The alternate mode (`bucket`) waits for the object store on every write. ClawQL's authorizing soak and crash board ran the **fleet** default: two nodes on **one host**, with Cloudflare R2 as the fleet bucket — process- and node-crash safety with peer disks on that host, not AZ- or region-loss durability. Mode and fault scope are part of every claim ([`DURABILITY_MODE.md`](../benchmarks/program-cell-fleet-kill/DURABILITY_MODE.md)).

That last property is not a detail. ClawQL's own crash-testing found that acknowledging a write before it was durable could lose a journaled intent when a node crashed at the wrong moment. Upstream `celld` 0.6.3 closed the gap with an always-on output gate, and ClawQL now builds on stock 0.6.3 rather than a fork. ClawQL's lab patches add same-host supersede of provably dead owners, a rule that lease expiry alone never counts as death, and lease deadlines measured on a clock that keeps counting while a host is suspended. On that build, a 1,000-cycle soak and a 1,000-trial crash board, proven inside their own artifacts to have run the same binary, recorded zero wrong outcomes. In 241 of 243 crashes during an external call, the journaled intent was visible on recovery; the other two never sent the call, and their effect ledgers confirm no effect and no lost intent. Eighteen of the 1,000 trials missed the recovery deadline, most of them from failures in the test's own fault injection, and recovery is slower than on earlier builds (a median of about 17 seconds) because a stalled owner is now fenced rather than presumed dead, a deliberate trade of speed for correctness. The board's open items are published alongside it, including an earlier short-lease board that recorded 2 lost intents in 100. Recovery time is the main open problem on this build: leases detect a failed owner by waiting, so recovery is bounded by timeouts. A research direction removes the timeout from the recovery path wherever idempotency allows. If every external write carries an idempotency key derived from the decided intent, any replica can execute it safely, because the upstream service discards duplicates, so recovery need not wait for a lease to expire; leases remain for services without such keys. This follows the leaderless, hedged approach of consensus algorithms such as QuePaxa, and it will be modeled in TLA+ before any implementation. ClawQL publishes latency and durability figures only from its own measured boards.

`celld`'s maintainers are merging it into a broader runtime. ClawQL's approach is to track upstream and offer general improvements back, not to carry a long-lived fork. `clawql-cellrt` names the layers a regulated, decentralized network adds on top: a WebAssembly capability sandbox, so a cell's permissions are whatever capabilities it was structurally given; an eBPF security monitor; a hardware attestation path (Part IV); and credentials scoped to exactly a cell's lifetime. Where any of these is generally useful, the intent is to contribute it upstream.

## 12. DAOS: Swarm Coordination and Diversity-Guided Recruitment

A network where any node may attempt any broadcast problem has an obvious failure mode: if every node approaches every problem the same way, the swarm is not actually exploring the solution space — it is running the same attempt many times in parallel and calling the redundancy "diversity." DAOS — the Decentralized Agent Orchestration System — exists to detect and correct exactly this.

Every contributing agent's reasoning, not just its final answer, is projected into a shared embedding space. DAOS computes a metric — the Normalized Spread Value (NSV) — over the positions of all currently active agents working a given problem. When NSV falls below a calibrated threshold, the swarm is clustering: multiple agents are pursuing correlated, not merely similar, lines of reasoning, and the marginal value of adding another agent pursuing the same line is close to zero.

The more precise diagnostic is the Swarm Geometric Dilution of Precision (SGDOP), adapted directly from the mathematics GPS receivers use to measure how the geometry of visible satellites affects position accuracy. When satellites cluster in one part of the sky, positional accuracy degrades specifically along the axis orthogonal to that cluster — the dilution has a *direction*, not just a magnitude. DAOS applies the identical mathematics to agent positions in embedding space: when agents cluster along one reasoning direction, the swarm's blind spot is the orthogonal direction, and SGDOP identifies that direction explicitly. The Coordinator can then recruit specifically for agents — or personas, or model configurations — whose prior contributions project strongly onto the identified blind-spot direction, rather than simply adding more capacity at random.

A reputation system with baseline correction ensures that an agent who correctly pursues an unconventional direction and is later proven right is not penalized for having disagreed with a temporarily-larger cluster that turned out to be wrong; reputation is attributed relative to a calibrated baseline of expected difficulty, not relative to simple majority agreement. A persistent incentive — the Diversity Dividend — rewards agents whose historical positions have reliably covered blind spots the rest of the swarm missed, creating a standing economic reason to explore rather than to conform.

## 13. Ouroboros: The Evolutionary Agent Loop

Underneath any single agent's participation in a DAOS swarm — or operating standalone in a centralized deployment — is the Ouroboros loop: Seed, Execute, Wonder, Reflect, Evaluate. A task is crystallized into an immutable specification (the Seed); the agent works against it (Execute); at intervals, the agent explicitly reconsiders whether its current trajectory is actually converging on the goal (Wonder); when it isn't, the agent steps back and reconsiders its approach rather than continuing to push on a failing path (Reflect); and completion is checked against the original Seed, not against whatever the agent has drifted toward wanting to have done (Evaluate).

The loop's most important protective mechanism is stagnation detection: a small taxonomy of failure patterns — repeating the identical output, oscillating between two near-identical outputs, making no measurable progress against a drift metric, or improving at a rate too slow to matter — each paired with a specific corrective persona (a more adversarial "hacker" framing, a more literature-grounded "researcher" framing, a radically simplifying reframing, and so on) that the agent is prompted to adopt when its own trajectory matches that pattern. This is the mechanism that prevents an agent from silently burning hundreds of thousands of tokens locked into a wrong approach — a failure mode observed directly in early benchmark runs before stagnation detection was in place, where a single task consumed the majority of a session's budget without the agent ever recognizing it was stuck.

Ouroboros is deliberately model-agnostic and deployment-agnostic: the same loop runs identically whether the underlying model is a small open-weight model on a homelab GPU or a frontier model behind a cloud API, and whether the agent is operating alone in an enterprise deployment or as one contributor inside a DAOS swarm.

Ouroboros ships as a plugin for `clawql-harness` — the package, described further in Part III's package reference and covered fully in its own specification, that hosts execution loops a model runs inside of, as distinct from `clawql-agents`, which wraps finished agent products. As of this loop's migration into `clawql-harness`, Ouroboros registers its tools (`clawql_think`, its stagnation-detection hooks, its persona-rotation logic) through the identical plugin interface any other harness plugin uses, rather than through an environment-variable-gated code path baked into ClawQL's core. A deployment that wants the bare `search`/`execute` primitives with no loop discipline layered on top simply omits the Ouroboros plugin from its harness configuration; nothing about `search` or `execute` depends on Ouroboros being present.

# Part IV — Security and Trust

## 14. clawql-tee: Hardware-Attested Execution

Every claim this document makes about verifiability rests, ultimately, on one capability: the ability for a piece of code to prove, to a party that has never met it and has no reason to trust its operator, that it ran unmodified inside a genuine hardware security boundary. This is what `clawql-tee` provides, targeting AMD SEV-SNP, Intel TDX, and AWS Nitro Enclaves as the three hardware roots of trust in active production use.

The mechanism is remote attestation. On startup, a trusted execution environment produces a signed report — rooted in a key that never leaves the processor's silicon — attesting to the exact hash of the code it is running. A verifier who trusts the hardware manufacturer's root key, but does not need to trust ClawQL, the node operator, or anyone else in the chain, can check that report and know with cryptographic certainty that a specific, unmodified binary produced a specific output. Anything the enclave computes, decrypts, or attests to inherits that guarantee.

This is the foundation for the decentralized network's core trust problem. A public, opt-in network has no pre-existing relationships between participants — a homelab machine in one country and a data center node in another have never met and have no business relationship. Without hardware attestation, the network would have no way to distinguish a legitimate node running real ClawQL software from a malicious node fabricating results. With it, every attempt a node makes on a broadcast problem carries a `verifiable_execution_claim` that any other party — the coordinating VG, a competing node, an external auditor — can check independently.

### Hardware attestation and zero-knowledge proofs

Attestation is one of two ways to make a computation checkable by a party that trusts no one. The other is a zero-knowledge proof: a short proof that a computation produced a given result, which anyone can verify in milliseconds without seeing its private inputs. They trust different things and suit different work:

|  | Hardware attestation | Zero-knowledge proofs |
| --- | --- | --- |
| What you trust | The hardware vendor, and that side channels are contained | Mathematics (plus a setup ceremony for some proof systems) |
| Cost to produce | Close to normal execution speed | From tens of times slower (recent model-inference provers) to many orders of magnitude slower, depending on the workload |
| Best for | Heavy computation, including model inference | Small, high-value checks |

ClawQL uses each where it is strongest: heavy work runs in attested enclaves, and the decisions that matter most can additionally be proven in zero knowledge (Sections 19 and 28A). Proof systems differ: SNARKs such as Groth16 and PLONK give tiny proofs that are cheap to verify on-chain, Groth16 needing a setup per circuit and PLONK-style systems one universal setup; STARKs need no trusted setup and are believed resistant to quantum attacks, at the cost of much larger proofs. Zero-knowledge virtual machines prove the execution of ordinary programs, so ClawQL's checks can be written in Rust rather than as hand-built circuits. Proving sits behind ClawQL's trust-backend interface like every other backend. Proving model inference was long assumed to be out of reach, but that changed in November 2026: Anthropic open-sourced FlashProve, a research prototype that uses zkSNARKs to prove an output came from a specific set of committed weights without revealing them. On Meta's Llama 4 Maverick, a 400-billion-parameter mixture-of-experts model, a single H100 produced proofs at about 110 tokens per second, with a proof of about 19 MB per 1,024-token request, at 70 to 95 times the GPU time of normal inference; its key security guarantees are machine-checked in Lean. That cost suits audits and high-value requests rather than every call, so ClawQL uses provable inference selectively: to detect silent model substitution on remote endpoints (Section 9), and as an on-demand check for provider-network nodes (Section 10), alongside attestation and sampled re-execution.

## 15. Panguard: Scope Enforcement at the Infrastructure Layer

A recurring, empirically confirmed finding across independent research on agent scaffolding is that instructing a model not to use a capability is an unreliable control. Models given access to a tool and told, in the system prompt, not to use it under certain conditions will nonetheless use it under exactly those conditions with real frequency; the only reliable fix found in that research was removing the capability from the model's available action space entirely, not asking it more firmly to abstain.

Panguard is the component that acts on this finding rather than working around it. Every session declares an explicit scope — an ATR (Action-Tool-Resource) claim describing exactly which tools, which data, and which budget the session is authorized to touch. Panguard enforces this scope at the point of tool execution, not at the point of the model's decision to attempt a tool call. A tool call outside declared scope is blocked before it executes, regardless of how the model was prompted, regardless of whether the model was fine-tuned to be more or less compliant, and regardless of whether the model has had its safety training removed entirely. Every denial produces a WORM entry, so the system's behavior under adversarial or misconfigured conditions is exactly as auditable as its behavior under normal conditions.

This distinction — enforcement at the infrastructure layer versus guidance at the prompt layer — is the single most load-bearing design decision in the entire security model, because it is the one property that holds regardless of what happens to the model itself.

## 16. clawql-sandbox: Fail-Closed Containment

Where Panguard governs which tools a session may call, `clawql-sandbox` governs what happens when arbitrary code actually executes — a snippet an agent generates and wants to run, a full external agent harness ClawQL is wrapping, or a task picked up from a DAOS broadcast by an unfamiliar node. Containment backends range from lightweight (macOS Seatbelt for local development) to full VM-level isolation (Kata Containers) depending on the trust level of the code being executed.

The design principle here is identical to Panguard's: fail closed. If the sandbox cannot verify its own containment boundary — a kernel feature is missing, an attestation check fails, a required isolation primitive isn't available on the host — the correct behavior is to refuse to launch the workload at all, never to launch it anyway with reduced guarantees and hope for the best. A sandbox that silently degrades under uncertain conditions is not a sandbox; it is a false sense of one.

## 17. Identity: SPIFFE/SVID, DPoP, and Workload Federation

Every node, every agent session, and every machine-to-machine credential in the network needs an identity that is itself verifiable rather than merely asserted. ClawQL uses SPIFFE (Secure Production Identity Framework for Everyone) and its SVID (SPIFFE Verifiable Identity Document) credential format as the base identity layer: every node, on joining a VG, receives a cryptographically verifiable identity document rather than a shared secret or an opaque API key.

For inbound authentication — credentials presented to ClawQL by clients and human operators — the design follows the direction the MCP standardization process itself is currently heading, and in several places implements it ahead of the specification landing: DPoP (Demonstrating Proof of Possession) binds a bearer token to the specific client's private key, so that a leaked token is useless to anyone who doesn't also hold the corresponding key, closing the most common real-world token-theft failure mode. Workload Identity Federation gives machine agents their own first-class identity rather than forcing every automated action to borrow a human's delegated credentials — the correct model for a network where the acting party is frequently a piece of software with no human directly behind a given action.

Together, hardware attestation (what is running), Panguard (what it's allowed to touch), sandboxing (what happens if it misbehaves anyway), and cryptographic identity (who, or what, is acting) form the full trust stack that everything in Parts V through IX is built on top of.

# Part V — Memory and Audit

## 18. clawql-audit: The WORM Trail

Every consequential action in the network — a tool call, a Panguard denial, an inference call, a file write, a payment, a document extraction, a DAOS problem attempt — produces an entry in a Write-Once-Read-Many audit trail before that action is acknowledged as complete. This is not a logging feature bolted on for compliance theater; it is the mechanism by which every other claim in this document — that a task happened, that a node behaved honestly, that a document was processed correctly — becomes checkable after the fact rather than merely asserted at the time.

`clawql-audit` ships as a standalone package with zero dependency on any other ClawQL component, deliberately, so that it is useful — and adoptable — independent of whether an organization uses anything else ClawQL builds. A team running LangChain, AutoGen, or a hand-rolled agent harness can adopt `clawql-audit` purely for the compliance guarantee, with no other integration required. This is the intended on-ramp for organizations that are not yet ready for the full platform but are already under pressure — from the 120-plus organizations, including NVIDIA, Cisco, and CrowdStrike, currently pushing for mandatory AI agent incident reporting — to have *something* auditable in place.

## 19. Hash Chains vs Merkle Trees: Getting the Primitives Right

It is worth being precise about two structures that are easy to conflate but serve different purposes, because the distinction determines what each one can actually prove.

A **hash chain** is what the append-only log itself is: every entry embeds the hash of the entry before it, so the log has a single, unbroken sequence, and any attempt to delete, reorder, or retroactively alter an entry breaks the chain in a way that's immediately detectable by anyone recomputing hashes forward from any known-good point. This proves *append-order integrity* — that the log as a whole hasn't been tampered with — but checking it requires access to the whole sequence, or at least the portion between the point you trust and the point you're verifying.

A **Merkle tree** solves a different problem: given a batch of entries, it lets you produce a single root hash and, for any individual entry in that batch, a short *inclusion proof* — a handful of sibling hashes — that lets someone verify "this specific entry was in this specific batch" without needing the rest of the batch at all. This is what makes the multi-chain anchoring described in Part VII cheap: what actually goes on-chain is one Merkle root per batch, not one transaction per audit entry, and anyone who wants to verify a single entry against that on-chain root needs only that entry plus its short inclusion proof.

The two structures are complementary, not interchangeable: the hash chain is the mechanism for the log's internal integrity over time; the Merkle tree is the mechanism for cheap, selective, external verifiability of specific entries in bulk. `clawql-audit` implements both explicitly — a hash chain for every append, and periodic Merkle batching over ranges of that chain for anything destined for external anchoring — rather than using either structure to do the other's job, which is a conflation that shows up distressingly often in less careful implementations and quietly breaks the specific guarantee each structure is supposed to provide.

Replication of the log itself follows a dual-acknowledgment pattern: an entry is committed locally and queued in a durable outbox within the same transaction, and a background process drains that outbox to remote storage — rather than requiring the caller to wait on a slow remote round-trip, or worse, silently succeeding locally while quietly failing to replicate. On restart, the chain's current tip is loaded from durable storage before any new entry is accepted, specifically to prevent a restarted process from forking the sequence by starting again from index zero.

### Compliance attestations without exposing data

*Status: design.*

Merkle inclusion proofs already let anyone confirm that a specific entry is in an anchored batch. Zero-knowledge proofs (Section 14) add privacy: they can prove a property of the log without revealing the entries themselves. Examples: every consequential action in a period had a valid approval; no action exceeded a mandate's limits; every entry belonging to a deleted tenant was removed. A regulator or auditor verifies the proof against the anchored roots and learns that the property holds, without seeing protected health information or any other entry content. Large logs require batching and recursive proofs, so attestations are produced per period rather than per entry.

## 20. clawql-memory: The Vault and the Ontology

Separate from the audit trail — which records that things happened — `clawql-memory` is the layer that makes an agent's accumulated knowledge usable across sessions. Documents, prior decisions, and institutional knowledge are ingested into a typed ontology rather than stored as undifferentiated text: a legal matter has a practice area, a deal date, a set of typed boolean and numeric fields specific to what kind of matter it is, and a document inventory describing every file associated with it, each with an inferred type and extracted key terms.

This structure is what makes retrieval precise rather than merely plausible. An agent asking "which matters have a springing lien" is not asking a language model to remember or infer an answer from raw text — it is issuing a structured query against a typed store and receiving an exact, checkable answer, including the specific proof documents that support it. Where the ontology's pre-built schema doesn't cover a document type it has never seen — a practice area the schema wasn't built for — the system degrades gracefully to a generalized document inventory (filename, inferred type, extracted key terms) rather than confidently returning a wrong answer drawn from the wrong population of documents, a failure mode observed directly and corrected during early benchmark work on legal-domain retrieval tasks.

Embeddings for semantic recall, entity extraction, PII detection and redaction, and automatic classification and tagging all happen at ingest time, on whatever local hardware is available for the purpose — commonly a lightweight NPU or integrated GPU rather than the primary inference accelerator — so that by the time a query arrives, the heavy lifting has already been done and the response is a fast structured lookup rather than a fresh pass over raw documents.

### 20.1 Three retrieval paths, one context

*Status: design.*

Memory is split by what each store is good at. A memory store holds memory items with keyword (full-text) and vector indexes. A graph tier holds entities, relationships and the ontology. Each is canonical for its own data; they link by ID, and every write that touches both goes through a transactional outbox with idempotent consumers, so a memory item and its graph update can never silently diverge. For local and self-hosted installs the memory store is SQLite, one database per tenant; ClawQL Cloud at scale needs a horizontally scalable memory store as well, which remains an open design decision.

Items are written durably first and embedded in the background, so a crash between write and embed never loses a memory; until an item is embedded, retrieval falls back to keyword search. Every vector records the embedding model and version that produced it, so models can be changed by re-embedding in the background. Vectors are treated as sensitive as the text they encode: regulated tenants embed locally, and deleting a memory deletes its vectors. Human-readable views of memory are generated from the stores as read-only projections; edits go through governed writes, never through files.

A query runs three paths. Keyword and vector search return ranked hits; the graph path links entities named in the query to graph nodes and traverses typed edges a bounded number of hops, and it also expands outward from the top keyword and vector hits, which is what answers questions whose answer sits one relationship away from anything the query names. Hard filters run before any ranking: tenant, trust and sensitivity labels, validity (superseded facts are excluded unless history is requested) and time. The three result lists are merged by reciprocal rank fusion, then assembled into context under a token budget with diversity enforced, standing directives placed near the query, and an identifier on every item so the agent can cite it.

The assembled context carries labels too: if any item in it is untrusted, the context is untrusted, and the gateway applies that label to whatever the agent does next. Assembly is deterministic for a given query and memory state, and the identifiers of every item placed in a context are recorded in the WORM trail, so "why did the agent know this?" has an exact, checkable answer.

### 20.2 The graph tier

*Status: design. Engine selection by a frozen-criteria evaluation.*

The graph is a first-class store, not a table of edges inside the memory store. It runs in two tiers that both speak Cypher, behind one Ontologiql graph interface with engine adapters:

| Tier | Engine | Role |
| --- | --- | --- |
| Embedded, one graph per tenant | LadybugDB | Local and self-hosted installs, provider-network nodes, small and mid-size Cloud tenants, and the consolidation engine |
| Distributed | Chosen by evaluation among Neo4j Enterprise, NebulaGraph, Amazon Neptune and JanusGraph | Very large tenants and the scale targets |

The embedded tier matters for the same reason parked agents are cheap: most tenants are small, and one embedded graph file per tenant gives hard isolation with near-zero idle cost. LadybugDB, the continuation of the Kuzu embedded graph database, is in-process and MIT-licensed, with one writer and many read-only readers, which suits a single consolidation writer. A tenant moves to the distributed tier when it outgrows a single node; the shared Cypher interface makes that a data migration rather than a rewrite. Customers who already run Neo4j connect through an adapter, and BYOC deployments on AWS can use Neptune.

Every engine must be self-hostable for on-premises and BYOC customers, and its license must permit offering it as part of a hosted service, which excludes source-available engines under BSL, BUSL or SSPL terms. The primary engine for each tier is chosen by an evaluation with criteria frozen before any engine is tested: two-hop traversal latency at p99 under load, write throughput for consolidation, per-tenant isolation, operating cost and licensing, plus per-tenant footprint and cold-open time for the embedded tier. LadybugDB is community-maintained since Kuzu's original developers archived it, so its version is pinned and it sits behind the same interface as every other engine.

### 20.3 Standard ontologies and checks

*Status: design.*

Regulated industries already publish ontologies in W3C standards: finance has FIBO, an OWL ontology, and healthcare's FHIR has an RDF representation with ShEx schemas. Ontologiql imports OWL ontologies and SHACL and ShEx shapes, so a customer can bring its industry's ontology instead of writing one from scratch.

In the embedded tier this uses Ontobug, a schema registry built on LadybugDB: it records which ontology version governs which tenant graph as queryable data, validates graphs against exactly the shapes and ontologies that apply to them, and detects drift by comparing each schema with the SHA-256 recorded when it was loaded. In the distributed tier the same checks run through rudof, the SHACL and ShEx validator Ontobug itself uses. Either way, every ontology version's hash is anchored in the WORM trail, so it is provable which ontology governed the data at any point in time, and activating a new ontology version is a governed action that requires approval and passes validation first. Ontobug is very early, so it is pinned and replaceable behind the graph interface.

### 20.4 Graph-focused consolidation

*Status: design.*

Refining individual memories keeps facts accurate and current, but contextual reasoning lives in the structure, so most consolidation ("dreaming") effort goes to the graph:

- **Entity resolution,** recorded as reversible `same_as` links with evidence rather than destructive merges.
- **Edge validation** against source records: closing validity windows on stale edges and superseding contradicted ones.
- **Edge inference** across sessions, with inferred edges marked as inferred and linked to their evidence, so retrieval can tell them apart from observed edges.
- **Structural maintenance:** splitting hub nodes that have become too generic, pruning orphans, and summarizing dense communities for broad questions.
- **Proposed ontology changes,** which are never applied automatically and require approval.
- **Retrieval-driven focus:** consolidation concentrates on the paths behind good answers and on queries that returned nothing useful.

Graph changes amplify, because one bad edge reaches every traversal through it, so consolidation follows strict rules. Trust flows along edges: an edge is only as trusted as its weakest evidence, and inferred edges built from untrusted evidence never reach always-loaded context. Each run is capped in how many edges it may add, remove or retype, and anything beyond the cap goes to review. Each run writes into a copy of the graph, which must pass the shape validation in Section 20.3 before it replaces the current version, so a bad run is a one-step rollback. And each run is journaled like any other durable job, so it never half-applies. Every run is measured on multi-hop accuracy before and after, the precision of a sample of inferred edges audited against sources, and retrieval latency.

### 20.5 Shared graphs across parties

*Status: design.*

A tenant's private memory stays local to that tenant. Some customers, however, need a graph shared by parties that do not fully trust one another: a supply-chain consortium, a group of hospitals, or the provider network's own asset and reputation graph. For those, graph changes are ordered by Byzantine-tolerant consensus (Section 10), so every party's copy converges to the same state and no member can quietly rewrite shared knowledge.

- **Graph changes as ordered transactions.** Adding a fact, adding an edge, or superseding a relation is a transaction. Every party applies the same ordered sequence and arrives at the same graph.
- **The consensus history is itself provenance.** Each block in a DAG-based protocol records what its author had seen when it wrote, which is the "who knew what, and when" structure the memory layer needs for evidence and lineage.
- **Consolidation across parties.** Consolidation is nondeterministic, because models propose merges and edges, so parties submit proposals as transactions. Consensus orders them, and every party applies the same deterministic shape validation (Section 20.3) to accept or reject each one. Shape validation thereby becomes the state-transition rule of the replicated graph, and all parties accept exactly the same proposals.
- **Shared ontology governance.** Changing a shared ontology requires approval from a set threshold of member organizations, with the version hash committed through consensus and anchored (Part VII), so a consortium can govern a shared vocabulary without a central owner.
- **Corroboration as a trust signal.** Every fact records which organization asserted it, and a fact asserted independently by several members earns more trust than one asserted by a single member. A reference in the consensus graph only means a block's author saw something, not that it agrees, so corroboration uses explicit attestations rather than graph references.
- **Consistent snapshots for context.** Context is assembled from a committed prefix of the history, so it reflects one consistent state rather than a half-applied update, and the audit record of each context can include the committed round its facts came from.
- **Offline nodes and CRDTs.** Conflict-free replicated data types merge concurrent edits without consensus and suit nodes that go offline, but they cannot enforce constraints such as uniqueness or shapes. Commutative annotations may use them; anything carrying an invariant goes through consensus.
- **Content-addressed facts.** Facts stored as content-addressed nodes reference one another by hash, which gives deduplication and tamper evidence and matches the WORM hash chain and the IPFS layer (Part VI).

Consensus adds latency and replicates data to every member, so it is used only for graphs that genuinely cross trust boundaries, never for a single tenant's private memory.

## 21. System Self-Knowledge: Seeding the Vault With ClawQL's Own Capabilities

The same ontology and vault machinery described above is also used, deliberately, to solve a different problem: how an agent learns what ClawQL itself can do, without that knowledge permanently occupying space in every system prompt.

The conventional approach to this problem is a large, static block of system-prompt text describing every available tool, every convention, every piece of trust-layer semantics an agent needs to reason correctly — precisely the input-side context bloat Part II exists to eliminate. `clawql init` instead seeds a set of ordinary vault entries, tagged distinctly as system self-knowledge, covering exactly this material: what `search` and `execute` do, what the ontology structure looks like for a given deployment, how the trust layer's tri-state boolean semantics work, what `clawql_sql` can and cannot answer. These are not privileged or architecturally special entries — they are vault content like any other, retrieved through the identical `memory_recall` path a user's own ingested documents use.

The effect is that an agent does not carry "how ClawQL's trust layer works" in every prompt of every session. It recalls that specific fact via `memory_recall` at the moment it is about to reason about a `NULL` value and actually needs it — the same input-compression principle described in Part II, applied reflexively to ClawQL's own documentation rather than to external API surfaces.

Because the seeded entries are ordinary, tagged vault content, removing them requires no special mechanism: an operator who wants a leaner context budget, or a highly specialized deployment where an agent should not be encouraged to explore ClawQL's general capabilities, deletes them by tag exactly as they would delete any other vault content. Nothing else depends on their presence — `search` and `execute` function identically with an empty vault — which keeps this, like the harness plugin architecture described in Part III, opt-in and reversible by construction rather than load-bearing by default.

# Part VI — Decentralized Storage

## 22. clawql-ipfs: Content-Addressed Hot Storage

Anything the network needs to retrieve frequently and quickly — a trained model adapter, a dataset of reasoning traces awaiting licensing, a document extraction result being shared between nodes — is addressed by the hash of its content rather than by a location. This is what content-addressed storage via IPFS provides: a Content Identifier (CID) that is simultaneously the object's name and a verifiable claim about its exact contents, retrievable from whichever node on the network happens to be holding a copy, with no single company's server required to still exist for the object to remain reachable.

ClawQL nodes that opt in to contribute storage capacity pin content they've agreed to host and are compensated for continuing to serve it. Because content on IPFS can be fetched by anyone who knows its CID, ClawQL stores only encrypted content there (see Section 24). This gives the network's hot-storage layer the same "anyone can contribute capacity, capacity is compensated" property as the compute layer described in Part III.

## 23. clawql-arweave: Permanent Storage

Some content needs a stronger guarantee than "currently retrievable from some pinning node" — it needs to still exist, unaltered, in twenty years, regardless of whether ClawQL as a company still exists, regardless of whether the original contributing node is still online, and regardless of whether anyone remembers to keep paying an ongoing storage bill. This is the specific guarantee Arweave provides: a single upfront payment funds an economic endowment structured to cover the cost of storage indefinitely, so permanence is a property of the payment model rather than a promise anyone has to keep renewing.

This is the appropriate home for anything whose value depends specifically on long-term, tamper-proof availability: a licensed dataset of training traces with a documented provenance chain, a released model adapter with its full lineage of contributing data, or — in the provenance applications described in Part VII — any document or dataset a customer needs to prove existed, unaltered, at a specific point in time, for a legal or regulatory purpose that may not be tested for years.

## 24. The Trace Marketplace: Licensing Reasoning With Consent

*Status: vision. Gated on the consent, redaction, and terms rules below.*

Every inference call and agent task produces a reasoning trace: inputs, tool calls, intermediate steps, and output. Verified traces are valuable training material. But a trace contains the requester's content, so the marketplace starts from one rule: **a trace belongs to the party whose request produced it, not to the node that served it.**

- **Opt-in per requester, off by default.** A trace is retained for licensing only when the requester has consented. Nodes never retain or license prompt content on their own.
- **Regulated work is excluded.** Traces from tenants handling PHI or other regulated data are never eligible.
- **Redaction before retention.** Eligible traces pass through the same redaction pipeline as live traffic before they are stored.
- **Provider terms are respected.** Many closed-model providers prohibit using outputs to train competing models. Traces from those models are ineligible unless the terms permit it.
- **Labels follow traces.** A trace built from untrusted input carries that label. Attested lineage proves where data came from, not that it is safe to train on, so buyers can filter accordingly.
- **Only hashes go anywhere permanent.** Trace content is stored encrypted. IPFS holds only encrypted content, and Arweave and public chains hold only hashes, so deleting the encryption key honors a deletion request even where storage is permanent.

Quality tiers (gold, silver, bronze, based on whether the task succeeded, how it was judged, and whether the outcome was independently verified) and WORM-anchored lineage let a buyer verify which traces, from which consenting sources, trained which model. Revenue goes primarily to the requester whose data it is, with a share to the node for serving and storing it, settled in credits first.

The economic loop this closes is the reason the network is structured to reward more than raw compute contribution. A node that serves inference earns for serving inference. Consented traces from that work can separately earn licensing revenue for their owners and a share for the node. Better traces produce better fine-tuned models; better models attract more inference demand to the network; more inference demand means more traces accumulate; the loop reinforces itself in a way that compensating raw compute contribution alone does not.

# Part VII — Multi-Chain Provenance

## 25. clawql-web3: Publish Once, Anchor Everywhere

The WORM audit trail described in Part V is tamper-evident to anyone with access to the log itself. Anchoring makes it tamper-evident to anyone *without* that access — a periodic Merkle root of the log, published to one or more public blockchains, gives an external party a way to verify that a specific entry existed and was unaltered as of a specific point in time, without needing to trust ClawQL's operator, without needing direct access to the underlying log at all, and without ClawQL being able to quietly rewrite history after the fact — because the root is now sitting on infrastructure ClawQL doesn't control.

`clawql-web3` is the component that performs this publication, and its central design decision is redundancy: a batch root is published, concurrently, to as many independent chains as practical, rather than to one. A single call fans out to direct chain-specific adapters — Stellar, Hedera, Bitcoin, Solana, appropriate Cosmos application chains, and, where relevant, permissioned Hyperledger Fabric channels for enterprise-specific consortium requirements — and, for the EVM chain family (Ethereum, Base, Polygon, Avalanche), to a single Chainlink Runtime Environment workflow that fans out further across that family in one execution. A minimum-quorum requirement — at least N of the targeted chains must confirm — means that any individual chain's outage, congestion, or in the extreme case permanent shutdown does not invalidate the anchor; the proof survives as long as a quorum of the redundant set survives.

## 26. Chain Selection and the Tribalism Problem

Every blockchain community has a reasonable, if partisan, case for why its chain is the correct one to trust, and a correspondingly reasonable suspicion of every other chain's community making the identical claim. This is not a problem to be solved by picking a winner; it is a problem to be solved by not requiring anyone to pick one at all.

Publishing to a wide, deliberately chain-diverse set — rather than committing to a single "official" chain — means a Bitcoin maximalist, a Solana developer, a Stellar-based financial institution, and an enterprise running a private Hyperledger Fabric consortium can each verify the identical ClawQL proof on the specific chain they already trust, without needing to trust any of the others, and without ClawQL needing to resolve an unresolvable ideological argument in order to ship a working product. Each chain in the anchoring set was selected for a specific, concrete property rather than for general popularity: Stellar and Hedera for effectively fee-free, non-volatile anchoring costs well suited to high-frequency batch publication; Bitcoin, via OP\_RETURN, for the deepest and most battle-tested security guarantee available on any public chain, reserved for lower-frequency, higher-stakes anchors; Solana for sub-cent fees at very high throughput; the EVM family for the largest existing base of smart-contract tooling and the widest set of downstream integrations that already expect to read from it.

## 27. Relay Layers: Axelar, LayerZero, Wormhole, CCIP

Anchoring a root on one chain is useful; propagating that anchor's existence to additional chains without paying a full separate publication cost on each one is more useful still. This is the role of cross-chain messaging protocols, and `clawql-web3` treats them, deliberately, as pluggable and non-load-bearing: no single relay layer's continued operation is a prerequisite for the system's core guarantee, because the direct chain-specific adapters already provide a complete, if less efficient, fallback path.

Chainlink's CCIP, reached through the CRE workflow described above, handles propagation across the EVM chain family in a single execution. Axelar — now under Circle's stewardship following its 2026 acquisition of the protocol's originating development company — provides validator-set-secured general message passing with particular strength into the Cosmos ecosystem and into institutional use cases where Circle's own stablecoin infrastructure is already trusted. LayerZero offers the fastest, most configurable point-to-point relay across a wide additional set of EVM-compatible chains, with the caveat, borne out by a nine-figure exploit elsewhere in the ecosystem in 2026, that its configurability is a double-edged property — a relay configured with a single verifier is only as trustworthy as that one verifier, and `clawql-web3`'s own use of it is accordingly configured with multiple independent verifiers rather than the minimal, cheaper, and more fragile single-verifier setup. Wormhole's deepest integration is into Solana specifically, and it is used for that leg of the relay where Solana-native reach matters.

None of these relay layers replace the direct adapters; they extend the direct adapters' reach more cheaply. If every relay layer were simultaneously unavailable, the direct chain-specific publication path still functions on its own, at a marginally higher per-chain cost and without the automatic cross-propagation, but without loss of the core guarantee.

## 28. Provenance as a Service: Beyond AI

Everything described in this Part exists independent of any AI workload. What `clawql-web3`, layered on `clawql-audit`'s hash-chained and Merkle-batched log, actually provides is a general-purpose service: submit a hash, receive back a multi-chain-anchored, independently verifiable proof that this exact content existed, unaltered, at this exact time. Nothing about that service requires the content in question to have anything to do with an AI agent.

A notary uses it to timestamp a signed document without exposing the document's contents to any third party — only the hash goes anywhere public. An insurance company anchors a policy document at underwriting and a claim document at filing, so that any later dispute over "what did the policy actually say" or "when was this claim actually submitted" is resolved by checking two independently-verifiable timestamps rather than by trusting either party's retained copy. A research team pre-registers a dataset's hash before running an analysis, so a subsequent claim about what the data showed can be checked against a provably-unaltered snapshot taken before anyone had an incentive to shape the result. A supply chain anchors a hash at every handoff between parties who do not share a database and do not fully trust each other, producing an end-to-end provenance record that does not depend on any single intermediary's honesty. A hospital anchors the hash of an access log — never the underlying protected health information itself, which never leaves the hospital's own systems — so the *fact* of who accessed what, when, is externally verifiable without any patient data ever touching a public chain.

This is, in the most literal sense, the same infrastructure used to make an AI agent's actions auditable, offered as a standalone service to any industry that has ever needed to prove something happened without asking anyone to simply take its word for it.

## 28A. Governed On-Chain Actions

*Status: design.*

Provenance is the network's oldest relationship with blockchains: proving that something happened. Increasingly, agents also act on chains directly: moving funds, granting token allowances, swapping, deploying and calling contracts. As tokenized assets move onchain (the New York Stock Exchange has selected Avalanche as the ledger for clearing tokenized equities on its planned trading platform, pending regulatory approval), those actions become consequential, regulated and irreversible. A blockchain transaction cannot be recalled once it is final, so governance has to happen before signing, and the record has to be complete afterward. This section applies everything above to that case.

### Reads are untrusted input

Everything read from a chain is external content: token names, contract metadata, event logs, NFT attributes and verified-source comments can all carry instructions aimed at an agent. On-chain reads enter the agent with untrusted labels like any other external data, and a context built from them is untrusted. An agent that has read a malicious token's metadata cannot then approve its own transfer on the strength of that reading.

### Every write follows one path

&#91;embedded content: on-chain write path · gateway and chain enforce independently\]

1. **Typed intent.** Every on-chain action is classified into an ActionType (transfer, allowance grant, swap, deploy, contract call) by decoding the transaction against the contract's ABI and function selector, deterministically, never by a model's reading. Calls to unverified contracts, whose functions cannot be decoded, fall to a person.
2. **Simulate.** The transaction runs against live chain state before anything is signed. Risk signals (screened addresses, known-malicious contracts, unlimited allowance grants, unusual value) are attached as inputs to the decision, never as its authority.
3. **Show the exact diff.** The approval screen shows the deterministic result of simulation: which balances change and by how much, which allowances are granted to whom, which contracts are called, and the fee. A model may add a plain-language explanation, but it is shown beside the diff, never instead of it, and it is labeled untrusted whenever on-chain content informed it.
4. **Approve.** A person approves, bound to their identity, under the same mandate rules as every other consequential action. Autonomous agents act only within limits a person set in advance.
5. **Sign.** Keys never enter an agent's context. A person signs in their own wallet, or an autonomous agent signs through a smart account whose session keys are held in the vault or inside an attested enclave.
6. **Journal, then broadcast.** The signed transaction and its nonce are written ahead to the journal before broadcast. A given nonce can land on a chain only once, so the nonce is a natural idempotency key: after a crash, recovery checks the chain for that nonce and transaction hash before anything is rebroadcast, and a transfer can never be sent twice.
7. **Confirm and record.** Inclusion and finality are tracked as explicit states (pending, included, finalized, reorganized out), with a chain-specific confirmation depth before an action counts as done. Intent, simulation, approval, signature, transaction hash and finality all go into the WORM trail and are anchored with the next batch (Section 25).

### Two independent enforcement layers

For autonomous agents, limits are enforced twice, by systems that do not share a failure mode. The gateway enforces mandates, scope and approvals before signing. The chain itself enforces the smart account's session-key policy: spend caps per transaction and per period, allowed contracts and function selectors, and an expiry, using account-abstraction standards such as ERC-4337 and EIP-7702. If the gateway were bypassed or compromised, the chain would still refuse anything outside the session key's policy. Revoking a session key is itself a governed, audited action, and a key's limits are always narrower than the mandate that authorized it.

### Simulation is not a guarantee

Chain state can change between simulation and inclusion, through ordinary activity or deliberate front-running. Writes therefore carry their own bounds (slippage limits, deadlines, and minimum received amounts) so a transaction that would land outside what was approved reverts instead of executing. Where available, transactions go through private submission channels to reduce front-running, and a material difference between the simulated and the final on-chain result is recorded and flagged for review.

### Policy over types

Because every action is typed, policy is written over types rather than addresses or strings, through the same ontology-backed policy described in Section 20: for example, "any allowance grant above a set amount, or any unlimited allowance, requires a person", or "this agent may swap only between these assets, up to this value per day". A rule written this way cannot be dodged by routing the same action through a different-looking call.

### Policy on-chain, execution through CRE

A smart contract cannot call an off-chain API, hold a secret, or act on its own, and every call on a public chain is visible to everyone. So the gateway itself does not move on-chain. Its authority does:

- **On-chain:** the policy registry (mandates, scopes, limits and revocations, readable by anyone and changeable by no single operator, ClawQL included), multi-party approvals (for example two of three named signers for a high-risk action), settlement, and commitments of every decision.
- **Execution through the Chainlink Runtime Environment.** CRE runs workflow logic across a decentralized oracle network that reaches consensus on results. ClawQL's gateway logic (policy check, redaction, labels and projection) runs as a confidential workflow inside an attested enclave, whose attestation the network verifies before any result is signed. Tool calls that touch secrets, private data or side effects go through CRE's Confidential HTTP capability, which decrypts credentials only inside the enclave and supports requests that must execute exactly once, such as payments. Public reads use regular HTTP, where each node fetches independently and the network agrees on the result.
- **Back on-chain:** a signed report is written only after consensus and attestation checks pass, and a receiver contract executes it under the on-chain policy.

**Trigger, check, perform.** This follows the upkeep model that Chainlink Automation (formerly Chainlink Keepers) established: a trigger (a schedule, an on-chain event, or a `clawql-streams` event) starts the workflow; the check (ClawQL's policy evaluation, the role `checkUpkeep` played) decides whether anything should happen; and the perform step writes the approved action on-chain, the role `performUpkeep` played. As with upkeeps, the perform step must be idempotent, which the write-ahead journal and nonce rules above guarantee. Chainlink retired Automation in 2026 (v1.x on June 30 and v2.1 on July 31) in favor of CRE, which maps upkeeps directly onto workflows, so ClawQL builds on CRE rather than on Automation registries.

**When to use it.** Consensus execution is slower and costs more per call than a direct gateway call, APIs whose responses vary between nodes need explicit aggregation rules, and only the confidential capabilities keep responses private from the network. It is therefore reserved for actions where no single operator should be trusted: high-value actions, actions shared between parties that do not trust each other, and the public Virtual Gateways of the provider network (Section 10). Everyday tool calls stay on the direct gateway path. **CRE execution is opt-in per deployment and never the default.** Running gateway logic in an enclave has real costs beyond consensus latency: a hardware enclave (as distinct from a hardware-isolated VM such as a Nitro Sandbox) has no direct network access or persistent storage, so every network call and every write must be proxied through its parent instance. CRE sits behind ClawQL's execution interface like every other backend.

### Zero-knowledge policy proofs

*Status: design.*

For many on-chain actions, a cheaper alternative to consensus execution is to prove the policy decision itself. The gateway's policy check (the amount is under the limit, the recipient is on the allowlist, a valid approval signature from an authorized person exists) is written as an ordinary Rust program and run in a zero-knowledge virtual machine, which produces a proof that the check passed. The proof is wrapped into a small SNARK so it is cheap to verify on EVM chains, and the receiver contract executes the action only if the proof verifies.

The contract then needs to trust neither the gateway nor any oracle network, and the private arguments (amounts, counterparties, the approver's identity) never appear on-chain. Approvers can also prove that they hold a required role without revealing who they are, using credentials with selective disclosure. Policy checks are small, which is the scale at which proving is practical today. Proof generation adds time to each action, so, like consensus execution, it is opt-in and reserved for actions where on-chain enforcement of private policy matters.

### What will be measured before any claim

- **Injection through on-chain data:** a test suite of malicious token names, contract metadata and event payloads, with zero out-of-scope signed transactions as the pass condition.
- **Defense in depth, proven:** the on-chain layer tested with the gateway deliberately disabled, showing the session-key policy alone blocks out-of-limit writes.
- **Crash safety:** kill tests at every step of the write path, with zero duplicate transactions as the pass condition, in the same style as the durability boards.
- **Diff accuracy:** simulated effects compared with final on-chain results across a test set, with every divergence explained.

* **Policy on-chain path:** every decision commitment posted on-chain matches the gateway's WORM record for that action, and no receiver contract executes a report that lacks a verified attestation.

- **Zero-knowledge policy proofs:** every action whose private inputs violate policy fails verification and is rejected on-chain, and proving time per action is measured and published.

# Part VIII — Payments

## 29. clawql-payments: Settlement Without a Single Rail

Every economic interaction described so far — a node earning for serving inference, a node earning for storing traces, a customer paying for a provenance anchor, a licensee paying a royalty on traces used to train a model — needs a settlement mechanism, and the same redundancy principle applied to chains in Part VII applies here to payment rails: no single rail is a dependency for the network's economic function as a whole.

`clawql-payments` is the abstraction layer over multiple settlement mechanisms, selected per transaction based on what's actually being paid for, who's being paid, and what jurisdiction is involved, rather than forcing every payment through one rail regardless of fit.

## 30. x402 and HTTP-Native Micropayments

For the network's highest-frequency, lowest-value transactions — a single inference call, a single document extraction, a single DAOS problem attempt — the appropriate settlement mechanism is one with effectively zero marginal overhead per transaction. The x402 protocol, an emerging standard for HTTP-native machine-to-machine micropayments with a foundation that already includes major cloud, payments, and infrastructure companies, fits this role directly: a payment is requested and settled as part of an ordinary HTTP exchange, denominated in a stablecoin, with no separate wallet interaction required on the paying side and no meaningful per-transaction overhead on either side.

This is the default rail for anything happening at the frequency of individual tool calls or individual inference requests — the volume at which even a few cents of fixed overhead per transaction would make the economics of small contributions (a Raspberry Pi relaying provenance requests, a laptop serving occasional inference) not worth the node operator's time.

## 31. Cross-Border Settlement via Stellar

For node operators earning ongoing income from sustained participation — a data-center-grade node serving meaningful inference volume over weeks or months, or a node earning recurring trace-licensing royalties — periodic settlement into an operator's local currency and local bank account matters more than per-transaction micropayment overhead. Stellar's Anchor network exists specifically to solve this: stablecoins native to Stellar can be converted, through a regulated Anchor, into a wide range of local fiat currencies and deposited directly into an ordinary bank account, without the recipient needing to interact with a cryptocurrency exchange at all.

This makes cross-border node participation genuinely practical rather than nominally possible. A contributor in a country whose banking system has limited access to conventional crypto exchanges can still participate, earn, and receive payment in their own bank account in their own currency, because the last mile of settlement is handled by Stellar's existing Anchor infrastructure rather than by anything ClawQL has to build itself.

# Part IX — Events and Automation

## 32. clawql-streams: Any Event, Any Action

Everything described so far in this document has been framed around a request initiating an action — a user asks, an agent executes. `clawql-streams` is the layer that removes that requirement: any node on the network, having detected a condition worth acting on, can *initiate* an action without waiting to be asked.

A node monitoring a structured data store notices a value cross a threshold and publishes an event. A document-processing node detects a pattern matching sensitive personal information mid-extraction and triggers a redaction workflow. A DAOS coordinator detects that a swarm working a problem has stagnated and publishes an escalation. A monitoring node watching an external system's webhook fires an event into the network the moment that webhook arrives. In every case, the event is published once, onto a subject hierarchy on the network's messaging backbone (built on NATS JetStream), and every node subscribed to that subject — whether that's one specific enterprise VG or the entire public network — receives it and may act.

This generalizes cleanly to the same protocol-agnostic principle that governs the rest of the fabric: the event source can be any protocol the fabric supports, and the action it triggers can target any protocol the fabric supports, with no requirement that the two be related. A condition detected via a gRPC-based internal monitoring system can trigger an action delivered via a CLI tool. A webhook arriving over plain HTTP can trigger a multi-chain provenance anchor. The event bus does not care what kind of system produced the event or what kind of system consumes it.

## 33. Comparison to Chainlink CRE

Chainlink's Runtime Environment solves a closely related problem — off-chain conditions triggering on-chain smart contract execution — and solves it well within its scope. It is, deliberately, EVM-centric: its workflows are written in Go or TypeScript and compiled to WebAssembly, its decentralized oracle network reaches consensus specifically to deliver verified data onto EVM-compatible chains, and its strongest integrations are with exactly the kind of institutional financial workflows described in its own public case studies — national statistical agencies publishing economic data, market-data providers, cross-border settlement pilots. CRE also succeeded Chainlink Automation, the earlier keeper network for scheduled and event-triggered on-chain work, which was retired in 2026, and it now offers confidential execution inside attested enclaves (Section 28A).

`clawql-streams` solves the general case CRE is a specific instance of. Where CRE's trigger conditions and its actions both live on or near an EVM chain, `clawql-streams`'s triggers and actions can each independently be any protocol the fabric supports — REST, GraphQL, gRPC, WebSocket, CLI, native MCP, or any blockchain's RPC interface, including but not limited to the EVM family CRE targets natively. Where they overlap — an off-chain condition triggering an EVM-chain action — `clawql-web3`'s CRE integration, described in Part VII, is the practical implementation, and the two systems are complementary rather than competing: CRE remains the right tool specifically for EVM-native automation, and `clawql-streams` is the layer that extends the same automation pattern to everything CRE doesn't reach.

## 34. The Automation Loop End to End

Put together, the path from a real-world event to a permanently anchored, independently verifiable record looks like this: a condition is detected on any protocol surface; `clawql-streams` publishes it to the appropriate subject; subscribed nodes — potentially the whole opted-in network, potentially one enterprise's private VG — receive it and, where relevant, act; the action and its result are written to the WORM audit trail described in Part V; the resulting batch is Merkle-rooted and published across the redundant multi-chain set described in Part VII; and any payment owed for the work performed settles through the mechanism appropriate to its scale, described in Part VIII.

No step in this chain requires a human to have manually initiated anything, and no step requires trusting a single company, a single chain, or a single payment rail. This is, in full, what "an event-driven, verifiable, self-settling automation network" means in concrete architectural terms rather than as a marketing phrase.

# Part X — The Economic Model

## 35. Who Runs a Node and Why

The network is designed so that the hardware barrier to participation scales continuously from zero to enterprise-grade, and every point on that scale has a legitimate way to earn.

A high-end workstation with a modern discrete GPU can serve open-weight model inference, run document-processing pipelines, and participate in DAOS agent-reasoning tasks — the full range of compute contribution. A mid-range laptop or Mac Mini can serve smaller-model inference and lighter agent tasks. A machine with no GPU at all — in the limit, something as modest as a Raspberry Pi — can still participate meaningfully as a provenance relay node: maintaining a local hash chain, computing Merkle batches, and submitting roots to chain adapters, none of which requires meaningful compute, only reliable uptime and network connectivity.

A separate hardware profile exists specifically for training rather than inference, and the network is designed to let nodes specialize into one, the other, or both rather than assuming every contributor does everything equally well. A machine like a Mac Mini, built around unified memory and efficient low-latency serving, is well suited to hosting a small-to-mid-size open-weight model and answering a high volume of individually cheap inference requests. A workstation built around a data-center-class GPU — an RTX 6000 Pro or equivalent, with large VRAM and sustained throughput — is comparatively wasted serving that same small model at low latency, but is exactly the profile suited to consuming a large batch of licensed traces and running a full fine-tuning pass against them. The network's task dispatch, described in Part III, treats "serve this inference request" and "run this training job against this licensed trace batch" as two different problem types, routed to nodes that have opted in and are equipped for each, rather than forcing a single hardware profile to be good at both.

This matters because it means the network's growth is not bottlenecked on convincing people to buy expensive hardware specifically to join it. Anyone with an idle machine of essentially any capability has a way to opt in and earn something, which is the same insight that let a comparable inference-only network scale from a standing start to serving billions of tokens a day within two months, built entirely on hardware its contributors already owned for other reasons.

## 36. The Four Revenue Streams

A node's earning potential comes from up to four independent sources, and a given node may participate in any subset depending on its hardware and its operator's preference. Earnings settle in ClawQL credits first; cash settlement through the rails in Part VIII follows legal review.

**Compute contribution** — serving inference requests or picking up DAOS problem-solving tasks — is compensated per unit of work performed, at prices set per market segment (model, trust tier, and latency class) as described in Section 10.

**Storage contribution** — pinning encrypted content on IPFS, or funding permanent Arweave storage of hashes on behalf of the network — is compensated for continued availability of the content being served, an ongoing rather than one-time payment tied to uptime and retrieval activity.

**Trace licensing share** — when a requester has consented to license the traces their own requests produced (Section 24), the node that served and stored those traces earns a share of the licensing revenue. The requester, whose data it is, receives the primary share and sets the terms.

**Training contribution** — a node with sufficient GPU capacity licenses a batch of consented traces, runs a fine-tuning pass against them, and offers the resulting adapter or model back to the network, either to the original trace owners specifically or to the network generally, at a price the training node sets. This is a fundamentally different contribution from serving inference: it is compensated per delivered model artifact rather than per request, priced against the measured improvement that artifact demonstrates over its base model on the relevant benchmark, and it is the specific mechanism by which the Mac Mini serving cheap inference and the workstation with a data-center GPU become economic counterparties to each other rather than participants in unrelated activities.

These four streams are not mutually exclusive and, for a well-resourced node, compound: the same GPU cycles that earn inference revenue can produce consented traces that earn a licensing share, and a node with enough spare capacity can additionally license traces and earn again by training and selling an improved model, at each step building on the layer below it rather than competing with it.

## 37. The Flywheel: Inference → Traces → Better Models → More Inference

The specific reason this is structured as three streams rather than one is that it creates a reinforcing loop a pure inference-serving network does not have. A network that pays only for inference has no particular economic mechanism pushing model quality upward over time — it pays the same regardless of whether the underlying model is mediocre or excellent, and improving the model is someone else's problem, funded some other way, if it happens at all.

Compensating trace contribution directly changes this. Better, more carefully verified traces are worth more to license, which means nodes are directly incentivized to contribute high-quality reasoning rather than merely high-volume reasoning. Higher-quality traces produce better fine-tuned models when licensed and used for training. Better models attract more inference demand to the network, because the network's models are measurably improving relative to running the same open-weight base model with no scaffolding around it. More inference demand means more traces accumulate, at higher volume, from the same underlying activity. The loop closes on itself, and every full pass through it should, if the incentives are calibrated correctly, leave the network's aggregate model quality measurably better than the pass before — a property that a network compensating only raw compute serving does not have, because nothing in that simpler model rewards the intermediate step of the loop at all.

## 38. The Model Marketplace: Selling Improvement Back to the Network

The training contribution stream described above is worth walking through concretely, because it is the mechanism that makes the flywheel a genuine market rather than a metaphor.

Consider a node running a Mac Mini, serving Nemotron-class inference to the network. Over weeks of serving real requests, it holds a growing store of gold- and silver-tier traces from requesters who consented to license them — redacted, encrypted, WORM-attested, and hashed as described in Part VI. The Mac Mini itself has no meaningful capacity to fine-tune anything at scale; unified memory built for efficient inference serving is a poor fit for a sustained training run.

A second node, running a workstation built around an RTX 6000 Pro or comparable data-center-class GPU, has the opposite profile: substantial VRAM and sustained throughput well suited to training, and little reason to spend that capacity serving low-margin small-model inference requests. This node licenses that consented trace batch — along with, typically, batches from many other inference-serving nodes — at the terms the trace owners set, and runs a fine-tuning pass, producing an adapter or checkpoint measurably improved over the shared base model on whatever benchmark the trace domain corresponds to.

That improved model is then itself an asset the training node can sell back into the network: to the trace owners and the inference nodes that served them, at a preferential rate reflecting their contribution; to the network generally, at a price reflecting the measured benchmark improvement over the base model; or held privately and offered only for inference the training node itself serves, if it judges that more valuable than licensing the weights outright. Provenance for the entire chain — which traces, from which consenting sources and serving nodes, contributed to which resulting model, under what license terms — is recorded in the WORM audit trail and anchored the same way any other batch is anchored in Part VII, so a buyer evaluating a model for sale can verify its training lineage rather than taking the seller's description of it on faith.

The result is that the Mac Mini and the RTX 6000 Pro are not simply two nodes doing unrelated work for the same network — they are direct economic counterparties. The inference node's ordinary activity, with its requesters' consent, is the training node's raw material; the training node's output is a product the inference node, or any other node, can buy to improve what it serves next. Neither role requires the other's hardware. A node that only ever serves inference still earns from compute and its licensing share even if no one ever trains on that data. A node that only ever trains, buying licensed traces and never serving inference itself, still earns purely from the models it sells. The market works because the two hardware profiles are genuinely complementary rather than because either one is required to also do the other's job.

## 39. Reputation and the Diversity Dividend

Not every contribution to the network is equally valuable, and the reputation and incentive mechanisms described in Part III's discussion of DAOS extend naturally into this economic layer. A node whose historical trace contributions have reliably covered blind spots — reasoning directions the rest of the swarm consistently missed, identified through the SGDOP mechanism described earlier — accrues a standing reputation weight that increases both its likelihood of being recruited for future high-value tasks and its share of any Diversity Dividend the network allocates specifically to reward exploration over conformity.

This closes a subtle but important gap: a purely majority-weighted or purely volume-weighted reward system would systematically under-compensate exactly the contributions — genuinely novel reasoning paths, correct dissent from a converging-but-wrong consensus — that are most valuable to the network's long-run model quality and most likely to be crowded out by short-term volume incentives if left unaddressed.

# Part XI — Applications

## 40. AI Agent Infrastructure (RockYourLobster)

The most direct application of everything above is hardening existing open-source agent frameworks for deployment in environments that cannot tolerate the gaps those frameworks leave open by default. RockYourLobster packages a set of widely-used open agent projects — general-purpose agentic gateways, coding agents, autonomous software-engineering agents, personal-assistant agents, and plugin-based agent harnesses — each wrapped with the security, memory, and audit layers described in Parts IV and V, without requiring any change to the underlying agent's own code.

The value proposition is specific and measurable rather than general: an abliterated model with no safety training whatsoever, wrapped in this infrastructure, can be shown to have zero successful out-of-scope tool executions across a benchmark suite specifically designed to attempt them, because the enforcement happens at the infrastructure layer described in Part IV and does not depend on the model's own willingness to refuse. This is offered across three deployment tiers of increasing assurance — a self-serve Helm chart for teams comfortable managing their own infrastructure, a fully managed deployment for teams that are not, and an enterprise tier built on `clawql-tee` with hardware attestation and air-gapped export for the most regulated environments.

## 41. Document Processing at Verifiable Scale (SeeTheGreens and Beyond)

The document-processing pipeline described throughout this document — layout detection, PII redaction, schema-guided field extraction, all backed by the WORM audit trail and, where required, hardware attestation — is packaged as a complete Loan Origination System alternative for mortgage lending, under the name SeeTheGreens, as the first vertical application of this capability.

The specific advantage over incumbent, closed, cloud-only loan origination platforms is that every extracted field in every processed document carries a verifiable provenance chain: which model extracted it, running inside which attested execution environment, at what timestamp, checkable against the applicable extraction benchmark's published accuracy figures for that document type — not merely a vendor's assurance that the software works. For an underwriter, a regulator, or a borrower disputing an error, this converts "we trust the platform" into "here is the specific, independently checkable record," which is a meaningfully different and stronger claim.

Nothing about this pipeline is specific to mortgage documents. The identical extraction, redaction, and provenance stack applies unmodified to insurance claims processing, medical records intake, legal discovery document review, and any other domain where structured data must be reliably extracted from unstructured documents at volume and the extraction itself needs to survive scrutiny.

## 42. Provenance for Regulated, Non-AI Industries

Separate from any AI workload, the multi-chain anchoring service described in Part VII is directly sellable, on its own, to any industry whose core operational need is proving something happened without asking anyone to take an operator's word for it: notarization, insurance underwriting and claims, intellectual-property timestamping, supply-chain provenance, scientific pre-registration, and healthcare access auditing are the clearest immediate fits, and none of them require the customer to know or care that any of the AI-specific infrastructure described earlier in this document exists.

This matters strategically as well as commercially: it means the network's core provenance and payment infrastructure has a market independent of AI agent adoption specifically, which is a meaningfully different and more durable position than being solely a bet on continued enterprise AI agent spending.

## 43. The Regulated Enterprise Thesis

The strategic case underlying every application above rests on one structural fact that is unlikely to change on any near-term timeline: closed, frontier-capability models are, and will remain, cloud APIs, because their commercial model depends on controlling access to the weights. Any organization with a genuine, legally-mandated data-residency requirement — a fact pattern that describes a meaningful fraction of defense, government, healthcare, and financial-services deployments — is structurally excluded from using them, regardless of how compelling those models' benchmark results are.

For exactly these organizations, the open-weight-plus-scaffolding approach this entire document describes is not a cost-conscious alternative to frontier models; it is the *only* approach available at all. This is the durable core of the strategic position: general-purpose frontier labs are, correctly, optimizing for raw model capability, and will continue to do so, and ClawQL is not attempting to compete with that effort. The infrastructure described in this document exists specifically for the substantial and growing set of deployments where raw capability was never the binding constraint — trust, audit, and data residency were — and where no amount of frontier model improvement removes the need for exactly this kind of scaffolding, because the scaffolding is solving a problem the model itself was never going to solve.

# Part XII — Governance, Risk, and Roadmap

## 44. What ClawQL Is Not

It is worth being explicit about several things this document does not claim, because the architecture is broad enough that overclaiming would be easy and would undermine the credibility of the parts that are genuinely differentiated.

ClawQL is not a foundation-model company and makes no claim to compete on raw model capability; it is scaffolding around models, open-weight or otherwise, built by others. It is not a blockchain, does not issue a token as of this writing, and the multi-chain anchoring described in Part VII is a redundant *use* of existing public chains rather than an attempt to build a new one. It is not a replacement for `celld`, the open-source runtime `clawql-cellrt` builds on — the intention throughout has been collaboration and, ideally, upstream contribution where the added security and attestation layers are of general interest, not a competing project positioned against it. It is not, and does not intend to become, a general blockchain interoperability protocol competing with Axelar, LayerZero, Wormhole, or Chainlink — those are treated throughout as pluggable relay and oracle layers that `clawql-web3` builds on, not as targets for replacement.

## 45. Risks and Honest Limitations

Several parts of this architecture carry real, unresolved risk that should not be minimized.

The Effect-TS-to-WebAssembly compilation path referenced in the runtime discussion is genuinely unsolved at the time of this writing; it is the single highest-uncertainty item standing between the current TypeScript-based implementation and the fully Rust-and-WASM production target, and it may require either significant original engineering or upstream cooperation with the Effect-TS maintainers that has not yet been secured.

The decentralized network's core trust model depends on hardware attestation being both available and trustworthy at scale; any significant compromise of AMD SEV-SNP, Intel TDX, or AWS Nitro's underlying security guarantees would be a systemic risk to the entire trust model described in Part IV, not merely a localized bug.

The regulatory environment for both AI agent incident reporting and for cross-chain payment settlement is actively being written by multiple bodies simultaneously and could constrain design choices made in good faith today; the architecture's redundancy principles are intended to make it resilient to any single jurisdiction's or any single chain's regulatory action, but resilience is not the same as immunity, and a sufficiently broad coordinated regulatory action against decentralized compute networks generally would affect this one.

The competitive risk from frontier AI labs building comparable scaffolding directly into their own model APIs is real and, on current evidence, actively happening; the honest read is that this narrows the addressable market for general-purpose middleware over some multi-year horizon, and the strategic response — described in Part XI — is to concentrate specifically on the regulated, air-gapped, data-residency-constrained segment that frontier cloud APIs cannot serve regardless of how good their own built-in scaffolding becomes, rather than to compete broadly against improving frontier infrastructure.

## 46. Relationship to Adjacent Projects

This architecture was built in active, ongoing awareness of several projects solving adjacent pieces of the same broad problem, and the intention throughout has been collaboration rather than displacement wherever the two are compatible.

`celld`, the open-source Durable-Objects-style runtime `clawql-cellrt` builds on, remains the correct home for general-purpose coordination primitives that have no ClawQL-specific dependency; ClawQL tracks upstream rather than maintaining a long-lived fork, and direct engagement with `celld`'s maintainers on the security and attestation layers this document adds is an explicit and ongoing goal, not an afterthought.

The Model Context Protocol's own standardization roadmap — server-initiated events and triggers, progressive tool discovery, DPoP and workload identity, revised tool-result shapes — is, encouragingly, converging on several of the same architectural conclusions this document reaches independently, in some cases after this architecture had already implemented a working version. Where that is true, the appropriate response is direct participation in the standardization process itself, not a defensive posture toward a specification catching up to already-shipped work.

Distributed inference networks built on comparable principles — pooling idle consumer and prosumer hardware to serve open-weight model inference at meaningful scale — have already demonstrated, empirically, that the underlying economic and technical model this document extends into agent reasoning, document processing, and provenance is viable at real scale, not merely plausible in theory.

## 47. Build Sequence and Milestones

The dependency order among the pieces described in this document is strict in several places and worth stating explicitly, because building out of order creates rework rather than saving time.

ClawQL Cloud comes first, and its billing must be correct before anyone is paid or charged at scale: the provider network (Section 10) opens only after Cloud billing is fixed, in credits-only mode, with cash settlement following legal review. Community nodes may join early for public, low-sensitivity work routed to them by policy. Hardware attestation (`clawql-tee`) must exist before any confidential work leaves a single trust domain, because the entire premise of trusting an unfamiliar node with sensitive data depends on it; routing confidential work before this is in place would require either accepting an unverifiable trust model or retrofitting attestation onto a network already running without it, both worse than sequencing correctly. The runtime substrate (`celld` with ClawQL's patches today, `clawql-cellrt` as the target) is the next dependency, since the coordination, cell lifecycle, and durable-state primitives described in Part III are required before DAOS's swarm coordination logic has anywhere to run. DAOS's coordination layer and the opt-in registration flow for individual nodes follow directly from there. The provenance and storage layers (`clawql-web3`, `clawql-ipfs`, `clawql-arweave`) and the payments layer (`clawql-payments`, x402 integration, Stellar settlement) can be built in parallel with each other once the runtime and attestation foundations exist, since neither strictly depends on the other. The trace marketplace depends on all of the above being in place, plus the consent and redaction rules in Section 24, since it requires attested provenance, durable storage, and functioning settlement simultaneously to make any economic sense.

Every centralized enterprise application described in Part XI — RockYourLobster, SeeTheGreens, and the standalone provenance service — can and does ship well ahead of the fully decentralized network, using the same underlying components in single-tenant, centrally-operated mode. The decentralized network is the long-run architecture this document is building toward; it is not a prerequisite for any individual customer deployment shipping today.

# Appendix

## A. Glossary

**ATR** — Action-Tool-Resource claim; the scope declaration a session presents describing which tools, data, and budget it is authorized to use, enforced by Panguard.

**CID** — Content Identifier; the hash-derived address of an object stored on IPFS, which is simultaneously its name and a verifiable claim about its exact contents.

**DAOS** — Decentralized Agent Orchestration System; the swarm coordination layer that measures reasoning diversity across contributing agents and directs recruitment toward underexplored directions.

**Diversity Dividend** — a persistent economic reward, within DAOS, for agents whose historical contributions have reliably covered reasoning directions the rest of a swarm missed.

**Edge Gateway** — an individual opted-in node in the decentralized agentic fabric; the lowest tier of the network's three-tier topology.

**Hash chain** — an append-only log structure in which every entry embeds the hash of the prior entry, proving append-order integrity across the whole sequence.

**Merkle tree / Merkle root** — a tree structure over a batch of entries producing a single root hash and short inclusion proofs for individual entries, used for cheap external verification without requiring the full batch.

**NSV** — Normalized Spread Value; the DAOS metric measuring whether a swarm's contributing agents are exploring genuinely diverse reasoning directions or clustering on correlated ones.

**Ouroboros** — the evolutionary agent execution loop (Seed, Execute, Wonder, Reflect, Evaluate) underlying individual agent task execution.

**Panguard** — the infrastructure-layer scope enforcement component that blocks out-of-scope tool calls regardless of model instruction or intent.

**Regional Hub** — the top tier of the network's three-tier topology; ClawQL-operated infrastructure anchoring the public network.

**SGDOP** — Swarm Geometric Dilution of Precision; a DAOS metric, adapted from GPS positioning mathematics, identifying the specific reasoning direction a swarm is currently blind to.

**SPIFFE / SVID** — Secure Production Identity Framework for Everyone / SPIFFE Verifiable Identity Document; the cryptographic node and workload identity system used across the network.

**Trust tier** — the class of capacity a request may run on (community, attested TEE, ClawQL-operated, or BAA-covered), chosen by policy from the request's labels.

**VG (Virtual Gateway)** — the middle tier of the network's three-tier topology; a coordination point for a specific trust domain, either enterprise-operated (private) or ClawQL-operated (public).

**WORM** — Write-Once-Read-Many; the append-only, tamper-evident audit trail recording every consequential action across the network.

**x402** — an emerging HTTP-native protocol for machine-to-machine micropayments, used as the default settlement rail for high-frequency, low-value transactions across the network.

## B. Package Reference

| Package | Language | License posture | Role |
| --- | --- | --- | --- |
| `clawql-core` | Rust | Private / BSL | Protocol fabric core; `search` / `execute` primitives |
| `mcp-api-adapter` | Rust | Private / BSL | Protocol translation across REST, GraphQL, gRPC, WebSocket, CLI, MCP |
| `clawql-inference` | Rust | Private / BSL | PAL routing, tier-map, training flywheel integration |
| `clawql-tee` | Rust | Private / BSL | Hardware attestation substrate (SEV-SNP, TDX, Nitro) |
| `clawql-audit` | Rust | Open (standalone wedge) | WORM trail, hash chain, Merkle batching |
| `clawql-merkle` | Rust | Open | Zero-dependency Merkle tree primitives, extracted for reuse |
| `clawql-sandbox` | Rust | Private / BSL | Fail-closed containment for arbitrary code execution |
| `clawql-cellrt` | Rust | Private / BSL | Runtime substrate, built on `celld` |
| `clawql-auth` | TypeScript | Open | Inbound and outbound authentication, API key lifecycle, OAuth |
| `clawql-agents` | TypeScript | Open | Adapters for third-party open agent frameworks |
| `clawql-harness` | TypeScript | Open | Plugin-based execution loops (Ouroboros, OpenCode2) that a model runs inside of |
| `clawql-data` | TypeScript | Open | IDP pipeline, DuckDB-backed structured retrieval |
| `clawql-memory` | TypeScript | Open | Vault, ontology, semantic recall |
| `clawql-automation` | TypeScript | Open | Scheduling, notifications, workflow orchestration |
| `clawql-documents` | TypeScript | Open | Document pipeline MCP surface |
| `clawql-streams` | Rust | Private / BSL | Event bus, triggers, cross-protocol automation |
| `clawql-web3` | Rust | Open | Multi-chain anchoring, relay integration |
| `clawql-ipfs` | Rust | Open | Content-addressed hot storage integration |
| `clawql-arweave` | Rust | Open | Permanent storage integration |
| `clawql-payments` | Rust | Private / BSL | Multi-rail settlement, x402, Stellar |

## C. Research Citations

Modarressi et al., "NoLiMa: Long-Context Evaluation Beyond Literal Matching," ICML 2025.

Liu et al., "Lost in the Middle: How Language Models Use Long Contexts," Transactions of the Association for Computational Linguistics, 2024.

Chroma Research, "Context Rot," 2025.

JetBrains Research, "Efficient Context Management," NeurIPS 2025 workshop.

Independent evaluation of agent scaffolding cost and reliability across MCP and CLI tool-access patterns, arXiv, August 2026.

MindStudio, "How to Reduce Token Usage in AI Agents," April 2026.

ProjectDiscovery, "How We Cut LLM Costs by 59% With Prompt Caching," April 2026.

---

*The ClawQL Network Whitepaper · v0.2 (draft) · November 2026*

*Daniel Smith · daniel@clawql.com · clawql.com*
