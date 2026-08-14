# Harvey LAB × Ouroboros — deliverable grounding Wonder

Status: **simplified Wonder in the LAB agent loop** (not a full
`ouroboros_run_evolutionary_loop` yet). Full evolutionary Execute→Evaluate→Wonder→Reflect
for firm-knowledge remains a follow-on.

## Why

Batch 1 showed two distinct ClawQL failure modes:

| Mode                     | Example                                              | Symptom                                                             |
| ------------------------ | ---------------------------------------------------- | ------------------------------------------------------------------- |
| Context pin              | Task 014 `ls -R $WORKSPACE_DIR`                      | ~180k tokens stuck in history every turn                            |
| Invented domain language | `COVENANT-LITE` ontology filters / deliverable terms | Files written, judge correctly scores **0%** (hallucinated content) |

Empty-output guards do not catch the second mode. The agent produced a
deliverable; the judge rejected it because claims were not grounded in DMS text.

This is the **zsec hallucination-bin principle** at deliverable level: findings
start **guilty until proven by document evidence**.

## Wonder step (LAB) — kind-gated

When `/workspace/output/` already has a file and the model stops tool use, the
ClawQL agent-loop patch injects **one** user message
(`CLAWQL_LAB_GROUNDING_WONDER`, default on). The text depends on a heuristic
task kind inferred from the user prompt (`CLAWQL_LAB_TASK_KIND` overrides):

| Kind                      | Wonder behavior                                                                                                       |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `enumeration`             | Verify each listed matter against cited paths                                                                         |
| `frequency`               | Stop condition = **corpus coverage**; `0 of N` / none is complete — do not hunt forever for positive hits             |
| `single_answer` (default) | **Budget 1–2 greps**; listing many matters is a framing error; HSR filing ≠ second request; partial hits = unresolved |

Batch-2 task 008 failure mode: Pattern E second-request framing on a “most
recent HSR **filing**” prompt, then Wonder spent ~19 turns proving the wrong
list. Kind-gating + Pattern E scope in `clawql_system_prompt.md` address that.

Task 018 failure mode (distinct): ClawQL arm used **zero** `memory_recall`,
bash/grep-hunted “springing lien” for 40/40 turns, never wrote, never
inferred **0 of 12**. Clean-stop deliverable guard never fired (ceiling hit);
Wonder never ran (needs a file). Fixes in the agent-loop patch:

| Fix                       | Env / prompt                                | Effect                                                     |
| ------------------------- | ------------------------------------------- | ---------------------------------------------------------- |
| Turn-ceiling force-write  | `CLAWQL_LAB_CEILING_LEAD_TURNS` (default 3) | Nudge Write before max turns if `/workspace/output/` empty |
| Negative-result principle | `clawql_system_prompt.md`                   | Permission to conclude `0 of N` / none                     |
| Require ≥1 recall         | `CLAWQL_LAB_REQUIRE_RECALL` (default on)    | Initial nudge toward `clawql_memory_recall`                |
| Frequency task kind       | `CLAWQL_LAB_TASK_KIND` / heuristics         | Wonder asks “did I cover the corpus?”                      |

Disable with `CLAWQL_LAB_GROUNDING_WONDER=0` if needed for ablation.

## Mapping to full Ouroboros later

| Ouroboros phase | LAB today                                | Later                                           |
| --------------- | ---------------------------------------- | ----------------------------------------------- |
| Seed            | Task JSON + rubric criteria              | Formal Seed with constitutional principles      |
| Execute         | Pattern E recall → harness tools → write | Same                                            |
| Evaluate        | Harvey Sonnet judge (external)           | Optional mid-loop criterion scorer              |
| Wonder          | Grounding nudge (this doc)               | LLM Wonder: which criteria unproven vs corpus   |
| Reflect         | Prompt fallback after ≤2 empty recalls   | Revise strategy seed (direct read / new filter) |
| Converge        | Max turns + always write                 | Stop when all criteria grounded or budget       |

## Public reproducibility (Harvey outreach)

Credibility for LAB claims rests on **independent verification**, not private
notebooks:

- Public adapter overlay: `integrations/harvey-labs/`
- Public workflow: `.github/workflows/harvey-lab-firm-knowledge.yml`
- Public Actions run IDs (e.g. batch 1 matrix
  [31562539617](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/31562539617))
- Harness = Harvey’s own `harvey-labs` evaluation methodology + Sonnet judge

Outreach framing: clone the repo, inspect the adapter, re-run any task from a
run ID. That is the difference between a benchmark claim and a marketing claim.

## Batch 2 smoke gate (before full sweep)

1. Confirm OpenRouter daily quota reset (or use local MLX Nemotron).
2. Run **task 001 smoke only** (no `.run-nemotron-sweep` marker).
3. Pass criteria before arming the 25-task marker:

| Check                   | Healthy Nemotron+ClawQL (task 001)   | Fail / stop                            |
| ----------------------- | ------------------------------------ | -------------------------------------- |
| Turns                   | ~4–8                                 | →40 with no deliverable                |
| Cumulative input tokens | ≲150k (often ~50–100k)               | Multi-million or sustained ~180k+/turn |
| Per-turn jump           | No single tool dump → ~100k+ context | `ls -R` / full-tree find pattern       |
| CPR                     | Prefer 100% / all-pass on 001        | Investigate before burning daily quota |

Opus+ClawQL reference on 001 was ~5 turns / ~96k input — different arm; do not
confuse with the Nemotron gate above.

4. Only then create `.run-nemotron-sweep` with `25` and Sonnet judge; keep
   `max-parallel: 2`.
