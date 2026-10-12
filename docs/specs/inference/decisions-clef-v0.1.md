# Cloudflare Clef / Clef-Flash — v0.1 (measure)

**Status:** measure rung  
**Related:** [Decision-1](./decisions-openrouter-decision1-v0.1.md) · Fast Decision held-out · [[Inference gateway GTM ladder]]

## Why Clef

Clef is an **Apache-2.0** SystemOne decision model (open weights on Hugging Face). Unlike Microsoft-Decision-1 (Foundry/OpenRouter only), Clef can be **self-hosted** — aligned with ClawQL’s rule that cloud-only services do not enter the official stack.

| Variant    | Size | Typical use                         |
| ---------- | ---- | ----------------------------------- |
| Clef-Flash | 9B   | Latency-sensitive measure / routing |
| Clef       | 27B  | Higher-quality measure              |

## Transport (self-host only)

**Held-out measure and official-stack path:** `CLAWQL_CLEF_SYSTEMONE_URL` → `POST {base}/v1/systemone` (SGLang).

Launch helpers: [`infra/clef-systemone`](../../../infra/clef-systemone/README.md).

Workers AI is **not** used for ClawQL held-out fills (cloud-only; refused by measure scripts and Actions).

## Held-out measure (vs GLiNER)

```bash
# Self-host SGLang first (GPU host):
#   cd infra/clef-systemone && docker compose up clef-flash

CLAWQL_CLEF_SYSTEMONE_URL=http://127.0.0.1:30000 \
  CLAWQL_CLEF_MODEL=clef-flash \
  npx tsx scripts/run-clef-held-out-measure.mts

# Compare to frozen GLiNER productionTrusted readout:
CLEF_MEASURE=…/clef-v04-held-out-measure.json \
  npx tsx scripts/run-clef-vs-gliner-compare.mts
```

Opt-in scorer: `CLAWQL_HELD_OUT_SCORER=clef-flash` (or `clef`) in `scripts/run-held-out-adjudication.mts`.  
`backendId` is `cloudflare/clef-flash` or `cloudflare/clef` — **≠ `gliner2`**, so `productionTrusted` stays false under the current gate.

Marker: `packages/clawql-core/src/classifier/held-out/.run-clef-vs-gliner` → workflow `clef-vs-gliner-measure.yml` (secret: `CLAWQL_CLEF_SYSTEMONE_URL` only).

## Honesty

- Measure / candidate only until a deliberate trust program exists.
- Official stack path is **self-hosted** Clef — not Workers AI, not Decision-1 cloud.
- GLiNER2.5-Decide remains the only `PRODUCTION_TRUSTED_SCORER_BACKEND` today.
