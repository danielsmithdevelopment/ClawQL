# ClawQL Streams: autonomous loop (design intent)

## Status

Design intent, not a schema. Recorded 2026-11-08 so the thinking is not lost. ClawQL Cloud stays the priority because it is how ClawQL starts earning revenue. Full schema design starts with Cloud phase 2 (durable agents), since the loop's workers are durable agents.

Related: [Cloud platform plan](../gtm/clawql-cloud-platform-plan.md) · [clawql-streams](./clawql-streams.md) · [clawql-network v0.2](../specs/network/clawql-network-v0.2.md) (tunnels as egress).

The same loop shape has emerged independently elsewhere (a planner that alone creates work, workers that claim one item and stop, a graph as shared state, guardrails on every call). That convergence supports the design. ClawQL's difference is governance built into the loop from the first schema.

## The loop

1. A person writes an objective in plain English.
2. A goals agent breaks it into goals and extracts the scope (systems, assets, data).
3. **A person confirms the scope.** It is compiled into tool and egress policy outside the agent.
4. The planner turns goals into intents, small specific work items tied to assets, and publishes them to the intent stream. It is the only publisher.
5. Workers claim one intent each, act through the ClawQL gateway, write facts to the graph, and stop.
6. Each fact event wakes the planner, which reads the graph, updates a todo list kept across rounds, and decides what to try next.
7. The loop ends on completion, a budget limit, or a person stopping it.

> **Diagram (working surface):** autonomous loop — one human checkpoint, one intent writer. (Embedded figure lived in the Claude artifact; in-repo copy is this prose until an image is checked in under `docs/streams/images/`.)

The person's scope confirmation is the one fixed human checkpoint, and every worker action passes through the gateway.

## Invariants

These hold from the first schema onward.

1. **Single writer for intents:** the planner is the only intent publisher, enforced by NATS permissions rather than convention.
2. **Human-confirmed scope:** a model may propose scope; only a person confirms it, and enforcement sits outside the agent.
3. **Every action through the gateway:** approvals, labels, vault credentials and audit apply to every external call.
4. **Claims are leases:** a crashed worker's intent is redelivered, and a redelivered intent can never repeat an external write (the gateway journals an idempotency key).
5. **Labels travel everywhere:** every message and graph write carries labels. Untrusted content never becomes trusted by being consolidated, shared between workers, or reused across tasks.
6. **Evidence linking:** every fact and finding cites the audit entries that produced it.
7. **Ask by default:** actions no rule covers go to a person. A model judge may triage the queue but never approves on its own.
8. **Hard budgets per loop:** rounds, wall time, tokens, spend and external writes.

## Ontology-backed policy

Ontologiql defines what exists and how it relates; ClawQL enforces what may happen to it. Policy is written over types in the ontology instead of strings, so it cannot be dodged by rephrasing a command. This applies to the whole gateway, not only the loop.

- **Rules over types:** for example, *read* on *document* assets in *project X* is allowed; *delete* on anything requires approval.
- **Scope as graph membership:** an asset is in scope only if the graph connects it to the scope a person confirmed. A newly discovered asset is not allowed just because it looks related.
- **Intents validated at publish:** the stream rejects any intent whose action and asset types are not allowed for the task, so bad work never reaches the queue.
- **Labels as ontology attributes:** sensitivity, trust and ownership live on nodes, so one rule can cover a whole class (for example, nothing labeled PHI goes to a provider without a BAA).

### Enforcement points

| Point | What happens |
| --- | --- |
| Intent publish (stream) | Action and asset types checked against task policy before the intent is queued |
| Before each tool call (gateway hook) | Operation classified from its OpenAPI definition; target asset IDs taken from mapped parameters; scope membership checked; allow, deny or ask |
| After each tool call (gateway hook) | Result labeled and redacted; facts written with links to their audit entries |
| Ontology change | Proposed by people or by dreaming; applied only after approval |

### Conditions for this to be safe

- **Deterministic classification.** A model never decides an action's type. OpenAPI specs give the method, path and resource of every operation exactly. Anything unmapped goes to a person. Smithy models, which describe more than 200 AWS services, go further: operations marked `@readonly` or `@idempotent` classify themselves, and request fields marked `@idempotencyToken` show where the gateway should place an idempotency key filled from the journaled intent, making retried AWS writes crash-safe without per-service code (whitepaper [section 7](../vision/clawql-network-whitepaper-v0.2.md#smithy-governance-metadata-from-the-spec-itself)).
- **People own the ontology.** Models may propose types or relations; changing the policy vocabulary is a governed change, like scope.

### Hook rules

- **Fail closed:** governance hooks never run in a warn-only mode in production, and a hook error denies the call.
- **Normalize first:** normalize Unicode, encodings and casing in arguments before classifying them.
- **Check what is acted on:** resolve the target asset once before the call and pass that exact ID through, so nothing changes between check and action.
- **Code mode per operation:** when an agent runs a script that calls several tools, hooks fire on each underlying call, not once per script.
- **Fast lookups:** cache scope membership per task so each call does not trigger a graph traversal.

### Prior art and positioning

Before and after tool-call hooks are a common gateway convention (IBM ContextForge, TrueFoundry, Claude Code), not part of the MCP spec, and regex-based PII redaction in those hooks is widespread. Hooks and auto-redaction are therefore not differentiators on their own. What is new is what runs in them: typed classification against a graph, labels that follow data through a session, person-bound approvals and journaled external writes.

### Open questions

- [ ] How tools without OpenAPI definitions (plain MCP servers) are classified: hand-written mappings, or ask by default.
- [ ] How GraphQL operations map to action and asset types (parsing the query rather than guessing).
- [ ] The starting ontology: which action and asset types ship by default.

## Layering: hooks, outbox and stream

Gateway hooks never talk to NATS directly. Hooks are synchronous enforcement on one tool call; if they published to NATS, every tool call would depend on NATS being up, and a publish that failed after a successful tool call would lose the event (the same output-gate problem solved in celld).

| Layer | Job | Touches NATS? |
| --- | --- | --- |
| Gateway hooks | Policy, labels, redaction; write facts and audit entries to the store, per tool call | No |
| Outbox relay | Turns committed changes (facts written, approvals requested) into NATS events | Publishes |
| Intent publisher | Validates intents against task policy, then publishes them | Sole publisher to the intents subject |
| Runtime (durable agents) | Planner wakes on fact events; workers claim intents through consumers with leases | Consumes |

- **Outbox:** the after-call hook writes the fact and an outbox row in the same database transaction. A separate relay publishes outbox rows to NATS and marks them sent. A committed fact always gets its event eventually, and a NATS outage never blocks a tool call.
- **Store is the source of truth;** the stream carries notifications of changes to it.
- **Sole intent publisher:** the planner calls a small ClawQL service that checks the intent's types and scope, then publishes. NATS permissions give only that service publish rights on the intents subject, so enforcement does not depend on the planner behaving.
- **Approvals use the same path:** the before-call hook records an approval request, the outbox publishes it, the worker's durable runtime parks, and the approval event resumes it. No hook waits on NATS.
- **Reads are allowed:** hooks may read NATS-backed state such as a KV cache of task scope, but a cache miss falls back to the store, never failing open.

## Open questions

- [x] **Source of truth (answered 2026-11-08):** the store is the source of truth, and the stream carries notifications of committed changes through an outbox. See "Layering: hooks, outbox and stream."
- [ ] **Termination:** how the planner decides it is done, and how it detects loops or lack of progress.
- [ ] **Delivery semantics:** at-least-once delivery with idempotent consumers; ordering guarantees per task.
- [ ] **Worker model:** workers as durable agents (wake, act, park), and the cost per intent.
- [ ] **Multi-tenancy:** subject namespaces and NATS account isolation per tenant and task.
- [ ] **Human checkpoints beyond scope:** plan review, finding review, or both.
- [ ] **Cross-task knowledge:** what may cross a task boundary into shared graphs, and with what labels.
- [ ] **First use case:** which non-offensive task proves the loop first (for example research synthesis, ops triage, data reconciliation).
- [ ] **Evaluation:** success metrics and a benchmark task set.
- [ ] **Backpressure:** concurrency and rate limits per tenant.
- [ ] **Observability:** one trace per loop, linking goals, intents, facts and audit entries.

## Sequence

- **Now:** this note only.
- **Cloud phase 1:** no loop work.
- **Cloud phase 2 start:** subjects and streams, the intent envelope, the claim lifecycle as an explicit state machine checked in TLA, and the first use case as a demo.
