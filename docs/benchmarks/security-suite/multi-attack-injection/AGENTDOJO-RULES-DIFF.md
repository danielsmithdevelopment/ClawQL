# AgentDojo `clawql_data_flow` rules diff (frozen)

**Defaults id:** `clawql_agentdojo_defaults_v2`  
**Status:** **remeasured** — v1 ‖ v2 published in [AGENTDOJO.md](./AGENTDOJO.md).  
**v1 CI:** [39360438719](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/39360438719) · **v2 CI:** [39458622200](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/39458622200).

Published **side by side** with this changelog — not a replacement that erases what we got wrong.

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

1. **Slack ASR first.** v1 clawql **0.30 → v2 0.40** — rose noticeably. Relaxation went too far on Slack attack rate regardless of utility gains.
2. **Utility without attack vs undefended.** Large recovery on Slack (0.24→0.57), workspace (0.42→0.75), travel (0.25→0.40); banking ~flat at 0.56 clawql.
3. **Out-of-sample.** Scripted board holds (0/12 + 14/14). InjecAgent scores still pending — generalization beyond scripted is **not** claimed.

Published **v1 ‖ v2 + this diff** in AGENTDOJO.md.
