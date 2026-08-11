---
title: "clawql-inference Training Pipeline — Specification v0.1"
status: "Draft · August 2026"
package: "packages/clawql-inference/src/training/"
depends_on: "clawql-inference (gateway, PAL routing, virtual keys) · clawql-streams (RTP/OBT traces) · OpenBench (evaluation) · Harvey LAB (Tier 1 evaluator)"
---

# clawql-inference Training Pipeline — Specification v0.1

**August 2026 · Draft**

**Related:** [clawql-inference](./clawql-inference.md) · [PorTAL flywheel](./portal-flywheel.md) · [Harvey LAB pause handoff](../benchmarks/harvey-lab-pause-handoff.md) · [OpenBench B-7](../benchmarks/openbench-b7-calderwood.md) · TypeScript scaffold: [`packages/clawql-inference/src/training/`](../../packages/clawql-inference/src/training/)

> **Harvey LAB (Aug 2026):** Do **not** block the first publishable LAB ledger on this fine-tune flywheel. Arm C uses **Nemotron 3.5 Lightning** (already LAB post-trained by NVIDIA/Trajectory to 8.3% all-pass) **+ ClawQL retrieval**. Run training rounds after Opus A/B (+ Arm C) scores exist, or for domains without a specialized base model.
---

## 1. What This Is

The training pipeline is the fine-tuning layer inside `clawql-inference`. It closes the Intelligence Flywheel: agent sessions produce RTP/OBT traces → traces are filtered and formatted by training method → fine-tune runs on GPU → adapter registered in `tier-map.json` → PAL routing sends future sessions to the improved model → better sessions → better traces.

The pipeline supports every viable fine-tuning method: SFT, QLoRA, LoRA, DPO and its variants (IPO, KTO, ORPO), GRPO, RLHF, Constitutional AI, and SPIN. Each method has specific data requirements. The pipeline handles format conversion, quality filtering, training job scheduling via Argo Workflows, and adapter promotion after evaluation.

---

## 2. Why Each Method — and When to Use It

### 2.1 SFT (Supervised Fine-Tuning)

**What it is:** Train on (prompt, response) pairs via next-token prediction. The model learns to imitate good behavior.

**When to use it:** First pass on a new domain. You have passing traces and want the model to learn the basic task pattern before applying preference methods.

**For Harvey LAB:** Train on traces where `allPass: true` or `criterionPassRate >= 0.9`. Model learns the search-then-synthesize pattern for firm-knowledge tasks.

**Risk:** Trains on everything including suboptimal reasoning paths within a good trace. A trace that found all 5 matters but took 13 turns when 2 were sufficient teaches the 13-turn pattern.

**Data shape:**

```
{ "prompt": "<system + task instruction>", "response": "<agent turn sequence>" }
```

### 2.2 QLoRA (default single-GPU method)

**What it is:** LoRA (low-rank adapter training) + 4-bit NF4 quantization of the frozen base + paged optimizers. Trains 0.1-1% of parameters. Fine-tunes 70B models on a single 80GB H100.

**When to use it:** Default for all fine-tuning on the 5090. All other methods (DPO, GRPO, etc.) use QLoRA as the parameter update mechanism. The method choice (DPO, GRPO, etc.) determines what the training signal is. QLoRA determines how the weights are updated.

**Tooling:** Unsloth (fastest QLoRA implementation), TRL for DPO/GRPO/PPO trainers on top.

### 2.3 LoRA (multi-GPU)

**What it is:** Same as QLoRA but without quantization. Faster per-step, requires more VRAM. Use when multiple GPUs are available and throughput matters more than memory efficiency.

**When to use it:** When you have access to multi-GPU infrastructure and want faster training. Single-GPU default stays QLoRA.

### 2.4 DPO (Direct Preference Optimization) — primary preference method

**What it is:** Train on (prompt, chosen, rejected) triplets. Model learns to increase probability of chosen and decrease probability of rejected without a separate reward model.

**When to use it:** You have paired traces where the same task was attempted with different outcomes. Harvey LAB + ClawQL produces these naturally: ClawQL-on passing trace vs ClawQL-off failing trace on the same task = perfect chosen/rejected pair.

**For Harvey LAB:**

```
Prompt: firm-knowledge task instruction + matter documents
Chosen: ClawQL trace that passed all criteria (criterionPassRate: 1.0)
Rejected: baseline trace that failed (criterionPassRate: 0.4)
```

The model learns: on institutional knowledge tasks, use structured recall rather than sequential document reads.

**Critical constraint:** Chosen and rejected responses must be comparable in structure — similar length, similar tool-use pattern, different outcome. Don't pair a 3-turn ClawQL trace against a 30-turn baseline hallucination — the model learns length preference, not reasoning preference. Pair traces with similar turn counts where the difference is retrieval strategy.

**DPO variants:**

| Variant  | When to use                                                                                                                                                                          |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **IPO**  | More conservative than DPO; less prone to overfitting on small datasets. Use when you have fewer than 500 paired examples.                                                           |
| **KTO**  | Individual good/bad labels without pairs. Use when many individually scored traces lack clean chosen/rejected counterparts — Harvey rubric scores each trace without needing a pair. |
| **ORPO** | Combines SFT and DPO in one pass. Use for first-pass training + preference alignment without separate stages.                                                                        |

### 2.5 GRPO (Group Relative Policy Optimization) — best for Harvey LAB

**What it is:** DeepSeek-R1's method. Samples N rollouts for each prompt, scores each with a verifiable reward function, trains on group-relative advantage (no separate critic or value model needed).

**When to use it:** Your reward is automatically verifiable — no human rater, no judge model needed for every example. Harvey LAB's per-criterion scores are exactly this.

**For Harvey LAB the reward function is:**

```python
def harvey_lab_reward(rollout: str, task: HarveyTask) -> float:
    criteria_passed = evaluate_against_rubric(rollout, task.criteria)

    precision = criteria_passed / criteria_attempted if criteria_attempted > 0 else 0
    recall = criteria_passed / len(task.criteria)
    f1 = (2 * precision * recall) / (precision + recall) if (precision + recall) > 0 else 0

    used_structured_recall = "clawql_memory_recall" in rollout and "schema" in rollout
    all_pass = criteria_passed == len(task.criteria)

    return f1 + (0.1 if used_structured_recall else 0) + (0.2 if all_pass else 0)
```

**Why GRPO is the strongest method for this domain:** The reward (Harvey rubric criteria) fires on the final outcome and is deterministic. The model figures out the reasoning path that gets there — you don't have to specify it. After GRPO on Harvey traces, the model should learn to reach for `clawql_memory_recall` with structured filters on institutional knowledge tasks because that's the path that consistently produces higher rubric scores.

**Requires:** vLLM rollout server during training (for generating N completions per prompt). 2-3x VRAM of SFT. Practical on A100/H100 with QLoRA.

### 2.6 RLHF (Reward Model + PPO)

**What it is:** Three stages — SFT base → train reward model on human preferences → PPO against reward model.

**When to use it:** When your reward signal is subjective and hard to reduce to pairs or automatic scores. For Harvey LAB specifically, the rubric gives you automatic scoring so RLHF's complexity is not justified over DPO or GRPO.

**For ClawQL:** Most useful for tasks where legal quality is subjective — memo style, argument strength, client communication tone. Not the right choice for firm-knowledge enumeration tasks where correctness is binary.

**Implementation note:** If you train a reward model on Harvey rubric pass/fail pairs, that reward model becomes reusable across legal tasks. The investment pays off at scale.

### 2.7 Constitutional AI

**What it is:** Model critiques its own outputs, generates revised versions, trains on (original, critique, revision) sequences. Teaches the model to reason about quality of its own work.

**For Harvey LAB:** Model generates a search strategy → critiques it ("I only searched by escrow flag, I should also check non-compete field") → generates revised strategy → trains on the revision. Teaches meta-cognitive awareness of search completeness — directly addressing Harvey's published failure mode.

**When to use it:** After DPO/GRPO establishes the basic task pattern. Constitutional AI adds a layer of self-monitoring that makes the model aware of when it should search further vs when it can stop. That's the search termination signal Harvey identified as missing.

### 2.8 SPIN (Self-Play Fine-Tuning)

**What it is:** The model plays against an earlier version of itself. Current model generates responses, previous model generates responses to the same prompts, DPO trains current model to beat previous one. Iterative — each round's current model becomes next round's previous model.

**For Harvey LAB flywheel:**

- Round 1 model (base + initial SFT) vs Round 2 model (after DPO on LAB traces) = automatic DPO pairs
- Round 2 model vs Round 3 model (after GRPO) = automatic DPO pairs
- Each round the dataset expands and the model improves against its prior self

**When to use it:** After you have two generations of models from the Harvey LAB flywheel. The flywheel generates SPIN pairs automatically.

### 2.9 Adversarial filtering

**What it is:** Generate many candidate traces, use a discriminator to filter out traces that look like a weak model produced them, train only on traces that pass. Keeps training data distribution sharp.

**For Harvey LAB:** Filter out traces where the agent guessed correctly but didn't use structured recall — these teach the wrong retrieval pattern even if the answer was right. Keep only traces where correct answers came from verified tool usage (`clawql_memory_recall` with schema + filters in the tool_use blocks).

---

## 3. Package Structure

```
packages/clawql-inference/
  src/
    gateway/            — existing (PAL routing, virtual keys, tracing)
    training/           — new (scaffold landed with this spec)
      pipeline.ts       — orchestrates training runs end to end
      methods/
        sft.ts          — SFT via Unsloth/TRL
        dpo.ts          — DPO + IPO + KTO + ORPO variants
        grpo.ts         — GRPO with vLLM rollout server
        rlhf.ts         — reward model training + PPO
        constitutional.ts — critique-revision pipeline
        spin.ts         — self-play iterative DPO
      adapters/
        qlora.ts        — QLoRA config (default)
        lora.ts         — LoRA config (multi-GPU)
        full.ts         — full fine-tune config
      data/
        collector.ts    — pull traces from R2/S3 bucket by method requirements
        formatter.ts    — format OBT traces into method-specific datasets
        filter.ts       — quality filtering (completeness, tool evidence, pair balance)
        augmentor.ts    — Constitutional AI critique generation
      rewards/
        harvey.ts       — Harvey LAB rubric reward function
        matters_found.ts — B-7 completeness reward
        composite.ts    — combine multiple reward signals
      registry.ts       — model registry (base → adapter versions)
      scheduler.ts      — Argo Workflows job scheduling
      evaluator.ts      — run OpenBench eval after training, gate promotion
```

Existing provider fine-tune jobs (`src/finetune/`) remain for OpenAI/Anthropic API fine-tunes. This pipeline covers **local / Argo GPU** methods and domain-adapter promotion into `tier-map.json`.

---

## 4. Training Configuration Interface

```typescript
interface TrainingConfig {
  runId: string;
  description: string;

  baseModel: string; // "qwen3.6-27b" | "llama-3-70b" | custom
  adapterMethod: "qlora" | "lora" | "full";
  loraRank?: number; // default 16
  loraAlpha?: number; // default 32
  loraTargetModules?: string[]; // default: ["q_proj", "v_proj"]

  method: TrainingMethod;

  dataSource: {
    bucket: string;
    prefix?: string;
    filter: TraceFilter;
    splitRatio: number; // default 0.9
    maxSamples?: number;
  };

  gpuConfig: {
    gpuType: "h100" | "a100" | "rtx5090" | "auto";
    gpuCount: number;
    vramBudgetGB?: number;
  };

  hyperparams: {
    epochs: number;
    batchSize: number;
    gradientAccumulationSteps: number;
    learningRate: number;
    warmupSteps?: number;
    maxSeqLen: number;
    packSequences: boolean;
  };

  outputPath: string;
  pushToHub?: string;

  evalAfterTraining: boolean;
  evalBenchmark: "openbench-b7" | "harvey-lab-firm-knowledge" | "none";
  evalPassThreshold: number;

  autoPromote: boolean;
  domain: string; // "legal" | "lending" | "general"
  adapterVersion: string;
}

type TrainingMethod =
  | { type: "sft" }
  | { type: "dpo"; variant: "standard" | "ipo" | "kto" | "orpo"; beta: number }
  | {
      type: "grpo";
      rewardFunctions: RewardFunction[];
      numRollouts: number;
      rolloutServer: string;
      rolloutModel: string;
    }
  | { type: "rlhf"; rewardModelPath?: string; ppoEpochs: number }
  | {
      type: "constitutional";
      critiquePrompt: string;
      revisionPrompt: string;
      principleSet: string[];
    }
  | { type: "spin"; previousModelPath: string; spinRound: number };

interface TraceFilter {
  minCriterionPassRate?: number;
  maxCriterionPassRate?: number;
  requireAllPass?: boolean;
  requireToolEvidence?: string[];
  minTurns?: number;
  maxTurns?: number;
  benchmarkId?: string;
  domain?: string;
  taskFamily?: string;
  arm?: string;
  model?: string;
  after?: string;
  before?: string;
  requirePairs?: boolean;
  maxChosenRejectedRatio?: number; // default 2.0 — length-bias guard
}
```

Canonical TypeScript types live in [`packages/clawql-inference/src/training/types.ts`](../../packages/clawql-inference/src/training/types.ts).

---

## 5. Data Formatter

Each method needs traces formatted differently from the OBT envelope. See [`data/formatter.ts`](../../packages/clawql-inference/src/training/data/formatter.ts).

- **SFT:** passing traces only → `(prompt, response)`; optionally require tool evidence (`clawql_memory_recall`).
- **DPO / IPO / ORPO:** pair high vs low CPR for the same `task_id`; **length ratio guard** drops pairs where chosen/rejected length ratio exceeds `maxChosenRejectedRatio` (default 2.0) to prevent verbosity bias.
- **KTO:** individual good/bad labels from CPR thresholds (no pairing).
- **GRPO:** prompts + task meta only — model generates rollouts during training; reward uses Harvey criteria / ground truth.
- **Constitutional:** original → critique → revision; include only if revision scores higher.
- **SPIN:** current-round vs previous-round responses as DPO pairs on matching `task_id`.

---

## 6. Reward Functions

### 6.1 Harvey LAB rubric reward (GRPO primary)

Primary score = per-criterion F1 + all-pass bonus + structured-recall bonus − mild penalty for semantic-only recall (no schema/filters). Implementation: [`rewards/harvey.ts`](../../packages/clawql-inference/src/training/rewards/harvey.ts).

Judge model default: `claude-sonnet-4-6` (cost-efficient). Env: `CLAWQL_HARVEY_JUDGE_MODEL`.

### 6.2 B-7 `matters_found` reward

Completeness over matter IDs; **false positive → zero score** (matches B-7 grader). Bonus for structured filters (`"filters"` + `"gte"`). Implementation: [`rewards/matters_found.ts`](../../packages/clawql-inference/src/training/rewards/matters_found.ts).

### 6.3 Composite reward

Weighted sum of reward functions — e.g. Harvey 0.8 + tool-usage 0.2. Implementation: [`rewards/composite.ts`](../../packages/clawql-inference/src/training/rewards/composite.ts).

---

## 7. Training Scheduler (Argo Workflows)

Training runs as an Argo Workflow — same infrastructure family as the IDP pipeline.

DAG: **collect → format → train → evaluate → promote**

```
collect-traces  →  format-dataset  →  train (GPU)  →  evaluate  →  promote
```

Images (intended):

| Step                              | Image                                                   |
| --------------------------------- | ------------------------------------------------------- |
| collect / format / eval / promote | `ghcr.io/danielsmithdevelopment/clawql-training:latest` |
| train                             | `ghcr.io/danielsmithdevelopment/clawql-unsloth:latest`  |

Scheduler scaffold: [`scheduler.ts`](../../packages/clawql-inference/src/training/scheduler.ts) builds the workflow object; submit is gated on Argo client configuration.

---

## 8. Model Registry

On promotion, domain adapters are written under the Frugal tier in an extended `tier-map.json` shape:

```json
{
  "frugal": {
    "base": "qwen3.6-27b",
    "adapters": {
      "legal": {
        "path": "r2://clawql-models/adapters/legal-v2",
        "baseModel": "qwen3.6-27b",
        "trainedOn": {
          "benchmark": "harvey-lab-v1",
          "taskFamily": "firm-knowledge",
          "traces": 247,
          "method": "grpo+dpo",
          "rounds": 2
        },
        "evalResults": {
          "harveyLabCriterionPassRate": 0.73,
          "harveyLabAllPassRate": 0.18,
          "openbenchB71Score": 1.0,
          "openbenchB72Score": 1.0
        },
        "promotedAt": "2026-08-08T...",
        "clawqlVersion": "7.1.0",
        "manifestId": "sha256:abc123..."
      },
      "lending": null,
      "default": null
    }
  },
  "standard": { "base": "claude-sonnet-4-6", "adapters": {} },
  "frontier": { "base": "claude-opus-4-8", "adapters": {} }
}
```

PAL routing checks domain adapters before every inference call. Adapter path is an R2 URL — vLLM loads it at inference time. Today's shipped `tier-map.json` remains string aliases (`frugal: "model-id"`); the domain-adapter object form is the **target** shape for this pipeline's promote step ([`registry.ts`](../../packages/clawql-inference/src/training/registry.ts)).

---

## 9. MCP Tools

When `CLAWQL_ENABLE_TRAINING=1`:

| Tool                     | Purpose                                                                                |
| ------------------------ | -------------------------------------------------------------------------------------- |
| `training_run`           | Start fine-tune job (method, data source, base model, adapter config) as Argo Workflow |
| `training_status`        | Current step, ETA, GPU utilization by `runId`                                          |
| `training_promote`       | Manually promote adapter to `tier-map.json` after review                               |
| `training_rollback`      | Revert domain to previous adapter version                                              |
| `training_list`          | List adapters by domain with eval scores                                               |
| `training_compare`       | A/B two adapters on a benchmark (OpenBench cells)                                      |
| `training_dataset_stats` | Trace counts, quality distribution, method-specific pair counts                        |

---

## 10. The Flywheel — End to End

```
Harvey LAB sweep (Opus 4.8 + ClawQL)
         │
         ├─ RTP/OBT traces → R2 bucket
         │    ├─ Passing traces (CPR ≥ 0.9) → SFT dataset
         │    ├─ Paired (ClawQL pass vs baseline fail) → DPO chosen/rejected
         │    └─ All tasks → GRPO prompts (reward = Harvey rubric F1)
         │
         ▼
Round 1 SFT → legal adapter v1 → tier-map.json
         │
         ▼
Round 2 DPO (ClawQL vs baseline pairs) → legal-v2
         │
         ▼
Round 3 GRPO (Harvey rubric reward, 8 rollouts) → legal-v3
         │
         ▼
Next Harvey LAB sweep uses legal-v3 via PAL
         │
         ├─ Better traces → larger dataset
         ├─ SPIN: v3 vs v2 = automatic DPO pairs
         └─ Repeat
```

---

## 11. CLI

```bash
# Start a training run
clawql training run \
  --method grpo \
  --base-model qwen3.6-27b \
  --adapter-method qlora \
  --data-source r2://clawql-training-data \
  --filter '{"benchmark":"harvey-lab-v1","minCriterionPassRate":0.5}' \
  --reward harvey_lab_rubric \
  --domain legal \
  --eval-benchmark harvey-lab-firm-knowledge \
  --auto-promote

clawql training status --run-id training-abc123
clawql training list --domain legal
clawql training compare \
  --adapter-a r2://clawql-models/adapters/legal-v2 \
  --adapter-b r2://clawql-models/adapters/legal-v3 \
  --benchmark harvey-lab-firm-knowledge
clawql training promote --run-id training-abc123 --domain legal --version v3
clawql training rollback --domain legal
```

Staged relative to existing `clawql inference finetune` (provider API jobs).

---

## 12. Environment Variables

```bash
# Training pipeline
CLAWQL_ENABLE_TRAINING=1
CLAWQL_TRAINING_BUCKET=r2://clawql-training-data
CLAWQL_MODELS_BUCKET=r2://clawql-models

# GPU / compute
CLAWQL_TRAINING_GPU_TYPE=rtx5090
CLAWQL_TRAINING_GPU_COUNT=1
CLAWQL_TRAINING_VRAM_BUDGET_GB=24

# Unsloth / TRL
CLAWQL_UNSLOTH_ENABLED=1
CLAWQL_TRL_TRAINER=sft                 # sft | dpo | grpo | ppo

# vLLM rollout server (GRPO)
CLAWQL_VLLM_ENDPOINT=http://localhost:8000
CLAWQL_VLLM_MODEL=qwen3.6-27b

# Harvey LAB judge
CLAWQL_HARVEY_JUDGE_MODEL=claude-sonnet-4-6
CLAWQL_HARVEY_HARNESS_PATH=/opt/harvey-labs

# Promotion
CLAWQL_TRAINING_AUTO_PROMOTE=0
CLAWQL_TRAINING_EVAL_THRESHOLD=0.65

# Argo
CLAWQL_ARGO_NAMESPACE=clawql-training
CLAWQL_ARGO_SERVICE_ACCOUNT=clawql-training-sa
```

---

## 13. Recommended Training Sequence for Harvey LAB

**After the Harvey LAB sweep completes** (Opus two-arm ledger filled — see [pause handoff](../benchmarks/harvey-lab-pause-handoff.md)):

### Round 1 — SFT on passing ClawQL traces

- Filter: `arm=clawql`, `criterionPassRate >= 0.85`, `requireToolEvidence=["clawql_memory_recall"]`
- Goal: establish structured recall → synthesize → deliverable
- Eval: B-7.1 + subset of Harvey firm-knowledge
- Expected lift: moderate — pattern without preference signal

### Round 2 — DPO on ClawQL vs baseline pairs

- Filter: `requirePairs=true`, `benchmark=harvey-lab-v1`
- Chosen: ClawQL CPR ≥ 0.8; Rejected: baseline CPR ≤ 0.4 on same tasks
- Length ratio guard enforced
- Goal: prefer structured recall over sequential reads
- Expected lift: meaningful strategy preference

### Round 3 — GRPO with Harvey rubric reward

- Data: all firm-knowledge task prompts (GRPO generates rollouts)
- Reward: Harvey rubric F1 + structured recall bonus
- Rollouts: 8 per prompt; vLLM serving QLoRA adapter from Round 2
- Goal: maximize criterion pass rate directly
- Expected lift: largest — optimizes the metric that matters

### Round 4 — SPIN (after Round 3)

- Chosen: Round 3 traces; Rejected: Round 2 traces on same tasks
- Goal: iterative self-improvement
- Repeat until CPR improvement per round drops below 1pp

---

## 14. Implementation status

| Surface                                                  | Status                                                |
| -------------------------------------------------------- | ----------------------------------------------------- |
| This specification                                       | Draft v0.1                                            |
| Types + TraceFormatter + rewards + Argo workflow builder | Scaffold in `packages/clawql-inference/src/training/` |
| Unsloth/TRL trainers, MCP tools, live Argo submit        | Not yet                                               |
| Domain-adapter `tier-map.json` object form + PAL load    | Target; today's map is string aliases                 |
| Harvey LAB sweep → training data                         | Blocked on LAB resume (Phases A–E)                    |

---

_clawql-inference Training Pipeline · Spec v0.1 · August 2026 · Draft_  
_Companion: Harvey LAB × ClawQL Action Plan · clawql-streams RTP/OBT emission · OpenBench B-7 suite · PorTAL flywheel_
