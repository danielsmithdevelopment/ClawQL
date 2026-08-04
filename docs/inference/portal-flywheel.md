# PorTAL and the Intelligence Flywheel

**Status:** Intention / design commitment (implementation staged)  
**Related:** [clawql-inference](./clawql-inference.md) · [Token efficiency Layer 12](../architecture/clawql-token-efficiency.md) · [OKF v0.2](../memory/okf.md) · [Convergence Week](https://pragmaticvectors.com/posts/convergence-week/)

ClawQL intends to integrate [**PorTAL**](https://github.com/ramp-public/portallib) (Portable Task-specific Adapter Learning, Ramp Labs) into the **Intelligence Flywheel** (Layer 12 of the twelve-layer token-efficiency stack). This document records what that means operationally — what stays the same, what changes, and what ships when.

---

## Problem PorTAL solves

Fine-tuned adapters today are locked to a base model. When a better base ships (Qwen3.6 → Qwen3.7, new Phi, new Anthropic mid-tier), teams retrain from scratch: same corpus, full training cost, full evaluation.

PorTAL decomposes the adapter into:

1. **Task-latent representation** — expensive, trained once from verified production traces; encodes organizational reasoning patterns independent of base weights.
2. **Per-base alignment** — thin, cheap transform that maps the task-latent into a specific base model’s weight space.

The result is a **standard PEFT LoRA** that loads into Hugging Face / PEFT / vLLM with no special serving path.

---

## How it composes with ClawQL

The Flywheel today:

```
Production traffic
  → WORM-logged call store
  → Verdict-filtered export (JSONL)
  → Presidio PII scrub + WORM dataset manifest
  → Fine-tuning job (OpenAI / Anthropic / local QLoRA)
  → Custom model registered in tier-map.json (Frugal)
  → PAL routing prefers the custom model for matching tasks
```

**With PorTAL (intended):**

```
… same export + scrub + WORM provenance …
  → PorTAL train: task_latent.pt (+ alignment_*.lora for current base)
  → adapter_manifest.cqm (Merkle root + vault commit + Presidio version)
  → Register LoRA-backed Frugal/Standard aliases in tier-map.json
  → When a new base ships: clawql inference finetune refit (alignment only)
```

### What does **not** change

| Layer                         | Unchanged? |
| ----------------------------- | ---------- |
| Gateway / PAL routing (TS)    | Yes        |
| vLLM / PEFT serving           | Yes — standard LoRA load |
| WORM audit for inference      | Yes — richer, not replaced |
| OKF vault as training source  | Yes — gains v0.2 filters   |

PorTAL is a **Python training/export** concern. ClawQL’s TypeScript gateway continues to route to models that already have LoRAs mounted. No new serving infrastructure.

### What changes

| Surface                         | Intention                                                                 |
| ------------------------------- | ------------------------------------------------------------------------- |
| `clawql inference export`       | New `--format portal-bundle` artifact set                                 |
| Export filters                  | `--okf-verified human` / `--okf-status current` (OKF v0.2)                |
| `clawql inference finetune`     | New `refit` subcommand for alignment-only updates                         |
| Tier map                        | Optional metadata: which task types have trained adapters                 |
| WORM                            | Manifest covers task-latent + alignment digests                           |

---

## Planned CLI shapes

### Export a PorTAL bundle

```bash
clawql inference export \
  --verdict passed \
  --okf-verified human \
  --okf-status current \
  --vault-ref "$(git -C ~/.ClawQL/vault rev-parse HEAD 2>/dev/null || true)" \
  --format portal-bundle \
  --output ./adapters/clawql-legal-v1/
```

**Expected artifacts:**

| File                   | Role                                              |
| ---------------------- | ------------------------------------------------- |
| `task_latent.pt`       | Portable task representation (train once)         |
| `alignment_<base>.lora`| PEFT LoRA for the current base                    |
| `adapter_manifest.cqm` | ClawQL manifest: WORM hashes, filters, Merkle root |

### Refit when a new base ships

```bash
clawql inference finetune refit \
  --bundle ./adapters/clawql-legal-v1/task_latent.pt \
  --target-model qwen/qwen3.7-27b \
  --output ./adapters/clawql-legal-v1-qwen37/
```

Minutes, not a full retrain. No new export pipeline.

---

## Honest trade-offs (committed)

1. **Python toolchain for train/refit** — export will invoke PorTAL transparently; serving stays TypeScript + vLLM.
2. **Accuracy lifts are domain-dependent** — Ramp’s 10–19pt numbers are on their task mix; ClawQL expects structural portability benefits even when magnitude differs (docs, legal, IDP, code).
3. **Start the Flywheel now** — verified OKF v0.2 + verdict-passed traces become more valuable once PorTAL lands; waiting wastes corpus that could already be portable.

---

## Implementation stages

| Stage | Deliverable                                                                 | Status      |
| ----- | --------------------------------------------------------------------------- | ----------- |
| **A** | OKF v0.2 trust signals on vault notes + recall filters                      | **Shipped** (this PR) |
| **B** | Export filter flags `--okf-verified` / `--okf-status`                       | Next        |
| **C** | `--format portal-bundle` + Python PorTAL invoke + `adapter_manifest.cqm`    | Next        |
| **D** | `finetune refit` + tier-map adapter metadata for PAL                        | Next        |
| **E** | Docs site sync + getting-started “start the Flywheel for PorTAL” runbook    | With C/D    |

Reserve the export format name in TypeScript now so CLI/docs do not thrash:

```ts
// packages/clawql-inference — ExportFormat (staged)
export type ExportFormat =
  | "openai-jsonl"
  | "anthropic-jsonl"
  | "raw-jsonl"
  | "sharegpt"
  | "portal-bundle"; // PorTAL task-latent + alignment bundle (staged)
```

---

## See also

- Ramp PorTAL: https://github.com/ramp-public/portallib
- Inference reference: [clawql-inference.md](./clawql-inference.md)
- Token efficiency Layer 12: [clawql-token-efficiency.md](../architecture/clawql-token-efficiency.md)
- Memory trust signals: [okf.md](../memory/okf.md)
