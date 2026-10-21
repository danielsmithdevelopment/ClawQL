# InjecAgent — held-out out-of-sample arm (fixed before remeasure)

**Chosen before any v2 remeasure data:** [InjecAgent](https://github.com/uiuc-kang-lab/InjecAgent) (Zhan et al., UIUC Kang Lab) — prompt-injection benchmark for tool-using agents.  
**Role:** out-of-sample check that `clawql_agentdojo_defaults_v2` was not fitted only to AgentDojo.  
**Played no part in tuning v2.** See [AGENTDOJO-RULES-DIFF.md](./AGENTDOJO-RULES-DIFF.md).

## Protocol (locked)

| Item                       | Value                                                                                       |
| -------------------------- | ------------------------------------------------------------------------------------------- |
| Upstream                   | https://github.com/uiuc-kang-lab/InjecAgent                                                 |
| Model (federal-facing)     | `openai/gpt-4o-mini` via OpenRouter (same as AgentDojo matrix)                              |
| Arms                       | `none` (undefended) vs `clawql_data_flow` (current defaults id — v3 capability gate)          |
| AgentDojo attack name      | `injecagent` (built-in; equal-arm harness via `run_injecagent.py`)                            |
| Claim vocabulary           | empirical (not “provable”)                                                                  |
| Relation to AgentDojo tune | **none** — results interpreted only after AgentDojo Slack ASR and util_without_attack       |

## How this fits the readout order

After remeasure lands, read:

1. AgentDojo **Slack ASR**
2. AgentDojo **util without attack** (per suite, vs undefended, + CIs)
3. **This InjecAgent arm** + scripted board

If InjecAgent (and the scripted board) hold while only AgentDojo “improves,” say the refinements look AgentDojo-fitted.

## Status

- Protocol named and frozen **before** InjecAgent scores exist.
- Runner: `MAI_INJECAGENT=1 npm run benchmark:multi-attack-injection:injecagent` — runs AgentDojo `attack=injecagent` for `none` vs `clawql_data_flow` (default suite `slack`).
- Scores land in [results-injecagent.json](./results-injecagent.json) when CI/local has `OPENROUTER_API_KEY`. Until then status stays pending / skipped — **no invented ASR**.
- Do not publish InjecAgent percentages beside AgentDojo `important_instructions` as same-table peers.
