# Model provenance — federal-facing operator checklist

Use this after enabling the [model provenance gate](./model-provenance-gate.md).  
This checklist configures **gateway identity controls**. It does **not** certify weight origin, FedRAMP, or any agency approval.

## 1. Profile and defaults

- [ ] Set `CLAWQL_INFERENCE_PROVENANCE_PROFILE=federal` (allowlist fail-closed + DeepSeek denied).
- [ ] Confirm cheap aliases are origin-neutral: `clawql/cheap-chat` / `clawql/code` → not DeepSeek (default catalog: `groq/llama-3.1-8b-instant`).
- [ ] Do **not** rely on `CLAWQL_INFERENCE_DISABLE_PROVIDERS=deepseek` alone — that only drops the DeepSeek plugin; the identity gate covers `openrouter/deepseek/*` and aliases.

## 2. Allowlist

- [ ] Review `CLAWQL_INFERENCE_ALLOWED_VENDORS` (defaults include anthropic, openai, google, mistral, meta, xai, microsoft, ollama, mlx, fireworks, together, groq, **qwen**).
- [ ] Tighten if your buyer excludes Qwen or other vendors — set an explicit allowlist.
- [ ] Optionally pin `CLAWQL_INFERENCE_ALLOWED_MODELS` for exact resolved ids.
- [ ] Keep self-hosted / vLLM models off the allowlist unless you have added them to the identity table **and** the allowlist (unknown ids fail closed).

## 3. Paths covered

- [ ] Chat / completions via `createInferenceGateway` (including fallback attempts).
- [ ] Decisions backends that call OpenRouter Decisions (`callRemoteOpenRouterDecisions`).
- [ ] Semantic-cache embedding HTTP calls (`CLAWQL_EMBEDDING_MODEL`).
- [ ] Confirm no sidecar bypasses the gateway with a hard-coded DeepSeek id (OpenBench workflows, LangExtract examples, etc. — pin allowed models there).

## 4. Evidence

- [ ] WORM / inference store retains `INFERENCE_CALL` / result records with resolved `modelId` + provider.
- [ ] Generate a period report via `buildModelProvenanceComplianceReport` with your customer-held hash-chain root reference.
- [ ] Read the report **limit**: identity at gateway ≠ weight-origin attestation.
- [ ] Retain the report artifact with the customer-held root for the engagement file.

## 5. Language hygiene

- [ ] Marketing / proposals do **not** say “compliant,” “approved,” or “cleared” based on this gate alone.
- [ ] Keep **Qwen sovereign-hosting** stories distinct from DeepSeek-order language (see gate doc).
- [ ] Weight-origin / lineage registry work is tracked separately — do not imply it ships with this checklist.

## Related

- Gate reference: [`model-provenance-gate.md`](./model-provenance-gate.md)
- Inference gateway: [`../inference/clawql-inference.md`](../inference/clawql-inference.md)
