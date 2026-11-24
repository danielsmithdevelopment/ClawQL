# Ontology page draft (`clawql.com/ontology`)

**Status:** Draft for marketing site. Prepared 2026-11-11. Live route: [`apps/www/src/app/ontology/page.tsx`](../../apps/www/src/app/ontology/page.tsx). Statuses and claims checked against the repository on this date (see verification table).

**Related:** [`/durability`](https://clawql.com/durability) (validation and audit) · [`/benchmarks`](https://clawql.com/benchmarks) · whitepaper [§20 clawql-memory](../vision/clawql-network-whitepaper-v0.2.md#20-clawql-memory-the-vault-and-the-ontology) · [enterprise ontology](../architecture/enterprise-ontology.md) · [operation risk from spec](../specs/risk/operation-risk-from-spec-v0.1.md).

**Stealth framing:** This draft never names Ontologiql and describes the ontology layer as part of ClawQL. The network whitepaper §20 currently still names Ontologiql in design text — keep the marketing page ClawQL-only until that framing is reconciled.

---

# Ontology

**The typed map of your world that agents work from, and the reason ClawQL can be precise, safe and efficient at scale.**

Most agent systems give a model a pile of text and a list of tools and hope it sorts them out. ClawQL gives agents a typed model of what exists, how things relate, and what can be done to each. Retrieval, policy, memory and routing all run on that one model. That is how ClawQL answers exactly instead of plausibly, and how its rules hold even when an agent is tricked into rephrasing a request.

## What's in it

- **Entity types:** the kinds of things that exist, such as a customer, a contract, a storage bucket, a patient record, a token.
- **Relationship types:** how they connect, such as *owns*, *supersedes*, *amends*, *belongs to project*.
- **Action types:** every operation an agent can take, with its inputs, outputs, side effects and the governance it requires.
- **Attributes that drive policy:** sensitivity, trust and ownership live on the things themselves, so one rule can cover a whole class of data.
- **Time and lineage:** facts carry validity windows and links to the evidence they came from, so stale facts can be retired and every fact can be traced to its source.

## Why it matters

**Exact answers, not plausible ones.** Asked "which matters have a springing lien?", an agent doesn't ask a model to recall or infer the answer from raw text. It runs a structured query against typed data and returns an exact, checkable answer, with the documents that support it. Where the ontology has no type for something, ClawQL falls back to a general inventory rather than returning a confident wrong answer.

**Rules that can't be talked around.** Policy is written over types, not words: *read* on *documents* in *project X* is allowed; *delete* on anything needs a person's approval. A rule written against a command string can be dodged by phrasing the same action differently. A rule written against an action's type cannot, because the action is classified before it runs.

**Efficiency at scale.** With thousands of tools and large knowledge bases, the ontology lets an agent find exactly the operation and the facts it needs, so its context stays small, which keeps it cheaper, faster and more accurate.

## How agents use it

1. **Context.** Every request draws on three paths at once: keyword search, semantic search, and the graph, which follows typed relationships from the entities a question mentions. Results are filtered by permissions, trust and validity before ranking, then assembled into context with every item citable.
2. **Policy.** Each tool call is classified into an action type and checked against the ontology: is this kind of action allowed, on this kind of thing, within the scope a person confirmed? Anything that can't be classified goes to a person.
3. **Memory.** As agents work, ClawQL consolidates what they learned, mostly into the graph: resolving duplicate entities, retiring stale relationships, inferring new ones with their evidence attached.
4. **Routing.** Labels on data decide where it may go, for example which models may see it, before any other routing consideration.

## Where the ontology comes from

- **Your existing standards.** Regulated industries already publish ontologies in W3C standards, such as FIBO in finance and FHIR's RDF and ShEx schemas in healthcare. ClawQL imports OWL ontologies and SHACL and ShEx shapes, so you can start from your industry's model instead of a blank page.
- **Your API specifications.** OpenAPI, Smithy and contract ABIs already describe operations precisely. ClawQL derives action types from them deterministically: for example, Smithy's `@readonly`, `@idempotent` and `@sensitive` traits classify operations and data straight from the spec.
- **Your people.** People author and approve the ontology. Models may propose new types or relationships, but changing the vocabulary that policy depends on is always a governed, approved action.

## Safety rules

- **Classification is deterministic.** A model never decides what type an action is; the type comes from the specification. Anything unmapped goes to a person.
- **Every change is validated before it takes effect.** New ontology versions and every consolidation run must pass shape validation before they replace what's live, so a bad change is a one-step rollback.
- **Every version is provable.** Each ontology version's hash is recorded in ClawQL's tamper-evident audit trail, so you can show which rules governed your data at any point in time.
- **Trust flows along relationships.** A relationship is only as trusted as its weakest evidence, so content from untrusted sources can't launder its way into trusted context.

## Shared ontologies across organizations

*Design, not yet built.*

Some knowledge has to be shared by parties that don't fully trust each other: a supply-chain consortium, a group of hospitals. For those, ClawQL orders changes to a shared graph through consensus that tolerates malicious participants, so every party's copy converges and no single member can quietly rewrite shared knowledge. Changing a shared ontology requires approval from a set number of member organizations.

## Under the hood

*Design for the tiers below; selection by measured evaluation.*

- **One graph per customer by default.** An embedded graph database per tenant gives hard isolation and near-zero idle cost.
- **A distributed tier for very large customers,** chosen by an evaluation with criteria fixed in advance.
- **One query language, Cypher, across both tiers,** so a customer who outgrows one machine moves by migrating data, not by rewriting anything.

## Status

| Capability | Status |
| --- | --- |
| Typed structured retrieval | Built; verified on a legal benchmark set (25 of 25 ground-truth questions; 30 SQL-gold assertions all passed, without a model in the loop). Agent-level results pending a fresh measurement. |
| Policy over action types | Partial — gateway operation risk from OpenAPI / gRPC / MCP method and hints is built (allow / mandate / block). Full ontology ActionType policy is design. |
| Standards import (OWL, SHACL, ShEx) | Design |
| Smithy-derived action types | Design |
| Graph tiers and graph-focused consolidation | Design |
| Shared ontologies across organizations | Design |

---

## Notes for publishing

- [x] **Ontologiql is in stealth.** Marketing page never names it; describes the ontology layer as part of ClawQL. Whitepaper §20 still names Ontologiql in design prose — reconcile before a broad publish that cites both.
- [x] Verify each status in the table, especially "Policy over action types" (see below).
- [x] Confirm the legal-benchmark wording matches the current published evidence (`sql-gold-001-025.json`, all_gold; 25 questions / 30 assertion keys).
- [x] Cross-link with `/durability` (validation and audit) and `/benchmarks`.
- [x] Link whitepaper §20 (memory and ontology).

### Status verification (2026-11-11)

| Capability | Evidence | Verdict |
| --- | --- | --- |
| Typed structured retrieval | `benchmarks/harvey-labs/results/ts-v2/sql-gold-001-025.json` — `all_gold: true`, questions 001–025, pipeline notes no inference; handoff `docs/benchmarks/harvey-lab-rightsizing-remeasure-handoff.md` | Built; agent remesure still pending |
| Policy over action types | `docs/specs/risk/operation-risk-from-spec-v0.1.md` + `packages/clawql-api/src/risk/` — classify from method/hints; enforce allow/mandate/block. Ontology ActionType / Smithy seeding still whitepaper design (§7, §20) | Partial |
| Standards import | Whitepaper §20.3 *Status: design* | Design |
| Smithy-derived action types | Whitepaper §7 Smithy traits — design / future seeding | Design |
| Graph tiers + consolidation | Whitepaper §20.2 / §20.4 *Status: design* | Design |
| Shared ontologies | Whitepaper §20.5 *Status: design* | Design |
