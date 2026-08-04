# Evidence: Ouroboros stops strategy thrash

**Claim:** With a cheap coding model and OpenCode’s identical-tool `doom_loop` guard
**disabled**, enabling ClawQL **Ouroboros** MCP tools lets the agent crystallize a
spec and converge, while the same harness **without** Ouroboros flip-flops on
conflicting decoys and fails — under hard spend caps (not a $10 key burn).

**Status:** Verified live A/B · [PR #759](https://github.com/danielsmithdevelopment/ClawQL/pull/759) ·
[Actions run 30863572642](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30863572642)

Full harness design, caps, and repro:
[`openbench-ouroboros-oscillation.md`](./openbench-ouroboros-oscillation.md).

---

## What was held constant

| Factor              | Both arms                                         |
| ------------------- | ------------------------------------------------- |
| Model / harness     | OpenCode + clawql-inference (cheap OpenRouter)    |
| MCP core            | Same ClawQL server; vault **memory disabled**     |
| Task                | `ouroboros-oscillation-escape` (leaky-bucket impl)|
| OpenCode `doom_loop`| **`allow`** (so thrash is observable)             |
| Hard auto-fail caps | **≤50 turns · 180s · ≤8000 tokens**               |

**Only difference:** `ouroboros_*` tools + on-only seed appendix (correct recipe).
Off-arm sees conflicting `decoy/` notes that encourage strategy flip-flop.

---

## Headline result

| Arm             | Score   | Turns | Wall | Observed path                                              |
| --------------- | ------- | ----- | ---- | ---------------------------------------------------------- |
| **ouroboros-on**  | **1.0** | 5     | 78s  | `create_seed` → `run_evolutionary_loop` → `write` → pass |
| **ouroboros-off** | **0.0** | 4+    | 167s | Decoy `read`/`write`/`bash` flip-flop → selftest fail    |

**Why this is value, not a toy win**

1. **Strategy thrash ≠ identical-tool spam.** Off failed by alternating decoy
   strategies, not by repeating the same tool call forever.
2. **Ouroboros did the job.** On-arm used the evolutionary loop to lock a seed
   and land one correct write under the generation/turn caps.
3. **Spend stayed bounded.** Caps + `maxGenerations≤4` kept the thrash study
   cheap even with `doom_loop` allowed (earlier run also showed off bash-spam
   hitting `wall_s>180` before a large bill).

Supporting thrash capture (pre write-nudge, both 0.0, off doom-loop into wall):
[run 30424169516](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30424169516).

---

## What this does *not* claim

- Not a multi-trial Wilson CI yet (n=1 live cell on the final design).
- Not “Ouroboros beats OpenCode `doom_loop`” — that guard was **off** so thrash
  could appear. Production often leaves it on.
- Not a vault-memory win — memory was disabled after an early confound where
  both arms one-shot the answer from the vault ([run 30192620319](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30192620319)).

---

## Recommended next test

**Additive value with `doom_loop` on (default deny).**

| Arm             | `doom_loop` | Ouroboros | Hypothesis                                      |
| --------------- | ----------- | --------- | ------------------------------------------------- |
| ouroboros-on    | deny        | yes       | Still converges on decoy-conflict task            |
| ouroboros-off   | deny        | no        | Still thrashs via **strategy** flip-flop (A↔B)    |

OpenCode’s guard stops *identical* tool spam; it does **not** stop alternating
between two plausible-but-wrong decoys. That is the production-relevant gap
Ouroboros should close. Same task, same caps, `CLAWQL_OPENBENCH_DOOM_LOOP`
unset/deny; prefer **≥3 trials** for a short confidence interval.

Optional follow-ons after that:

1. **n≥5** on the current `doom_loop=allow` cell (stability / CI width).
2. **Stagnation-only** variant (same wrong file rewritten without score gain) to
   exercise `diminishing_returns` / stagnation exit without decoy alternation.

---

## Links

- Task pack: [`openbench/tasks/ouroboros-oscillation-escape/`](../../openbench/tasks/ouroboros-oscillation-escape/)
- Workflow: [`.github/workflows/openbench-ouroboros-ab.yml`](../../.github/workflows/openbench-ouroboros-ab.yml)
- Package guide: [`docs/ouroboros/clawql-ouroboros.md`](../ouroboros/clawql-ouroboros.md)
- OpenBench overview: [`openbench.md`](./openbench.md)
