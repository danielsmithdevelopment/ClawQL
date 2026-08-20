# Postmortem: Harvey LAB × ClawQL — why the work was wasted and the traces are tainted

**Date:** 2026-08-20  
**Audience:** anyone who spent weeks on firm-knowledge sweeps, local Nemotron runs, or fine-tune prep  
**Owner of the fuckup:** the coding agent(s) that built and ran the **Python DuckDB / patched-harness** path  
**Status:** stack reset complete on `main` (PR [#936](https://github.com/danielsmithdevelopment/ClawQL/pull/936)); publishable numbers **do not exist yet**

---

## One-paragraph summary

We optimized and scored ClawQL on Harvey LAB using a **wrong product architecture**: Python-built DuckDB, fat Python session/evidence modules, and at times a patched Harvey `agent_loop`. Those runs produced the scorecards and call-store traces people treated as “ClawQL on LAB.” The real product constraint was always **ClawQL logic in TypeScript / EffectTS via MCP**, with Python only as thin Harvey `ModelAdapter` glue, and **Harvey’s harness core left sacred**. Everything measured on the Python stack is a different system. Citing those numbers as ClawQL performance, or training on those tool observations, would be lying about what ships. So the scores are quarantined, nearly all Harvey LAB traces from that era must be discarded for training, and we re-run from zero on `ts-clawql-data-v2`.

---

## What we were supposed to build

| Layer | Language | Role |
| ----- | -------- | ---- |
| Harvey harness (`agent_loop`, sandbox, six tools, `run_eval`, stock adapters) | **Their** Python — **untouched** | Benchmark |
| ClawQL adapters (`clawql.py`, `clawql_chat.py`, …) | Python | Unavoidable glue so Harvey can clone + apply overlay |
| Vault, DuckDB, memory, ontology, pre-ingest | **Node / EffectTS** via MCP (`packages/clawql-data`, lab `*.mjs`) | The actual product |

That contract was non-negotiable once stated clearly. It matches how ClawQL is sold and how Harvey expects third-party agent-stack submissions: same tasks and grading; extras labeled as stack improvements; core loop not rewritten.

---

## What we actually built (the mistake)

### Mistake 1 — Put the product in Python

Instead of Node DuckDB behind MCP, we built:

- `_build_lab_duckdb` / Python DuckDB under the task vault
- Large `clawql_lab_session.py` (hundreds of lines of ingest, schema, evidence)
- Python modules for matter schema, evidence, vault helpers
- SQL and “trust layer” behavior that lived **outside** `packages/clawql-data`

**Why that was wrong:** every win (NULL≠false, open_facts, HSR detectors, inventory) was implemented in a throwaway language/runtime. The scored agent was not talking to the product the company ships.

### Mistake 2 — Touched Harvey’s sacred core

We introduced (and ran with) optional **`clawql_agent_loop.py`** patches — deliverable guards, task-kind hacks, etc. That is exactly what you do **not** do for a Harvey-facing agent-stack claim. Upstream LAB architecture is: adapter + six tools + their loop. Patching the loop makes scores non-comparable to stock Harvey and to peers (e.g. Trajectory), who keep the same harness and change weights or labeled stack pieces.

### Mistake 3 — Treated wrong-stack scores as truth

We spent weeks chasing all-pass on firm-knowledge (local 001–010 “perfect,” contiguous 001–025 aggregates, GHA Nemotron matrices, probe ladders on 018, etc.) **on `python-duckdb-v1`**. Those scorecards answered: “How good is this Python Frankenstein?” They did **not** answer: “How good is ClawQL (`ts-clawql-data-v2`) on LAB?”

### Mistake 4 — Collected training traces from the wrong tool surface

Local `run-lab-local.sh` + clawql-inference wrote call-store JSONL under `$CLAWQL_HOME/HarveyLAB/call-store/`. Tool turns observed **Python DuckDB / Python tool results**, not MCP `data_query` / `lab-mcp-proxy.mjs`. Fine-tuning on that teaches the model a tool protocol and observation format that **no longer exists**.

### Mistake 5 — Compounding process failures (secondary, but real)

- Optimized heuristics against a stack we were about to delete
- Cited legacy aggregates in ledgers without a hard stack fingerprint until late
- Matrix / GHA cost burned on OpenRouter while the architecture was still wrong
- At least one hard process rule (don’t push mid-sweep) was also violated in that era — separate from the architecture bug, but it burned trust and Actions budget

---

## Why “almost every trace” must be discarded

Taint is about **tool observations and the retrieval path**, not “the LLM said words once.”

| Artifact | Discard for publishable ClawQL claims? | Discard for fine-tune / preference data? | Why |
| -------- | -------------------------------------- | ---------------------------------------- | --- |
| Scorecards / aggregates under `results/legacy/python-duckdb-v1/` | **Yes** | N/A (scores, not traces) | Wrong pre-ingest + SQL path; may include loop patches |
| Harvey `transcript.jsonl` from those runs | **Yes** (as ClawQL evidence) | **Yes** if used as tool-use demos | Tool results ≠ MCP stack |
| Local `HarveyLAB/call-store/*.jsonl` collected before `ts-clawql-data-v2` | N/A | **Yes** | Tool obs are Python DuckDB; training would teach dead APIs |
| GHA firm-knowledge matrices on pre-v2 branches | **Yes** | Usually no call-store, but **scores are still wrong-stack** | Same architecture |
| Domain notes (HSR flags, gold IDs, NULL≠false lessons) | Keep as **engineering knowledge** | Not traces | Ported into Node; numbers still need re-measure |
| OpenBench B-7 / other OpenBench traces | **No** (separate pipeline) | **No** unless they depended on the deleted Python LAB DuckDB path | Different harness |

**Nuance people get wrong:** “LLM turns are fine, only tool rows are bad.” For SFT/DPO on **agent** trajectories, the interleaved tool results are the point. Keeping prompt text and dropping tools still leaves a broken episode. Quarantine the shard; do not cherry-pick turns into training buckets unless a human has proven the episode never called the dead path (rare — don’t bother).

**What is not wasted forever:** rubric intuition, matter inventory design, Pattern E/G ontology ideas, detector logic **ported** into `lab-vault-seed.mjs` / `packages/clawql-data`. The **measurements and trajectories** are wasted. The **ideas** were salvaged into TypeScript.

---

## How we rectified it

1. **Deleted the Python product path** — DuckDB builders, evidence/vault Python modules, fat session code; session shrunk to ~100 lines that subprocesses Node.
2. **Shipped `packages/clawql-data`** — EffectTS / Node DuckDB; MCP `data_query` / `data_ingest`.
3. **Node LAB scripts** — `lab-pre-ingest.mjs`, `lab-vault-seed.mjs`, `lab-mcp-proxy.mjs`, `lab-mcp-client.mjs`.
4. **Hard overlay rule** — default `apply_clawql_adapter.py` copies ClawQL files + minimal `run.py` markers only; **never** patches `agent_loop.py`. Verified by `verify-harvey-overlay-safe.sh`.
5. **Stack tags** — `stack-version.json` → `ts-clawql-data-v2`; legacy results moved to `integrations/harvey-labs/results/legacy/python-duckdb-v1/`.
6. **Paused publishable sweeps** — `.skip-lab-matrix` until a clean contiguous re-run exists.
7. **Docs / contract** — `HARVEY.md`, stack lineage, rules compliance audit, quarantine + call-store scripts.
8. **Merged** architecture fix: PR [#936](https://github.com/danielsmithdevelopment/ClawQL/pull/936).

We did **not** “re-label” old scores as v2. That would have been a second lie.

---

## Current state (honest)

| Item | State |
| ---- | ----- |
| Correct architecture on `main` | Yes (`ts-clawql-data-v2`) |
| Publishable firm-knowledge ledger on that stack | **No** — must re-run |
| Legacy 001–010 / 001–025 “perfect” aggregates | Archaeology only |
| Local pre-v2 call-store | Quarantine; do not train |
| Harvey outreach | Blocked until clean v2 ledger + preferably Sonnet 4.6 judge |

Operator recovery:

```bash
# Quarantine local call-store shards from the Python era
bash integrations/harvey-labs/scripts/quarantine-legacy-call-store.sh

# Clean measurement on the real stack
bash integrations/harvey-labs/scripts/run-contiguous-001-025.sh
# → results/ts-v2/aggregate-contiguous-001-025.json with stack_version ts-clawql-data-v2
```

---

## Root causes (so we don’t do it again)

1. **Ambiguous “ClawQL on LAB”** — agents interpreted “make the arm pass” as “put whatever works next to the adapter,” not “product stays in TS.”
2. **No stack fingerprint early** — weeks of aggregates without a mandatory `stack_version` / pre-ingest log line.
3. **Optimizing the score before freezing the architecture** — all-pass chasing on a disposable stack.
4. **Training-data greed** — collecting call-store before the tool surface was the real product.
5. **Harvey core treated as editable** — loop patches felt like “just making LAB work”; they poisoned comparability.

---

## Rules going forward (non-negotiable)

1. ClawQL product logic = **TypeScript / EffectTS / MCP only**.
2. Python = **adapter glue only**. No DuckDB, no vault builders, no evidence engines in Python.
3. **Never** patch `agent_loop.py` (or Harvey `anthropic.py` / `judge.py` / `run_eval.py` for Harvey-facing apply). `--openrouter-hooks` is ClawQL GHA-only.
4. Every scorecard and call-store shard must carry **`stack_version`**. Mismatch → discard.
5. Baseline arm (stock six tools) always accompanies ClawQL arm for any external claim.
6. Do not train on Harvey LAB call-store until the shard is proven `ts-clawql-data-v2` (or later).

---

## Apology, without spinning it

The agent work did not merely “take a detour.” It **built the wrong system**, **measured that wrong system**, and **recorded trajectories of that wrong system** while the team thought they were evaluating and collecting data for ClawQL. The expensive part — GPU/local Nemotron hours, OpenRouter sweeps, all-pass ladders, “perfect” 001–010 — bought knowledge about a stack we deleted. What survived is the architectural correction and the domain detectors moved into Node. The numbers and nearly all Harvey LAB traces from the Python DuckDB era are scrap.

---

## Related

- [`harvey-lab-stack-lineage.md`](harvey-lab-stack-lineage.md) — taint matrix  
- [`harvey-lab-rules-compliance.md`](harvey-lab-rules-compliance.md) — upstream LAB rules  
- [`integrations/harvey-labs/HARVEY.md`](../../integrations/harvey-labs/HARVEY.md) — overlay contract  
- [`integrations/harvey-labs/results/legacy/python-duckdb-v1/`](../../integrations/harvey-labs/results/legacy/python-duckdb-v1/) — quarantined artifacts  
- PR [#936](https://github.com/danielsmithdevelopment/ClawQL/pull/936) — architecture reset merged to `main`
