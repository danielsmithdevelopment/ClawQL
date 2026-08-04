# Upstream proposal: `openbench-dataset` (OpenBenchTrace)

**Status:** draft for OpenBench maintainers / community  
**Author context:** ClawQL reference implementation  
**Schema:** [`openbench/schema/openbench-trace.v1.json`](../../openbench/schema/openbench-trace.v1.json)

---

## Summary

Propose an official **dataset export layer** for OpenBench: a versioned **OpenBenchTrace** schema, a small **`openbench-dataset`** package (writer + backends + scrub + export CLI), and a GitHub Actions composite so any team can turn benchmark runs into **citable, PII-safe, fine-tuning-ready** datasets.

ClawQL will continue to ship a compatible implementation and publish the first reference dataset. The schema and CLI belong upstream so the ecosystem converges on one format.

---

## Problem

Teams run agent / MCP benchmarks, get pass/fail numbers, and then the evaluation artifacts evaporate. There is no shared way to go from **benchmark run → labeled training dataset** with:

- a stable, documented schema (paper / HF citeable)
- write-time PII scrubbing with a verifiable manifest
- transport-agnostic durable storage (local, S3/R2, GCS, …)

Trajectory / SFT pipelines exist per project (e.g. synthetic MCP corpora, RL reward loops). What is missing is a **protocol** other teams can adopt without sharing vendor infrastructure.

---

## Proposal

### 1. Schema: `OpenBenchTrace` v1.0

Published JSON Schema + TypeScript types. Required fields cover identity (`trace_id`, `run_id`, `task_id`, `arm`), model/harness, `messages` / `tool_calls`, grader `verdict` / `score`, spend-cap flags, scrub metadata (`presidio_version`, `redaction_policy_hash`, content hashes), and `suitable_for_training`.

Changelog lives next to the schema. Breaking changes bump the major schema version.

### 2. Package: `openbench-dataset`

- **TraceWriter** — accepts a completed run (results + logs), emits validated OpenBenchTrace records  
- **Backends** — `local`, `s3` (R2-compatible), pluggable  
- **Scrub** — write-time redaction; Presidio when configured; always record policy in the manifest  
- **CLI** — `openbench-dataset export --source … --verdict pass --format huggingface`  
- **Manifest** — WORM batch manifest (hashes, scrub version, schema version, trace index)

### 3. Composite action: `openbench-dataset/collect`

Three-line drop-in for CI. Fail-loud if durable sink required but missing. Artifacts remain a short warm cache; object storage is the corpus of record.

---

## Non-goals (v1)

- Replacing OpenBench graders or task definitions  
- Mandating a single cloud vendor  
- Publishing any vendor’s private production traffic as “OpenBench” data  
- Claiming this is the first eval→FT pipeline in ML history (it is a **standardization** play)

---

## Compatibility

ClawQL’s current GHA path already emits OpenBenchTrace v1.0-compatible packs. Upstreaming means moving schema ownership and the generic package out of the ClawQL monorepo (or dual-publishing with OpenBench as source of truth).

---

## Ask

1. Interest in hosting `OpenBenchTrace` + `openbench-dataset` under the OpenBench org  
2. Feedback on schema v1.0 required fields  
3. Preferred package location (`packages/openbench-dataset` vs `contrib/dataset-export`)

Reference implementation (ClawQL): `packages/openbench-dataset`, `docs/benchmarks/openbench-dataset-product.md`.
