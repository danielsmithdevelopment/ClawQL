# Cloudflare Clef / Clef-Flash — v0.1 (measure)

**Status:** measure rung  
**Related:** [Decision-1](./decisions-openrouter-decision1-v0.1.md) · Fast Decision held-out · [[Inference gateway GTM ladder]]

## Why Clef

Clef is an **Apache-2.0** SystemOne decision model (open weights on Hugging Face). Unlike Microsoft-Decision-1 (Foundry/OpenRouter only), Clef can be **self-hosted** — aligned with ClawQL’s rule that cloud-only services do not enter the official stack.

| Variant    | Size | Typical use                         |
| ---------- | ---- | ----------------------------------- |
| Clef-Flash | 9B   | Latency-sensitive measure / routing |
| Clef       | 27B  | Higher-quality measure              |

## Transports

1. **Self-host (preferred for official stack):** `CLAWQL_CLEF_SYSTEMONE_URL` → `POST {base}/v1/systemone` (e.g. SGLang).
2. **Workers AI (measure fill only):** `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` → `@cf/cloudflare/clef-flash` or `@cf/cloudflare/clef`. Token must include Workers AI permission.

## Held-out measure (vs GLiNER)

```bash
# Workers AI fill:
CLOUDFLARE_API_TOKEN=… CLOUDFLARE_ACCOUNT_ID=… \
  CLAWQL_CLEF_MODEL=clef-flash \
  npx tsx scripts/run-clef-held-out-measure.mts

# Compare to frozen GLiNER productionTrusted readout:
CLEF_MEASURE=…/clef-v04-held-out-measure.json \
  npx tsx scripts/run-clef-vs-gliner-compare.mts
```

Opt-in scorer: `CLAWQL_HELD_OUT_SCORER=clef-flash` (or `clef`) in `scripts/run-held-out-adjudication.mts`.  
`backendId` is `cloudflare/clef-flash` or `cloudflare/clef` — **≠ `gliner2`**, so `productionTrusted` stays false under the current gate.

Marker: `packages/clawql-core/src/classifier/held-out/.run-clef-vs-gliner` → workflow `clef-vs-gliner-measure.yml`.

## Honesty

- Measure / candidate only until a deliberate trust program exists.
- Official stack path is **self-hosted** Clef, not Workers AI.
- GLiNER2.5-Decide remains the only `PRODUCTION_TRUSTED_SCORER_BACKEND` today.
