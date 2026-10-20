# Injection defenses — research → ClawQL action items

Goal: improve **security posture** (product + AgentDojo arm), not chase paper leaderboards.
Peers cited as **related work** unless we re-run same model/harness. Our locked board: [AGENTDOJO.md](./AGENTDOJO.md) (v1 ‖ v2).

**Sticky:** Score by Pareto distance to `(ASR≈0, util≈undefended)` under a locked harness — then ask which mechanism from the literature closes the remaining gap without returning to fail-closed-all.

---

## Where we are (anchors)

| Arm | Pair-ASR (none → clawql) | Task-weighted util_clean (approx) | Watchpoint |
| --- | ---: | ---: | --- |
| v1 fail-closed-all | 0.30 → 0.064 | ~0.37 | Util collapse 3/4 suites |
| v2 allow/park/hard | 0.29 → 0.107 | ~0.61 (~80% of none) | **Slack ASR 0.40** |

Frontier papers (gpt-4o-mini family, different harnesses): CaMeL ~0% ASR / ~48% util; SecAlign / AuthGraph / AgentArmor / Progent typically **≤3% ASR** with **~64–76%** util. Soft mid: Repeat Prompt ~11% ASR. We sit **mid-pack**: better than none, short of the ≤3% club, Slack is the honesty check.

---

## What the literature agrees on

Synthesized from:

- [CaMeL](https://arxiv.org/abs/2503.18813) — extract control/data flow from the *trusted* query; capabilities prevent unauthorized exfil
- [Progent](https://arxiv.org/abs/2504.11703) — symbolic privilege policies over tools/args; **monotonic confinement** (auto-narrow, expand needs approval)
- [DRIFT](https://github.com/SaFoLab-WISC/DRIFT) (NeurIPS 2025) — secure planner + dynamic validator + **injection isolator** on memory stream
- [AgentArmor](https://arxiv.org/abs/2508.01249) — runtime graph / program analysis on the agent trace
- [AuthGraph](https://arxiv.org/html/2605.26497) — dual-graph provenance + authorization
- [Design patterns](https://arxiv.org/abs/2506.08837) — action-selector, plan-then-execute, dual-LLM / map-reduce, code-then-execute, context-minimization
- [OWASP LLM Prompt Injection Prevention](https://cheatsheetseries.owasp.org/cheatsheets/LLM_Prompt_Injection_Prevention_Cheat_Sheet.html) — enforce at the **tool boundary**; labels/prompts are not a security boundary; HITL for consequential actions
- [AgentDyn](https://arxiv.org/html/2602.03117v1) — pure static CaMeL-style plans can go to **zero utility** on open-ended tasks; need dynamic privilege

**Consensus mechanisms (ordered by how often they show up in strong results):**

1. **Out-of-band enforcement** on tool calls (not model goodwill)
2. **Least privilege / plan before untrusted data** (tool filter, Progent, plan-then-execute)
3. **Information-flow / capabilities** after untrusted reads (CaMeL, AuthGraph, our IFC)
4. **Human gate for privilege expansion** (Progent expand; our park)
5. **Memory isolation** — strip or quarantine injected instructions before reuse (DRIFT isolator; our untrusted labels + re-taint)
6. **Detectors alone** — often high FPR / util collapse; fine as a *layer*, not the core

---

## Gap analysis (ClawQL today)

| Mechanism | Product (`clawql-api`) | AgentDojo harness (`clawql_data_flow` v2) | Gap |
| --- | --- | --- | --- |
| Session IFC / taint | **On by default** (`CLAWQL_ENABLE_SESSION_IFC` unset → true) | Binary taint after untrusted read | Harness has no *argument* capabilities |
| Park destructive / privileged | Mandate park path | park sinks fail tool (no human in bench) | OK for ASR; util tax honest |
| Allow same-workspace Slack/email | Internal / same-source can pass | **`send_channel_message` / DM → allow** after taint | Matches ROADMAP `allowed_tool_exfil`; likely Slack ASR driver |
| Metadata / body labels | Stamp untrusted on memory | Metadata only (no body prefix) | Audit ≠ stop |
| Plan / privilege policy from user task | Partial (program IFC, risk) | None | Progent/DRIFT/tool_filter missing |
| Injection isolator on tool→memory | Labels + re-taint on recall | N/A in harness | DRIFT-style strip not shipped |
| Dual-LLM / quarantine model | Not a stock path | N/A | Design-pattern upside for summarization |

---

## Ranked action items

Success metric for every item: **Slack ASR → pooled ASR → util_without_attack → OOS** (locked readout). Do not publish a “win” without that order.

### P0 — highest posture ROI (do next)

| ID | Action | Research anchor | ClawQL surface | Effort | Risk | Done when |
| --- | --- | --- | --- | --- | --- | --- |
| **A1** | **Slack autopsy before rule change** — dump v2 failing `security()` pairs; confirm % that succeed via `send_channel_message` / `send_direct_message` with attacker-chosen body/dest | OWASP tool boundary; ROADMAP `allowed_tool_exfil` | CI artifacts / local re-run with traces | S | Low | Histogram: sink × security goal for Slack ASR |
| **A2** | **Capability gate on allowed messaging** — after taint, allow Slack/email only if destination ∈ *trusted plan* (user-named channel/recipient) **or** same-source reply; else **park** (not free allow) | CaMeL capabilities; AuthGraph; design-pattern plan-then-execute | `clawql_tools_executor.py` + product `classifyOutboundDestination` / IFC allow-list | M | Util dip on Slack/travel | Slack ASR ≤ v1 (≤0.30) with util_clean ≥ v2 Slack − 0.10 |
| **A3** | **Ship / measure `allowed_tool_exfil` cell** on the security suite with stock defaults | Design patterns + our ROADMAP #3 | `docs/benchmarks/security-suite/` board | M | Reveals product gap | Published JSON with defaults vs best-config |
| **A4** | **Finish InjecAgent held-out arm** (protocol already frozen) | AgentDojo multi-attack diversity; avoid single-attack overfitting | [INJECAGENT.md](./INJECAGENT.md) | M | May look worse than important_instructions | Scores published; no claim of OOS win until then |

### P1 — structural upgrades (research-aligned)

| ID | Action | Research anchor | ClawQL surface | Effort | Risk | Done when |
| --- | --- | --- | --- | --- | --- | --- |
| **B1** | **Trusted-query tool privilege set** — before first untrusted read, derive allowed sinks/args from the user task; auto-narrow OK; **expand → park** | Progent monotonic confinement; AgentDojo `tool_filter` | New policy layer on execute / program | L | Over-narrow → util | Pooled ASR ↓ without Slack util &lt; 0.45 |
| **B2** | **Injection isolator** — before `memory_ingest` / session memory append, strip or quarantine instruction-like spans that conflict with the user query; keep audit label | DRIFT Injection Isolator | `native-tool-gate` + memory path | M | FP strips benign text | Persistent-injection board + AgentDojo util under attack ↑ or stable |
| **B3** | **Argument provenance / no silent exfil** — tainted session cannot pass vault/secret-bearing args into allowlisted notify/Slack even if dest is “internal” | CaMeL capabilities; ROADMAP secret + exfil cells | IFC dest×data labels | M | False parks | `secret_visibility` + exfil cells green on defaults |
| **B4** | **Plan deviation validator** — if tool call not in initial plan and not a pure read, require park | DRIFT Dynamic Validator; plan-then-execute | Program / agent loop host | L | Open-ended AgentDyn-style util hit | Document util tax; optional mode not stock if open-ended agents break |

### P2 — longer horizon / optional layers

| ID | Action | Research anchor | Notes |
| --- | --- | --- | --- |
| **C1** | Dual-LLM / quarantine path for untrusted summarization | Design patterns § dual-LLM / map-reduce | Privileged LLM never sees raw untrusted text; only typed results |
| **C2** | Code-then-execute / CaMeL-style programs for high-assurance tenants | CaMeL; code-then-execute | Offer as **strict mode**, not only default (AgentDyn util warning) |
| **C3** | Runtime authorization graph over traces | AgentArmor / AuthGraph | Build on session labels + WORM audit; expensive — measure latency |
| **C4** | Detector layer (PromptArmor / PI classifier) as **advisory** | AgentDojo transformers_pi_detector | Never sole control; track FPR on util_clean |
| **C5** | Adaptive / multi-turn attack arm beyond `important_instructions` | AgentDojo extensibility; OWASP multi-turn | Prevents overfitting to one attack string |

### Explicitly deprioritize

| Idea | Why not first |
| --- | --- |
| Body-prefix trust tags in AgentDojo | Confounds util graders; we already chose metadata labels |
| Return to fail-closed-all as headline default | v1 util ~0.37 is the embarrassing regime |
| Claim CaMeL/SecAlign parity from absolute % | Different harness / none baselines |
| Detector-only defense | Literature shows util cliffs and residual ASR |

---

## Recommended sequence (next 3 moves)

1. **A1 Slack autopsy** → decide exact A2 predicate (trusted dest vs park-all-messaging).
2. **A2 + A4 in parallel** — tighten messaging capability; land InjecAgent scores.
3. **B1 privilege set** once A2’s util tax is known — avoid stacking two util hits blind.

---

## Evaluation rubric (unchanged honesty gates)

1. Bootstrap CIs over pairs  
2. Util without **and** under attack as prominent as ASR  
3. CaMeL / SecAlign / Progent / AgentArmor = related work until same-model same-harness  
4. Empirical vocabulary — not “provable”  
5. Readout order: Slack ASR → util_clean → OOS  

---

## Sources (quick)

| Source | Link |
| --- | --- |
| AgentDojo results | https://agentdojo.spylab.ai/results/ |
| SOTA2 AgentDojo defense table | https://www.sota2.com/research/sota/agentic-security-and-utility-evaluation-on-agentdojo |
| CaMeL | https://arxiv.org/abs/2503.18813 |
| Progent | https://arxiv.org/abs/2504.11703 |
| DRIFT | https://proceedings.neurips.cc/paper_files/paper/2025/file/77f3b26c7907aa27b207df9b9d43f29a-Paper-Conference.pdf |
| AgentArmor | https://arxiv.org/abs/2508.01249 |
| Design patterns | https://arxiv.org/abs/2506.08837 |
| OWASP cheat sheet | https://cheatsheetseries.owasp.org/cheatsheets/LLM_Prompt_Injection_Prevention_Cheat_Sheet.html |
| AgentDyn | https://arxiv.org/html/2602.03117v1 |
