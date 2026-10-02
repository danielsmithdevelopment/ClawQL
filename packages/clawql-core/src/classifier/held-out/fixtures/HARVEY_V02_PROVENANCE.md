# Fast Decision held-out v0.2 — Harvey LAB provenance

Suite: `fast-decision-held-out-v0.2-harvey`

## Source

R2 bucket `clawql-openbench-traces` (Cloudflare R2, sync keys / GHA durable sink).

Prefix: `raw/harvey-lab/`

## Transcripts mined (nemotron-clawql)

| Task | Run           | CPR | First tools                                   | Used for                              |
| ---- | ------------- | --- | --------------------------------------------- | ------------------------------------- |
| 001  | `31653266479` | 1.0 | `clawql_memory_recall` + `HSR_SECOND_REQUEST` | HSR list routing, doc type, Pattern E |
| 002  | `31653266479` | 1.0 | same recall pattern                           | HSR merger-review routing             |
| 004  | `31653266479` | 0.0 | recall then FTC compliance letter             | doc type, client_short_name           |
| 008  | `31653266479` | 0.0 | recall + bash                                 | filing vs second-request framing      |
| 012  | `31653266479` | 1.0 | blind `grep springing lien`                   | prefer structured tool                |
| 018  | `31757993774` | 0.0 | bash ls/hunt 40 turns                         | anti-pattern first tool               |
| 018  | `31853395295` | 0.0 | `memory_recall` CREDIT_FACILITY then grep     | over-recall vs SQL                    |
| 018  | `31855811931` | 1.0 | `clawql_sql` cohort counts                    | gold routing for springing-lien rate  |

## Honesty

- Cases ship with `adjudicated: false`.
- `groundTruthCandidateId` is **provisional**, chosen from successful vs failed Lab tool sequences and Lab docs (Pattern E, Fix 6/7, filing≠second-request). It is **not** a frontier-judge Fast Decision label and **not** Lab CPR.
- Re-run live frontier adjudication for this suite:
  - **Harvey-style marker PR (preferred for agents):** set
    `packages/clawql-core/src/classifier/held-out/.run-frontier-adjudication` to
    `v0.2-harvey` and open a PR — GHA runs live judge + GLiNER (same-repo secrets).
  - GHA dispatch: `gh workflow run fast-decision-frontier-adjudication.yml -f suite=v0.2-harvey -f with_gliner=true`
  - Local: `CLAWQL_FAST_DECISION_JUDGE_URL=… npx tsx scripts/run-held-out-adjudication.mts --suite v0.2-harvey --out …`
  - Replay: `RESCORE=1 SUITE=v0.2-harvey bash scripts/fetch-frontier-adjudication-artifact.sh`
- Do not cite `productionTrusted` until live labels + live GLiNER2 + DEFAULT criteria pass.
- **Ontology enrichment (default off for routing):** held-out scoring may pack
  catalog-generated ontology into GLiNER classify text/labels when
  `CLAWQL_FAST_DECISION_ONTOLOGY=1`. Clean v0.3 dual-arm showed no evidence of
  benefit (see `ONTOLOGY_ENRICHMENT_EVAL_LOG.md`). The earlier Harvey +14pt A/B
  is **contaminated-smoke** — do not cite as held-out lift.

### Contaminated smoke — do not cite as held-out lift

The 2026-09-25 ontology ON/OFF A/B on this suite’s routing site (n=7,
4/7→5/7, MCE 0.483→0.383) is tagged **`contaminated-smoke`**. The capability
fixture and label rewrites were authored against these same Harvey routing
failures. Net +1 hides 3 gains / 2 regressions; the two regressions
(`harvey-012`, `harvey-008`) were **correct without ontology** (sibling
collapse under shared catalog text). Full write-up:
[`ONTOLOGY_ENRICHMENT_EVAL_LOG.md`](./ONTOLOGY_ENRICHMENT_EVAL_LOG.md).
Do not quote those numbers as §7 held-out lift. Fresh routing set + catalog-
generated ontology: [`capability-ontology-from-catalog-v0.1.md`](../../../../../../docs/specs/classifier/capability-ontology-from-catalog-v0.1.md).

## Docs cross-links

- `docs/benchmarks/harvey-lab-clawql-results.md`
- `docs/benchmarks/harvey-lab-ouroboros-grounding-wonder.md`
- `docs/benchmarks/harvey-lab-pause-handoff.md`
