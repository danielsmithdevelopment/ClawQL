# OpenBench — Ouroboros oscillation / doom-loop escape

Apples-to-apples A/B of **Ouroboros on vs off** on the same model and OpenCode
harness. OpenCode’s built-in `doom_loop` guard is **`allow`** so thrash can
appear. Spend is bounded by a **hard 50-turn / 180s / 8000-token** auto-fail.

## Why the first live run tied 1.0 / 1.0

[Run 30192620319](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30192620319)
gave both arms a vault memory seed with the full correct `limiter.py`. Off
one-shot `memory_recall` → `write` in 4 turns — no thrash to observe.

## Thrash-study design (current)

| Factor                      | ouroboros-on                            | ouroboros-off                          |
| --------------------------- | --------------------------------------- | -------------------------------------- |
| `ouroboros_*` tools         | yes (`maxGenerations≤4`)                | no                                     |
| Vault / memory recipe       | **disabled**                            | **disabled**                           |
| Correct leaky-bucket recipe | seed-source **appendix** in prompt only | none — only conflicting `decoy/` notes |
| OpenCode `doom_loop`        | allow                                   | allow                                  |
| Hard turn cap               | 50                                      | 50                                     |

Detectors exercised on-arm: oscillation / stagnation / spinning /
diminishing_returns / `max_generations` via `ouroboros_run_evolutionary_loop`.

## Hard spend / loop caps (auto-fail)

| Cap                   | Value      | Enforcement                                  |
| --------------------- | ---------- | -------------------------------------------- |
| Wall clock            | **180s**   | agent `--timeout` + workflow clamp + checker |
| Tool turns            | **≤ 50**   | usage sidecar + checker + `apply_hard_caps`  |
| Tokens                | **≤ 8000** | same (when recorded)                         |
| Ouroboros generations | **≤ 4**    | `CLAWQL_OUROBOROS_MAX_GENERATIONS`           |
| OpenCode `doom_loop`  | **allow**  | `CLAWQL_OPENBENCH_DOOM_LOOP=allow`           |
| Job timeout           | **40 min** | Actions `timeout-minutes`                    |

## Expected shape

- **ouroboros-on:** create seed from appendix → evolutionary loop → one write →
  selftest pass; turns well under 50. If the loop runs without a write, the
  harness issues one write nudge (recipe inlined).
- **ouroboros-off:** thrash (decoy flip-flops and/or identical-tool spam with
  `doom_loop` allow) until **turn/time hard-fail** or wrong implementation.

## Live evidence ([run 30863572642](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30863572642))

With doom_loop **allow**, no vault memory, 50-turn / 180s caps, write nudge + off thrash nudges:

| Arm           | Score | Turns | Wall (s) | Behavior                                                                      |
| ------------- | ----- | ----- | -------- | ----------------------------------------------------------------------------- |
| ouroboros-on  | **1.0** | 5   | 78       | `create_seed` → `run_evolutionary_loop` → `write` → selftest pass             |
| ouroboros-off | **0.0** | 4+  | 167      | Decoy flip-flop `read`/`write`/`bash` → wrong limiter → selftest fail         |

**Verdict:** on converges under hard caps; off thrashs / fails the task without Ouroboros.

### Earlier doom-loop capture ([run 30424169516](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30424169516))

Before the on-arm write nudge, both scored 0.0 under the same caps: on looped Ouroboros twice without writing; off `read` + **bash spam** hit `wall_s>180`. That run still shows OpenCode-level thrash when `doom_loop` is allowed (bounded before a $10 key burn).

## How to run

```bash
OPENROUTER_API_KEY=… clawql inference serve --port 8080

CLAWQL_OPENBENCH_DOOM_LOOP=allow \
python3 openbench/scripts/run-ab-compare.py \
  --task ouroboros-oscillation-escape \
  --arms ouroboros-on,ouroboros-off \
  --timeout 180 --trials 1 \
  --out /tmp/ouro-ab.json
```

CI: `.github/workflows/openbench-ouroboros-ab.yml` (dispatch / path-filtered).
