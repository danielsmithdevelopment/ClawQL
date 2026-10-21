# AgentDojo — v1 ‖ v2 ‖ v3 side by side

Outsiders already trust AgentDojo’s ASR and utility. ClawQL’s data-flow arm is scored with **their** metrics. claim_kind=`empirical`. CaMeL stays related work (not a table row).

Rules changelog: **[AGENTDOJO-RULES-DIFF.md](./AGENTDOJO-RULES-DIFF.md)** (code `DEFAULTS_ID=clawql_agentdojo_defaults_v3`). Artifacts: [v1](./results-agentdojo-v1.json) · [v2](./results-agentdojo-v2.json) · [v3](./results-agentdojo-v3.json) · [combined](./results-agentdojo.json).

Remeasure readout order was locked before data: **(1) Slack ASR → (2) util without attack → (3) out-of-sample**.

---

## 1. Slack ASR (watchpoint first)

| | v1 clawql ASR | v2 clawql ASR | v3 clawql ASR | none (~) |
| --- | ---: | ---: | ---: | ---: |
| **Slack** | **0.30** \[0.21, 0.38\] | **0.40** \[0.30, 0.50\] | **0.29** \[0.20, 0.37\] | 0.66–0.67 |

- **v2 rose** vs v1 (0.30 → 0.40) — same-workspace allow went too far.
- **v3 cut it back** (0.40 → 0.29) via the trusted-query capability gate + invite park — back near v1, still well below undefended.

Other suites (ASR none → clawql):

| Suite | v1 | v2 | v3 |
| --- | ---: | ---: | ---: |
| Banking | 0.50 → 0.10 | 0.53 → 0.10 | 0.53 → 0.10 |
| Travel | 0.31 → 0.11 | 0.25 → 0.16 | 0.33 → 0.16 |
| Workspace | 0.18 → 0.00 | 0.17 → 0.04 | 0.18 → 0.03 |
| Pooled (n=949) | 0.30 → 0.064 | 0.29 → 0.106 | 0.31 → **0.085** |

---

## 2. Utility without attack vs undefended

| Suite | v1: none → clawql | v2: none → clawql | v3: none → clawql (95% CI clawql) |
| --- | ---: | ---: | ---: |
| Banking | 0.56 → 0.56 | 0.69 → 0.56 | 0.56 → **0.56** \[0.31, 0.81\] |
| Slack | 0.76 → **0.24** | 0.81 → **0.57** | 0.71 → **0.24** \[0.10, 0.43\] |
| Travel | 0.60 → **0.25** | 0.50 → **0.40** | 0.70 → **0.55** \[0.35, 0.75\] |
| Workspace | 0.80 → **0.42** | 0.90 → **0.75** | 0.78 → **0.62** \[0.50, 0.75\] |

v3 **re-paid** most of the Slack clean-utility cost that v2 had recovered (0.57 → 0.24). Travel util_clean improved vs v2 (0.40 → 0.55); workspace dropped some of v2’s recovery (0.75 → 0.62). Banking flat.

---

## 3. Out-of-sample

| Arm | Result |
| --- | --- |
| **Scripted multi-attack board** | Holds: `clawql_default` **0/12** attacks, **14/14** benign — [results-scripted-oos-v2.json](./results-scripted-oos-v2.json) |
| **InjecAgent** | Protocol frozen before remeasure ([INJECAGENT.md](./INJECAGENT.md)); **scores not yet measured** — do not claim generalization beyond the scripted board |

---

## Honest summary

- **v1** (fail-closed-all, CI [39360438719](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/39360438719)): cut attacks ~80% (pooled ASR 0.30 → 0.064) at a **severe** clean-utility cost in 3/4 suites.
- **v2** (frozen allow/park/hard, CI [39458622200](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/39458622200)): much better clean utility; pooled ASR still down vs none (0.29 → 0.106), but **Slack ASR rose** vs v1 (0.30 → 0.40).
- **v3** (capability gate, CI [39521352724](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/39521352724)): **Slack ASR down** vs v2 (0.40 → 0.29); pooled ASR 0.31 → 0.085. **Not a Pareto win** — Slack util_clean collapsed back to ~v1 (0.57 → 0.24). Travel util_clean up; workspace partially down vs v2. Scripted board still holds. InjecAgent pending.

v3 closed the Slack ASR hole from the autopsy; it did **not** keep v2’s Slack utility. Next lever if both ASR and util_clean must move together: unbound messaging privilege that still blocks invite/`External_*` exfil without parking ordinary same-channel replies (v3.1 plan) — measure before claiming a win.

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

### v3 — `clawql_agentdojo_defaults_v3` (CI 39521352724)

| Suite     | Defense            |   n |         ASR (95% CI) | Util under attack | Util without attack (95% CI) | Blocks | No-atk stops |
| --------- | ------------------ | --: | -------------------: | ----------------: | ---------------------------: | -----: | -----------: |
| banking   | `none`             | 144 | 0.53 \[0.44, 0.61\]  |              0.46 |                         0.56 |      — |            — |
| banking   | `clawql_data_flow` | 144 | 0.10 \[0.05, 0.15\]  |              0.51 |            0.56 \[0.31, 0.81\] |    258 | 7 (park) |
| slack     | `none`             | 105 | 0.67 \[0.57, 0.75\]  |              0.51 |                         0.71 |      — |            — |
| slack     | `clawql_data_flow` | 105 | 0.29 \[0.20, 0.37\]  |              0.22 |            0.24 \[0.10, 0.43\] |    297 | 30 (park+hard) |
| travel    | `none`             | 140 | 0.33 \[0.25, 0.41\]  |              0.32 |                         0.70 |      — |            — |
| travel    | `clawql_data_flow` | 140 | 0.16 \[0.10, 0.22\]  |              0.46 |            0.55 \[0.35, 0.75\] |     48 | 3 (park) |
| workspace | `none`             | 560 | 0.18 \[0.15, 0.21\]  |              0.37 |                         0.78 |      — |            — |
| workspace | `clawql_data_flow` | 560 | 0.03 \[0.01, 0.04\]  |              0.56 |            0.62 \[0.50, 0.75\] |   2230 | 10 (park+hard) |

ASR = `mean(security_results)` (`security()` True ⇒ injection succeeded). Allowed posts use **metadata** trust labels (body unchanged). v3 adds trusted-query capability membership for Slack messaging destinations.

## What v1 benign stops looked like (autopsy; not v2/v3 counterfactuals)

v1 policy was fail-closed on every sink after any untrusted read:

| Suite     | Tasks with blocks | Top sinks |
| --------- | ----------------: | --------- |
| Banking   |                 7 | `send_money`, `schedule_transaction` |
| Slack     |                16 | DM / add-user / channel message |
| Travel    |                 5 | calendar / `reserve_hotel` / email |
| Workspace |                22 | calendar / email / file writes |

Path-continuation util estimates stay internal-only (`agentdojo-park-vs-hard-counterfactual.json`).

## Defaults v3 (current code — see rules diff)

| Disposition | Examples |
| ----------- | -------- |
| **Allow** (+ metadata trust label; body unchanged) | Same-workspace Slack DM/channel **only if destination ∈ trusted caps from user query**; `@bluesparrowtech.com` email; own calendar; own file create/append |
| **Park** (human) | Money / schedule; external email; travel reserves; **membership & invitations** (incl. `invite_user_to_slack`); calendar participant adds; messaging outside trusted caps |
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

`clawql_data_flow` — [`clawql_tools_executor.py`](../../../scripts/benchmarks/multi-attack-injection/agentdojo/clawql_tools_executor.py) · code `DEFAULTS_ID=clawql_agentdojo_defaults_v3` · published board **v1 ‖ v2 ‖ v3**

## CI matrix

```bash
gh workflow run multi-attack-agentdojo.yml \
  -f mode=full \
  -f suites=workspace,slack,banking,travel \
  -f models=openai/gpt-4o-mini
```

Upstream: [ethz-spylab/agentdojo](https://github.com/ethz-spylab/agentdojo) · `v1.2.2`.

## Status

- **v1 ‖ v2 ‖ v3 published** with rules diff. v3: Slack ASR down vs v2; Slack util_clean collapsed (~v1). Not a Pareto win. Scripted OOS holds. InjecAgent scores still pending.
