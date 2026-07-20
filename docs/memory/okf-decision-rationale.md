# OKF `type: decision` — rationale template (AIF-inspired)

**Status:** Convention (optional body shape) · July 2026  
**Audience:** agents writing `memory_ingest`, Layer 6 history distillation, humans editing vault decisions  
**Related:** [OKF memory](./okf.md) · [`.cqk` draft](../specs/cq-extensions/cqk.md) · [Token efficiency Layer 6](../architecture/clawql-token-efficiency.md) · [Enterprise Ontology](../architecture/enterprise-ontology.md)

## Why

Agents and operators need **decision records that stay unambiguous under recall** — not free-form chat dumps. The [Argument Interchange Format (AIF)](https://www.arg-tech.org/) showed that typed argument graphs (information nodes + scheme applications for inference / conflict / preference) let tools exchange rationale without misunderstanding.

ClawQL does **not** adopt AIF wire formats. We reuse the **shape of the idea** inside OKF Markdown: a stable section layout for `type: decision` notes (and future `.cqk` promotions) so Layer 6 distillation and `memory_recall` can treat rationale as structure, not prose sludge.

## When to use

| Use `type: decision` + this template                      | Prefer another type                 |
| --------------------------------------------------------- | ----------------------------------- |
| Architecture / policy choice with grounds                 | `context` for session notes         |
| Kinetic / HITL outcome with audit trail                   | `task_result` for raw tool outcomes |
| Distilled transcript → compact durable judgment (Layer 6) | `digest` for rolling vault digests  |
| Eval / design-partner verdict                             | keep `verdict` in frontmatter       |

## Frontmatter (required / recommended)

```yaml
---
type: decision
title: "Short imperative title"
description: "One-line outcome" # OKF recommended
tags: ["clawql-ingest", "decision", "rationale"]
timestamp: "2026-07-20T00:00:00.000Z"
correlation_id: "corr-…" # session / request
worm_ref: null # set when sealed in WORM
agent_id: "…" # optional producer
verdict: "accepted" # accepted | rejected | deferred | superseded
entity_refs: [] # optional Ontology entity names / instance ids
clawql_okf: true
---
```

`worm_ref` is the provenance anchor: leave `null` until sealed; never invent hashes.

## Body template

Use these H2 sections in order. Omit empty sections only when truly N/A (prefer an explicit “None”).

```markdown
# <same as title>

## Claim

One sentence: the proposition under consideration (AIF **I-node** content).

## Grounds

Evidence and premises that support the claim (AIF premises feeding an **RA** / rule-application scheme):

- Fact or citation 1
- Fact or citation 2

## Supports

Inferences that connect grounds → claim (keep short; prefer bullets):

- Because …, therefore …

## Attacks

Counter-arguments or conflicts considered (AIF **CA** / conflict application). Write **None** if none.

- Objection → response

## Preference

Why this option beats alternatives when conflicts remain (AIF **PA** / preference). Optional.

- Prefer A over B because …

## Decision

The durable outcome (mirrors frontmatter `verdict` in prose).

## Provenance

- `correlation_id`: …
- `worm_ref`: … or pending
- Related: [[Other Note]] · Ontology entities: …
```

## Minimal example

See [`examples/ontology/okf/decision-rationale-template.md`](../../examples/ontology/okf/decision-rationale-template.md).

## Mapping to token-efficiency layers

| Layer                      | How this template helps                                                            |
| -------------------------- | ---------------------------------------------------------------------------------- |
| **6 History distillation** | Distill long transcripts into this shape instead of retaining full turns           |
| **7 Dedupe / truncate**    | Recall can prefer `## Claim` + `## Decision` before expanding grounds              |
| **9 Structured output**    | Prompt / prefill agents to emit these H2s                                          |
| **11 Prefill**             | Prefill `type: decision` + section headers so models cannot ramble into the header |
| **12 Fine-tune flywheel**  | Scrubbed decision records are high-signal training rows                            |

## Non-goals

- Full AIF RDF/OWL interchange or ASPIC⁺ semantics
- Requiring every vault note to use this layout
- Replacing Action Views / PEP envelopes (those stay in Command Deck / WORM)

## See also

- [OKF memory guide](./okf.md)
- [Command Deck ontology builder UX](../architecture/command-deck-ontology-builder-ux.md)
- AIF overview (academic): [arg-tech AIF](https://www.arg-tech.org/) · [AIF specification PDF](https://www.arg-tech.org/wp-content/uploads/2011/09/aif-spec.pdf)
