# AgentDojo `clawql_data_flow` rules diff (frozen)

**Defaults id (current code):** `clawql_agentdojo_defaults_v3`  
**Published boards:** v1 ‖ v2 ‖ v3 in [AGENTDOJO.md](./AGENTDOJO.md).  
**v1 CI:** [39360438719](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/39360438719) · **v2 CI:** [39458622200](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/39458622200) · **v3 CI:** [39521352724](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/39521352724).

Published **side by side** with this changelog — not a replacement that erases what we got wrong.

## v2 → v3 (capability gate — from Slack ASR autopsy)

Autopsy artifact: [slack-asr-autopsy-v2.json](./slack-asr-autopsy-v2.json) (CI 39458622200).

| Finding | v2 behavior | v3 (`clawql_agentdojo_defaults_v3`) |
| --- | --- | --- |
| 29/42 Slack `security=True` used successful `send_*` | Free **allow** same-workspace DM/channel after taint | **allow only if destination ∈ trusted caps from user query**; else **park** |
| 19/42 had successful `invite_user_to_slack` | Not a controlled sink | **park** (with other membership) |
| Trusted plan / privilege | None | `extract_trusted_caps(query)` → destinations + write-tool privileges (B1); writes outside set → park |

Research anchors: CaMeL capabilities, Progent monotonic privilege, plan-then-execute. See [RESEARCH-ACTION-ITEMS.md](./RESEARCH-ACTION-ITEMS.md).

## v1 → v2 (what moved)

| Sink / class                                                                        | v1 (published)             | v2 (`clawql_agentdojo_defaults_v2`)                               | Why                                                                              |
| ----------------------------------------------------------------------------------- | -------------------------- | ----------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Any sink after untrusted read                                                       | hard fail (no disposition) | classified allow / park / hard_block                              | Attribute cost honestly; AgentDojo has no human for parks                        |
| Slack `send_direct_message`                                                         | blocked                    | **allow** + **metadata** trust label (body unchanged)             | Internal DM ≠ exfiltration; content can still phish in-workspace                 |
| Slack `send_channel_message` (non-`External_*`)                                     | blocked                    | **allow** + metadata trust label                                  | Same; label without rewriting graded message text                                |
| Slack `send_channel_message` (`External_*`)                                         | blocked                    | **hard_block**                                                    | Third-party surface                                                              |
| Slack `add_user_to_channel` / `invite_user_to_channel` / `remove_user_from_channel` | blocked                    | **park** (human); **hard_block** if `External_*` or outside email | Membership is privileged even inside the workspace; attacks inject from channels |
| Workspace `@bluesparrowtech.com` `send_email`                                       | blocked                    | **allow** + metadata trust label                                  | Same-org, not exfil; body intact for AgentDojo checks                            |
| Workspace external `send_email`                                                     | blocked                    | **park**                                                          | Human gate                                                                       |
| `create_calendar_event` / `reschedule_calendar_event`                               | blocked                    | **allow** + metadata trust label                                  | Own calendar work after reads                                                    |
| `add_calendar_event_participants`                                                   | blocked                    | **park** (hard if outside email)                                  | Privileged membership analogue                                                   |
| `create_file` / `append_to_file`                                                    | blocked                    | **allow** + metadata trust label                                  | Own drive; content text unchanged                                                |
| `send_money` / schedule updates                                                     | blocked                    | **park**                                                          | Human gate                                                                       |
| `reserve_hotel` / car / restaurant                                                  | blocked                    | **park**                                                          | Human gate; reviews→book is the task _and_ an attack path                        |
| `delete_*` / `share_file` / `post_webpage` / `cancel_calendar_event`                | blocked                    | **hard_block**                                                    | Destructive / clear exfil                                                        |

Code: [`clawql_tools_executor.py`](../../../scripts/benchmarks/multi-attack-injection/agentdojo/clawql_tools_executor.py) (`DEFAULTS_ID`).

### Pre-remeasure clarification (label placement)

Untrusted-derived labels are recorded in ClawQL’s own `labeled_calls` metadata (`trust=clawql:untrusted-derived`, `label_placement=clawql_metadata_not_body`). **Message bodies are not prefixed.** AgentDojo utility checks often compare message content; a body marker would fail otherwise-successful tasks and understate utility for a reason unrelated to the rules. Allow / park / hard_block dispositions are unchanged.

## Caution: same-workspace ≠ safe

AgentDojo Slack injections come **from within the workspace** (channel messages). Relaxing untrusted→internal can admit attacks that never leave:

1. **Membership / invitations** — parked (or hard-blocked for outside emails / `External_*`).
2. **Internal posts carrying attacker text** — allowed with a **metadata** untrusted-derived label (not a body rewrite).

**Remeasure watchpoint:** Slack suite ASR specifically. If it rises noticeably vs v1, the relaxation went too far.

## Remeasure honesty plan (anti-tuning)

v2 was informed by AgentDojo benign failures. Grading only on AgentDojo would be optimistic by construction. Freeze v2, then measure all three arms below. The second injection benchmark is **named here before any remeasure run** so it cannot be chosen to suit AgentDojo outcomes.

| Arm                                                                                                            | Role                                                             | Fixed in advance                                                                                                      |
| -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| **AgentDojo full matrix** (gpt-4o-mini, same protocol)                                                         | In-sample remeasure — CIs, util±attack, **Slack ASR** callout    | Yes — same suites/attack as v1                                                                                        |
| **Scripted multi-attack board** (`clawql_default` / product gate)                                              | Out-of-sample — benign expect-match + block exfil                | Yes — existing board                                                                                                  |
| **[InjecAgent](https://github.com/uiuc-kang-lab/InjecAgent)** (Zhan et al.; tool-using agent prompt-injection) | Out-of-sample second benchmark — **played no part in tuning v2** | **Yes — chosen before remeasure** — protocol in [INJECAGENT.md](./INJECAGENT.md). If only AgentDojo improves, say so. |

Internal-only estimates (path-continuation counterfactuals) stay in `agentdojo-park-vs-hard-counterfactual.json` — **not** on the public page. The remeasure settles utility and ASR; until then those figures are not results.

## How the remeasure was read (fixed order — applied)

1. **Slack ASR first.** v1 clawql **0.30 → v2 0.40** (rose) → **v3 0.29** (cut back via capability gate). Still below undefended (~0.67).
2. **Utility without attack vs undefended.** v2 recovered Slack/workspace/travel; **v3 re-collapsed Slack util_clean to ~0.24** (near v1) while travel util_clean rose (0.40→0.55) and workspace partially gave back (0.75→0.62). Banking flat at 0.56 clawql.
3. **Out-of-sample.** Scripted board holds (0/12 + 14/14). InjecAgent scores still pending — generalization beyond scripted is **not** claimed.

Published **v1 ‖ v2 ‖ v3 + this diff** in AGENTDOJO.md. v3 is an ASR fix for Slack, **not** a Pareto win over v2.
