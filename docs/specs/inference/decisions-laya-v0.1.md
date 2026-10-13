# Convai Laya — v0.1 (measure)

**Status:** measure rung  
**Related:** [Fast Decision primitive](../../specs/classifier/fast-decision-primitive-v0.4.md) · [[Inference gateway GTM ladder]]

## Why Laya

Laya is an **Apache-2.0** SystemOne decision encoder (~322–421M). Unlike Clef (9B+/GPU) and Decision-1 (cloud-only), Laya is a **CPU-class** self-host peer to GLiNER2.5-Decide.

## Transport (self-host only)

`CLAWQL_LAYA_SYSTEMONE_URL` → `POST {base}/v1/systemone` (`laya-serve`).

Launch: [`infra/laya-systemone`](../../../infra/laya-systemone/README.md).

## Held-out measure (vs GLiNER)

```bash
CLAWQL_LAYA_SYSTEMONE_URL=http://127.0.0.1:8000 \
  npx tsx scripts/run-laya-held-out-measure.mts

LAYA_MEASURE=…/laya-v04-held-out-measure.json \
  npx tsx scripts/run-laya-vs-gliner-compare.mts
```

`backendId` is `convai/laya` — **≠ `gliner-decide`**, so `productionTrusted` stays false.

## Honesty

- Measure / candidate only until a deliberate trust program exists.
- GLiNER2.5-Decide (`gliner-decide`) remains the only `PRODUCTION_TRUSTED_SCORER_BACKEND` today.
