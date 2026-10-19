# Model provenance gate

**Status:** Shipped (identity gate) · Weight-origin attestation — later  
**Package:** [`clawql-inference`](../../packages/clawql-inference)

Closes the live gap where `CLAWQL_INFERENCE_DISABLE_PROVIDERS=deepseek` disabled only the DeepSeek **provider plugin**, while `clawql/cheap-chat` (historically aliased to DeepSeek) and `openrouter/deepseek/*` could still route to DeepSeek weights.

This document describes what the gate **proves** and what it does **not**. It is not a claim of federal approval or compliance certification.

## Design (five points)

1. **Resolved model, not request alias.** Policy runs after catalog alias resolution and on every fallback attempt (decorator sits inside the fallback chain).
2. **Identity table.** Known naming schemes (`deepseek/…`, `openrouter/deepseek/…`, bare upstream names) map to one canonical id + **weight vendor** (not the aggregator).
3. **Denylist (general) / allowlist fail-closed (federal).**  
   - General: deny listed vendors.  
   - `CLAWQL_INFERENCE_PROVENANCE_PROFILE=federal`: allow only known vendors/models; unknown ids fail closed.
4. **Every model call.** Same assert on chat gateway, OpenRouter decisions, and embedding HTTP calls.
5. **Compliance report honesty.** Report lists served resolved models/providers, denied attempts, and attests that no prohibited **vendor identifier** was served — referenced to an optional customer-held hash-chain root. Explicit limit: gateway identity ≠ weight-origin / training lineage.

## Environment

| Variable | Purpose |
| -------- | ------- |
| `CLAWQL_INFERENCE_PROVENANCE_PROFILE` | `general` (default) or `federal` |
| `CLAWQL_INFERENCE_PROVENANCE_MODE` | `deny` or `allow` (overrides profile default) |
| `CLAWQL_INFERENCE_DENIED_VENDORS` | Comma-separated weight vendors to deny |
| `CLAWQL_INFERENCE_ALLOWED_VENDORS` | Allowlist vendors (`allow` mode) |
| `CLAWQL_INFERENCE_ALLOWED_MODELS` | Allowlist exact resolved/canonical ids |
| `CLAWQL_INFERENCE_PROVENANCE` | `0`/`false` disables; `1`/`true` forces enable |
| `CLAWQL_INFERENCE_DISABLE_PROVIDERS` | If it includes `deepseek`, DeepSeek is also added to **denied vendors** (closes the false-safety gap) |

Federal profile always adds `deepseek` to denied vendors and defaults to allowlist mode.

## Defaults

| Alias | Target |
| ----- | ------ |
| `clawql/cheap-chat` | `groq/llama-3.1-8b-instant` (origin-neutral frugal) |
| `clawql/code` | `groq/llama-3.1-8b-instant` |
| `clawql/deepseek-chat` | `deepseek/deepseek-chat` (**explicit opt-in**) |

DeepSeek remains available via direct BYOK / OpenRouter / the opt-in alias when policy permits. OpenBench and other cost demos may still pin `openrouter/deepseek/…` explicitly.

## Qwen vs this order

Sovereign-hosting narratives for **Qwen** (self-hosted / regional) are separate from DeepSeek-oriented order language. The federal default allowlist includes `qwen` so buyers can self-host; they may remove it via `CLAWQL_INFERENCE_ALLOWED_VENDORS`. Do not equate Qwen availability with DeepSeek clearance.

## Checklist (operator)

See [`model-provenance-federal-checklist.md`](./model-provenance-federal-checklist.md).

## Programmatic report

```ts
import {
  buildModelProvenanceComplianceReport,
  createInferenceStore,
} from "clawql-inference";

const store = createInferenceStore({ env: process.env });
const report = await buildModelProvenanceComplianceReport({
  store,
  since: new Date("2026-10-01T00:00:00Z"),
  customerHeldRoot: "sha256:…", // optional echo into attestation text
});
// report.ok, report.served, report.attestation, report.limit
```
