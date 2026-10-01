# Track B result — CodeGraph beats (keep opt-in)

**Runs:** [36796542256](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/36796542256) (53/54) → [36797559626](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/36797559626) (resume `A-grep` cg-prove-08).

**Locked decision:** [`codegraph-beat-decision.json`](codegraph-beat-decision.json)

| Metric | Value |
| ------ | ----- |
| Outcome | `codegraph_beats` → freeze `keep_codegraph_opt_in` |
| Prove Net (W−L) | **12** (W=12, L=0); treatment 12/12, grep 0/12 |
| No-harm | **6/6** pass (treatment); used_codegraph 6/6 |
| Usage | treatment used_codegraph **12/12** prove |
| Memory baseline | prove **3/12**, no-harm **0/6** (report-only) |

Grep control scored 0 on prove and no-harm under this harness/grading pass — Net is large, but interpret with the locked caveat that memory alone already clears some prove keys (3/12) and that a zero grep rate on “grep-solvable” no-harm keys is a harness signal to inspect later. Keep/purge follows the **locked rule as written**.
