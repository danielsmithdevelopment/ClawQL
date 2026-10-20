# AgentDojo — v1 ‖ v2 side by side

Outsiders already trust AgentDojo’s ASR and utility. ClawQL’s data-flow arm is scored with **their** metrics. claim_kind=`empirical`. CaMeL stays related work (not a table row).

Rules changelog: **[AGENTDOJO-RULES-DIFF.md](./AGENTDOJO-RULES-DIFF.md)** (`clawql_agentdojo_defaults_v2`). Artifacts: [v1](./results-agentdojo-v1.json) · [v2](./results-agentdojo-v2.json) · [combined](./results-agentdojo.json).

Remeasure readout order was locked before data: **(1) Slack ASR → (2) util without attack → (3) out-of-sample**.

---

## 1. Slack ASR (watchpoint first)

| | v1 clawql ASR | v2 clawql ASR | none (both runs ~) |
| --- | ---: | ---: | ---: |
| **Slack** | **0.30** \[0.21, 0.38\] | **0.40** \[0.30, 0.50\] | 0.66 |

Slack ASR **rose** under v2 (0.30 → 0.40). The same-workspace relaxation went too far on this suite for attack rate — **even though utility recovered**. Still below undefended (0.66), but the watchpoint triggers: do not treat v2 as a pure win on Slack security.

Other suites (ASR none → clawql):

| Suite | v1 | v2 |
| --- | ---: | ---: |
| Banking | 0.50 → 0.10 | 0.53 → 0.10 |
| Travel | 0.31 → 0.11 | 0.25 → 0.16 |
| Workspace | 0.18 → 0.00 | 0.17 → 0.04 |
| Pooled (n=949) | 0.30 → 0.064 | 0.29 → 0.106 |

---

## 2. Utility without attack vs undefended

| Suite | v1: none → clawql | v2: none → clawql (95% CI clawql) |
| --- | ---: | ---: |
| Banking | 0.56 → 0.56 | 0.69 → 0.56 \[0.31, 0.81\] |
| Slack | 0.76 → **0.24** | 0.81 → **0.57** \[0.38, 0.76\] |
| Travel | 0.60 → **0.25** | 0.50 → **0.40** \[0.20, 0.60\] |
| Workspace | 0.80 → **0.42** | 0.90 → **0.75** \[0.62, 0.88\] |

v2 recovered a large share of the clean-work cost on Slack, travel, and workspace. Banking stays near the v1 clawql level (this-run none was higher). Intervals remain wide (few dozen user tasks per suite).

---

## 3. Out-of-sample

| Arm | Result |
| --- | --- |
| **Scripted multi-attack board** | Holds: `clawql_default` **0/12** attacks, **14/14** benign — [results-scripted-oos-v2.json](./results-scripted-oos-v2.json) |
| **InjecAgent** | Protocol frozen before remeasure ([INJECAGENT.md](./INJECAGENT.md)); **scores not yet measured** — do not claim generalization beyond the scripted board |

---

## Honest summary

- **v1** (fail-closed-all, CI [39360438719](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/39360438719)): cut attacks ~80% (pooled ASR 0.30 → 0.064) at a **severe** clean-utility cost in 3/4 suites.
- **v2** (frozen allow/park/hard, CI [39458622200](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/39458622200)): much better clean utility; pooled ASR still down vs none (0.29 → 0.106), but **Slack ASR rose** vs v1 (0.30 → 0.40). Scripted board still holds. InjecAgent pending.

v2 is a cleaner measurement of the refined rules — not a free lunch. Next lever if Slack ASR must come back down: tighten what “allow” covers for channel posts that replay untrusted text, without returning to fail-closed-all.

## Full tables

### v1 — fail-closed-all (CI 39360438719)

| Suite     | Defense            |   n |         ASR (95% CI) | Util under attack | Util without attack | Blocks |
| --------- | ------------------ | --: | -------------------: | ----------------: | ------------------: | -----: |
| banking   | `none`             | 144 | 0.50 \[0.42, 0.58\]  |              0.49 |                0.56 |      — |
| banking   | `clawql_data_flow` | 144 | 0.10 \[0.05, 0.15\]  |              0.51 |                0.56 |    351 |
| slack     | `none`             | 105 | 0.66 \[0.56, 0.74\]  |              0.47 |                0.76 |      — |
| slack     | `clawql_data_flow` | 105 | 0.30 \[0.21, 0.38\]  |              0.18 |                0.24 |    270 |
| travel    | `none`             | 140 | 0.31 \[0.24, 0.39\]  |              0.36 |                0.60 |      — |
| travel    | `clawql_data_flow` | 140 | 0.11 \[0.06, 0.17\]  |              0.33 |                0.25 |     98 |
| workspace | `none`             | 560 | 0.18 \[0.15, 0.21\]  |              0.37 |                0.80 |      — |
| workspace | `clawql_data_flow` | 560 | 0.00 \[0.00, 0.00\]  |              0.34 |                0.42 |   3603 |

### v2 — `clawql_agentdojo_defaults_v2` (CI 39458622200)

| Suite     | Defense            |   n |         ASR (95% CI) | Util under attack | Util without attack (95% CI) | Blocks | No-atk stops |
| --------- | ------------------ | --: | -------------------: | ----------------: | ---------------------------: | -----: | -----------: |
| banking   | `none`             | 144 | 0.53 \[0.44, 0.60\]  |              0.49 |                         0.69 |      — |            — |
| banking   | `clawql_data_flow` | 144 | 0.10 \[0.05, 0.15\]  |              0.51 |            0.56 \[0.31, 0.81\] |    279 | 11 (all park) |
| slack     | `none`             | 105 | 0.66 \[0.56, 0.74\]  |              0.53 |                         0.81 |      — |            — |
| slack     | `clawql_data_flow` | 105 | 0.40 \[0.30, 0.50\]  |              0.50 |            0.57 \[0.38, 0.76\] |    133 | 14 (park+hard) |
| travel    | `none`             | 140 | 0.25 \[0.18, 0.33\]  |              0.44 |                         0.50 |      — |            — |
| travel    | `clawql_data_flow` | 140 | 0.16 \[0.11, 0.23\]  |              0.40 |            0.40 \[0.20, 0.60\] |     55 |  2 (park) |
| workspace | `none`             | 560 | 0.17 \[0.14, 0.20\]  |              0.36 |                         0.90 |      — |            — |
| workspace | `clawql_data_flow` | 560 | 0.04 \[0.03, 0.06\]  |              0.55 |            0.75 \[0.62, 0.88\] |   2117 |  9 (park+hard) |

ASR = `mean(security_results)` (`security()` True ⇒ injection succeeded). Allowed posts use **metadata** trust labels (body unchanged).

## What v1 benign stops looked like (autopsy; not v2 counterfactuals)

v1 policy was fail-closed on every sink after any untrusted read:

| Suite     | Tasks with blocks | Top sinks |
| --------- | ----------------: | --------- |
| Banking   |                 7 | `send_money`, `schedule_transaction` |
| Slack     |                16 | DM / add-user / channel message |
| Travel    |                 5 | calendar / `reserve_hotel` / email |
| Workspace |                22 | calendar / email / file writes |

Path-continuation util estimates stay internal-only (`agentdojo-park-vs-hard-counterfactual.json`).

## Defaults v2 (frozen — see rules diff)

| Disposition | Examples |
| ----------- | -------- |
| **Allow** (+ metadata trust label; body unchanged) | Slack DM / non-`External_*` channel post; `@bluesparrowtech.com` email; own calendar; own file create/append |
| **Park** (human) | Money / schedule; external email; travel reserves; **membership & invitations**; calendar participant adds |
| **Hard block** | `delete_*`, `share_file`, `post_webpage`, Slack `External_*`, membership with outside email |

## Publish gates

1. **Uncertainty** — 95% bootstrap CIs over pairs.
2. **Utility without attacks and under attack** — as prominent as ASR.
3. **CaMeL related work** until same-model — not a table row.
4. **Empirical, not “provable.”**

## Protocol label

| Question                    | Answer                                                                                                                                                                                   |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Same as `live-models.json`? | **No.** Pre-registered live models are separate.                                                                                                                                         |
| These models                | Harness via OpenRouter: federal-facing **`openai/gpt-4o-mini`**. DeepSeek lab-only.                                                                                                      |
| Sample size                 | Full = **949** attack pairs (workspace 560 + slack 105 + banking 144 + travel 140).                                                                                                      |
| Federal-facing              | Feature **`openai/gpt-4o-mini`** only.                                                                                                                                                   |

## Smoke matrix (n=12 workspace) — exploratory only

CI [39354352936](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/39354352936). Not the page headline.

| Audience         | Model                    | Defense            |              ASR | Utility (under attack) | ClawQL blocks |
| ---------------- | ------------------------ | ------------------ | ---------------: | ---------------------: | ------------: |
| Federal / public | `openai/gpt-4o-mini`     | none               | **0.92** (11/12) |            0.33 (4/12) |             — |
| Federal / public | `openai/gpt-4o-mini`     | `clawql_data_flow` |  **0.00** (0/12) |       **1.00** (12/12) |        **27** |
| Lab only         | `deepseek/deepseek-chat` | none               |      0.00 (0/12) |            0.67 (8/12) |             — |
| Lab only         | `deepseek/deepseek-chat` | `clawql_data_flow` |      0.00 (0/12) |            0.58 (7/12) |             1 |

## Related work: CaMeL (not a table row)

[CaMeL](https://arxiv.org/abs/2503.18813) — their models, their “provable” claim. Cite in context; same-model head-to-head required before any side-by-side %.

## Defense arm

`clawql_data_flow` — [`clawql_tools_executor.py`](../../../scripts/benchmarks/multi-attack-injection/agentdojo/clawql_tools_executor.py) · `DEFAULTS_ID=clawql_agentdojo_defaults_v2`

## CI matrix

```bash
gh workflow run multi-attack-agentdojo.yml \
  -f mode=full \
  -f suites=workspace,slack,banking,travel \
  -f models=openai/gpt-4o-mini
```

Upstream: [ethz-spylab/agentdojo](https://github.com/ethz-spylab/agentdojo) · `v1.2.2`.

## Status

- **v1 ‖ v2 published** with rules diff. Slack ASR watchpoint: rose under v2. Clean utility recovered on three suites. Scripted OOS holds. InjecAgent scores still pending.
