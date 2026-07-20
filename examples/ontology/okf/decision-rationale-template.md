---
type: decision
title: Sequence OKF before .cq* extensions
description: Adopt OKF vault serialization first; promote .cqk/.cqe only after OKF is stable
tags:
  - decision
  - rationale
  - okf
  - ontology
timestamp: 2026-07-20T00:00:00.000Z
correlation_id: example-okf-decision-rationale
worm_ref: null
agent_id: docs-example
verdict: accepted
entity_refs: []
clawql_okf: true
---

# Sequence OKF before .cq* extensions

## Claim

ClawQL should standardize vault notes on OKF Markdown before promoting custom `.cq*` extensions.

## Grounds

- OKF is an open, path-as-identity Markdown + YAML frontmatter convention already aligned with Obsidian.
- Custom extensions without a stable base risk editor/CI fragmentation and premature lock-in.
- ADR 0009 already commits to OKF for memory serialization; ADR 0010 sequences `.cq*` after OKF.

## Supports

- Because memory tooling (`memory_ingest` / recall / digest) already writes OKF fields, delaying `.cqk` avoids dual writers.
- Because ontology lint can dual-accept `.cqe` and `.yaml`, schema promotion can wait without blocking entity work.

## Attacks

- “Ship `.cqk` immediately for provenance” → Rejected: `worm_ref` works on OKF `.md` today; `.cqk` is a later ownership signal.
- “Skip OKF; use Fabric-style proprietary ontology only” → Rejected: portability and Git reviewability are explicit ADR 0009 requirements.

## Preference

Prefer OKF-first over extension-first when the goal is interchange and Obsidian compatibility.

## Decision

**Accepted** — OKF first; draft `.cq*` specs; promote later. Keep `worm_ref: null` until sealed.

## Provenance

- `correlation_id`: example-okf-decision-rationale
- `worm_ref`: pending
- Related: [[ADR 0009]] · [[ADR 0010]] · [OKF decision rationale](../../../docs/memory/okf-decision-rationale.md)
