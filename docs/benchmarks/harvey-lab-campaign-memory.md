---
title: "Harvey LAB — Campaign Memory, Promotion Gates & Constitutional Ouroboros"
status: "Draft · August 2026"
depends_on: "Harvey LAB pause handoff · clawql-ouroboros Wonder/Reflect · Legal domain + structured filters · Training pipeline v0.1"
inspired_by: "zsec.uk ‘Bullying LLMs’ (validation/knowledge-loop patterns — not adversarial operator tone)"
---

# Harvey LAB — Campaign Memory, Promotion Gates & Constitutional Ouroboros

**August 2026 · Draft**

**Related:** [pause handoff](./harvey-lab-pause-handoff.md) · [ClawQL results ledger](./harvey-lab-clawql-results.md) · [B-7 amortized](./openbench-b7-calderwood.md) · [Ouroboros](../ouroboros/clawql-ouroboros.md) · [Training pipeline](../inference/clawql-inference-training-pipeline.md) · [Memory Finds. Ontology Decides.](https://pragmaticvectors.com/posts/memory-finds-ontology-decides/)

This note locks three adapter/action-plan gaps that sit between OpenBench mechanism wins and a credible Harvey LAB sweep — plus how **Constitutional Ouroboros** (not operator “bullying”) supplies the search-termination signal Harvey’s paper called out.

---

## 1. Two flywheels (do not conflate)

| Loop                                  | When it learns                                        | What improves                                        |
| ------------------------------------- | ----------------------------------------------------- | ---------------------------------------------------- |
| **Campaign memory (in-sweep)**        | During one LAB family run (task 3 → task 7 → task 21) | How _this_ Opus+ClawQL sweep navigates C&H structure |
| **Training flywheel (between-sweep)** | After promoted traces land → SFT/DPO/GRPO/SPIN        | The next model / adapter via `tier-map.json`         |

B-7.3 proved amortized understanding _inside a session_. Campaign memory applies the same claim to the **LAB sweep itself**: the agent that finished 20 firm-knowledge tasks should be better at task 21 than at task 1, because structural knowledge about the corpus accumulated — without waiting for a fine-tune.

---

## 2. Campaign memory vs task vault isolation

**Tension:** Today’s adapter deletes/recreates a **task-scoped vault** between tasks (isolation tests, no cross-task answer leakage). Naïve “one persistent vault for everything” would break that guarantee and risk criterion leakage across tasks.

**Split the stores:**

| Store              | Lifetime                            | Contents                                                                                                      | Forbidden                                                                    |
| ------------------ | ----------------------------------- | ------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| **Task vault**     | Per task; delete/recreate           | Priority DMS docs for _this_ task; ephemeral working notes                                                    | Prior tasks’ answers / matter ID lists for other tasks                       |
| **Campaign layer** | Per family sweep (`firm-knowledge`) | Corpus _structure_ lessons, demoted strategy patterns, preferred filter shapes, field-name aliases discovered | Ground-truth answers, rubric criterion text solutions, per-task deliverables |

Campaign layer locations (intended):

```
$CLAWQL_LAB_CAMPAIGN_HOME/firm-knowledge/
  campaign.md                 # running structural summary (OKF)
  demotions.jsonl             # failed strategies → prompt extensions
  system-prompt.ext.md        # appended to static clawql_system_prompt.md
  ontology-hints/             # optional: field aliases, filter templates
```

**Fairness note:** Campaign memory is a **ClawQL-arm product advantage** (like B-7.3 amortization), not a harness confound. Baseline arm does not receive it. Both arms still see the same task DMS corpus for the active task.

**Env (proposed):**

```bash
CLAWQL_LAB_CAMPAIGN_MEMORY=1
CLAWQL_LAB_CAMPAIGN_HOME=…/campaigns
# Task vault isolation remains default ON
CLAWQL_LAB_TASK_VAULT_ISOLATION=1
```

---

## 3. Promotion gates (guilty until proven)

Borrow the _discipline_ of a hallucination→findings pipeline without adversarial operator tone. Every ClawQL-arm run starts **unpromoted**. Promotion requires:

| Gate  | Check                                                                                                                |
| ----- | -------------------------------------------------------------------------------------------------------------------- |
| **0** | Deliverable parses / artifact present                                                                                |
| **1** | Harvey rubric criteria evaluated by the **judge** (not agent self-report)                                            |
| **2** | Tool evidence supports claims — prefer `clawql_memory_recall` with `schema` + `filters` when enumeration is required |
| **3** | Fair context — same model both arms; task vault isolation held; no campaign leakage of answers                       |

Only **promoted** traces enter DPO/GRPO datasets or “winning strategy” campaign notes. Demotions write a short failure pattern into `demotions.jsonl` (see §4).

This is standards enforcement — the rubric and grader do the hard work, not human bullying.

---

## 4. Dynamic system-prompt extension (critique → revision on the prompt)

Today [`clawql_system_prompt.md`](../../integrations/harvey-labs/harness/adapters/clawql_system_prompt.md) is **static** for every firm-knowledge task.

After each demotion, append a **principle note** to `system-prompt.ext.md`, for example:

> Semantic-only recall on escrow-style enumeration produced false positives — prefer `schema` + `filters` with numeric predicates.

Next tasks in the same family load: **static base + campaign extension**. That is Constitutional AI’s critique→revision applied to the **system prompt**, not only to the in-trace reasoning chain.

Rules:

- Extensions are **strategy** notes, not answers
- Cap size (e.g. last N demotions or token budget) to avoid prompt bloat
- Never copy another task’s matter IDs or criterion solutions into the extension

---

## 5. Metric: cost per promoted CPR point

Action-plan tracking today is oriented around **cost per run**. The unit that should drive which experiments continue:

\[
\text{cost per promoted CPR point} = \frac{\text{USD spent (inference + judge)}}{\Delta\text{CPR on promoted traces only}}
\]

Implications:

- A \$3 run that promotes +2 criteria beats a \$1 run that promotes nothing
- Ledger columns should include: spend, criteria gained (promoted), \$ / promoted CPR point, task family, model, campaign-memory on/off
- Rank task families and model configs by this metric before burning full Opus × 250

Wire into [`harvey-lab-clawql-results.md`](./harvey-lab-clawql-results.md) (template section below lands with this PR).

---

## 6. Constitutional Ouroboros (runtime self-critique)

**Reject:** external “bullying” loops without a stable standard.  
**Prefer:** Ouroboros Seed with written principles → execute → evaluate → **Wonder** → **Reflect** → next generation, capped by convergence / drift / max gens.

### Constitution for firm-knowledge (Seed `evaluation_principles`)

Harvey’s rubric criteria **are** the constitution. In addition, bake the published failure mode into the Seed:

1. **Prefer completeness over premature stop.** Do not claim set closure without exhaustive tool evidence.
2. **Prefer structured recall** (`schema` + `filters`) over semantic near-misses for enumeration.
3. **Every claimed criterion needs evidence** (tool result or cited document path).
4. **Unattempted criteria are open work** — list them explicitly before finishing.

### Wonder must check confident incompleteness

After each generation, Wonder asks (explicitly):

- Did I claim set closure?
- Do I have tool evidence for every criterion I claim to have met?
- Are there criteria I have not attempted?

Violations → Wonder note → Reflect revises search strategy (Seed patch) → another generation. Satisfaction + grader pass → promotable trace.

Nobody bullies the agent. The **rubric + principles** hold the bar. Wonder/Reflect is the search-termination / continue signal Harvey said was missing.

### Relationship to training Constitutional AI

| Layer                        | Mechanism                                                                    |
| ---------------------------- | ---------------------------------------------------------------------------- |
| **Runtime (this doc)**       | Ouroboros Wonder/Reflect against Seed principles during LAB / agent sessions |
| **Training (pipeline §2.7)** | Critique–revision pairs after DPO/GRPO for durable metacognition in weights  |

Same philosophy; different timescale.

---

## 7. Implementation sketch (adapter)

1. Keep task vault create/destroy in `start-clawql-for-lab.sh` / adapter cleanup.
2. Add campaign home init once per family sweep in `run-lab-gha.sh`.
3. After judge: promote or demote; on demote, append strategy note to `system-prompt.ext.md`.
4. Prepend/append extension when building ClawQL arm messages (do not change baseline prompt).
5. Optional: wrap multi-gen firm-knowledge attempts with `EvolutionaryLoop` + firm-knowledge Seed principles when `CLAWQL_LAB_OUROBOROS=1`.
6. Emit spend + promoted ΔCPR into scorecard JSON for the ledger.

**Out of scope for Phase A:** full Ouroboros wiring. Phase A remains single-task Sonnet smoke. Campaign memory + prompt extension can land in Phases B–D; cost-per-promoted-CPR columns land as soon as any scored runs exist.

---

## 8. Decision summary

| Topic                   | Decision                                                       |
| ----------------------- | -------------------------------------------------------------- |
| Operator bullying       | **No** — prefer constitutional standards                       |
| In-sweep learning       | **Yes** — campaign layer separate from task vault              |
| Task vault isolation    | **Remains on** for task DMS / answers                          |
| Prompt                  | Static base + **campaign extension** from demotions            |
| Primary economic metric | **\$ / promoted CPR point**                                    |
| Harvey failure mode     | Seed principle + Wonder check for **confident incompleteness** |
| Training flywheel       | Unchanged — between-sweep; uses promoted traces only           |

---

_Companion to Harvey LAB × ClawQL Action Plan · OpenBench B-7.3 amortization · clawql-ouroboros Wonder/Reflect · Training Pipeline Constitutional AI_
