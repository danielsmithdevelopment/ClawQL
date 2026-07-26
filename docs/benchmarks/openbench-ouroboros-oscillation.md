# OpenBench — Ouroboros oscillation / doom-loop escape

Apples-to-apples A/B of **Ouroboros on vs off** on the same model, same
OpenCode harness, and same ClawQL MCP surface (memory included). The only
intentional variable is whether `ouroboros_*` tools are registered.

For this study OpenCode’s built-in `doom_loop` guard is **`allow`** so thrash
can appear (otherwise both arms are rescued by the harness). Spend is bounded by
a **hard 50-turn / 180s / 8000-token** auto-fail — not by waiting for a $10 key
cap. Ouroboros targets **strategy thrash** and stagnation:

| Detector (`ConvergenceReasonCode`) | Meaning                                     |
| ---------------------------------- | ------------------------------------------- |
| `oscillation`                      | A→B→A ontology flip-flop across generations |
| `no_drift` / `spinning`            | Stagnation / repeated execution output      |
| `diminishing_returns`              | Flat eval scores                            |
| `max_generations`                  | Hard exit when the loop ceiling is hit      |

## Task: `ouroboros-oscillation-escape`

- Broken `scheduler_lib/limiter.py` + two contradictory decoys under `decoy/`
- Correct leaky-bucket recipe lives only in the vault seed (removed from the
  workspace before the agent runs)
- **ouroboros-on:** must call `ouroboros_create_seed_from_document` →
  `ouroboros_run_evolutionary_loop` (`maxGenerations≤4`) then write the fix
- **ouroboros-off:** same MCP/memory, `CLAWQL_ENABLE_OUROBOROS=0` — no loop tools

## Hard spend / loop caps (auto-fail)

| Cap                   | Value      | Enforcement                                                 |
| --------------------- | ---------- | ----------------------------------------------------------- |
| Wall clock            | **180s**   | agent `--timeout` + workflow clamp + checker on `timed_out` |
| Tool turns            | **≤ 50**   | `.openbench_usage.json` + checker + `apply_hard_caps`       |
| Tokens                | **≤ 8000** | same (when usage is recorded)                               |
| Ouroboros generations | **≤ 4**    | instruction + `CLAWQL_OUROBOROS_MAX_GENERATIONS` MCP clamp  |
| OpenCode `doom_loop`  | **allow**  | `CLAWQL_OPENBENCH_DOOM_LOOP=allow` so thrash is observable  |
| Job timeout           | **40 min** | GitHub Actions `timeout-minutes`                            |

Exceeding any numeric cap → **SCORE 0** (not a soft penalty).

## How to run

```bash
# terminal 1
OPENROUTER_API_KEY=… clawql inference serve --port 8080

# terminal 2
CLAWQL_OPENBENCH_DOOM_LOOP=allow \
python3 openbench/scripts/run-ab-compare.py \
  --task ouroboros-oscillation-escape \
  --arms ouroboros-on,ouroboros-off \
  --model openrouter/deepseek/deepseek-chat \
  --timeout 180 \
  --trials 1 \
  --out /tmp/ouro-ab.json \
  --summary-md /tmp/ouro-ab.md
```

CI: workflow **OpenBench A/B (ouroboros on vs off)**
(`.github/workflows/openbench-ouroboros-ab.yml`) — `workflow_dispatch` or
path-filtered PR/push. Not part of the default three-task clawql-on/off matrix
(keeps PR token spend bounded).

## Expected shape of results

- **ouroboros-on:** invokes the evolutionary loop, stays under caps, applies the
  vault recipe, `selftest` passes.
- **ouroboros-off:** more likely to alternate decoy strategies, miss the vault
  discipline, hit turn/time caps, or fail `selftest`.

Use agent-logs under the artifact to confirm `ouroboros_run_evolutionary_loop`
and any stagnation / oscillation exit signals in tool output.
