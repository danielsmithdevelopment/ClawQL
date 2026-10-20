# AgentDojo `clawql_data_flow` rules diff (frozen)

**Defaults id:** `clawql_agentdojo_defaults_v2`  
**Status:** frozen for remeasure — do not retune against AgentDojo benign fails before the out-of-sample checks below land.  
**Official numbers until remeasure:** published fail-closed-all table in [AGENTDOJO.md](./AGENTDOJO.md) / CI [39360438719](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/39360438719).

When the remeasure lands, publish **v1 (fail-closed-all) and v2 side by side** with this changelog — not a replacement that erases what we got wrong.

## v1 → v2 (what moved)

| Sink / class | v1 (published) | v2 (`clawql_agentdojo_defaults_v2`) | Why |
| ------------ | -------------- | ----------------------------------- | --- |
| Any sink after untrusted read | hard fail (no disposition) | classified allow / park / hard_block | Attribute cost honestly; AgentDojo has no human for parks |
| Slack `send_direct_message` | blocked | **allow** + stamp body `[clawql:untrusted-derived]` | Internal DM ≠ exfiltration; content can still phish in-workspace |
| Slack `send_channel_message` (non-`External_*`) | blocked | **allow** + stamp body | Same; label attacker-derived text even when it stays inside |
| Slack `send_channel_message` (`External_*`) | blocked | **hard_block** | Third-party surface |
| Slack `add_user_to_channel` / `invite_user_to_channel` / `remove_user_from_channel` | blocked | **park** (human); **hard_block** if `External_*` or outside email | Membership is privileged even inside the workspace; attacks inject from channels |
| Workspace `@bluesparrowtech.com` `send_email` | blocked | **allow** + stamp body | Same-org, not exfil |
| Workspace external `send_email` | blocked | **park** | Human gate |
| `create_calendar_event` / `reschedule_calendar_event` | blocked | **allow** | Own calendar work after reads |
| `add_calendar_event_participants` | blocked | **park** (hard if outside email) | Privileged membership analogue |
| `create_file` / `append_to_file` | blocked | **allow** + stamp content when present | Own drive; label untrusted-derived text |
| `send_money` / schedule updates | blocked | **park** | Human gate |
| `reserve_hotel` / car / restaurant | blocked | **park** | Human gate; reviews→book is the task *and* an attack path |
| `delete_*` / `share_file` / `post_webpage` / `cancel_calendar_event` | blocked | **hard_block** | Destructive / clear exfil |

Code: [`clawql_tools_executor.py`](../../../scripts/benchmarks/multi-attack-injection/agentdojo/clawql_tools_executor.py) (`DEFAULTS_ID`).

## Caution: same-workspace ≠ safe

AgentDojo Slack injections come **from within the workspace** (channel messages). Relaxing untrusted→internal can admit attacks that never leave:

1. **Membership / invitations** — parked (or hard-blocked for outside emails / `External_*`).
2. **Internal posts carrying attacker text** — allowed only with an untrusted-derived **content label**.

**Remeasure watchpoint:** Slack suite ASR specifically. If it rises noticeably vs v1, the relaxation went too far.

## Remeasure honesty plan (anti-tuning)

v2 was informed by AgentDojo benign failures. Grading only on AgentDojo would be optimistic by construction. Freeze v2, then measure:

| Arm | Role |
| --- | ---- |
| **AgentDojo full matrix** (gpt-4o-mini, same protocol) | In-sample remeasure — report with CIs, util±attack, Slack ASR callout |
| **Scripted multi-attack board** (`clawql_default` / product gate) | Out-of-sample — defaults must still pass benign expect-match + block exfil |
| **A second injection benchmark** (not used for this tune; e.g. counterfeit-policy cell or peer inject drill already in-repo) | Out-of-sample — if only AgentDojo improves, say so |

Internal-only estimates (path-continuation counterfactuals) stay in `agentdojo-park-vs-hard-counterfactual.json` — **not** on the public page. The remeasure settles utility and ASR; until then those figures are not results.

## Publish sequence (next)

1. Keep v1 table as official until v2 CI finishes.
2. Publish v1 ‖ v2 tables + this diff.
3. Call out Slack ASR delta and out-of-sample scripted/second-benchmark outcomes.
4. Honest framing: what we got wrong (over-broad fail-closed), what we changed, what still costs.
