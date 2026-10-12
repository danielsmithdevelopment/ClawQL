# ClawQL Clef SystemOne (self-host)

Apache-2.0 Clef / Clef-Flash served with SGLang at `POST /v1/systemone`.

**This is the only held-out measure transport.** Workers AI is not used for
official-stack / ClawQL measure fills.

## Requirements

- NVIDIA GPU (H200 / B200 / B300 recommended; BF16 TP=1)
- Docker with NVIDIA Container Toolkit
- Disk for Hugging Face cache (`Cloudflare/clef-flash` ≈ 9B, `Cloudflare/clef` ≈ 27B)

## Launch (Clef-Flash)

```bash
cd infra/clef-systemone
docker compose up clef-flash
# → http://127.0.0.1:30000/v1/systemone
```

Or raw Docker (SGLang cookbook):

```bash
docker run --gpus all \
  --shm-size 32g \
  -p 30000:30000 \
  -v ~/.cache/huggingface:/root/.cache/huggingface \
  --ipc=host \
  lmsysorg/sglang:dev-clef \
  sglang serve \
    --model-path Cloudflare/clef-flash \
    --host 0.0.0.0 \
    --port 30000
```

## Wire to ClawQL measure

```bash
export CLAWQL_CLEF_SYSTEMONE_URL=http://127.0.0.1:30000
export CLAWQL_CLEF_MODEL=clef-flash
npx tsx scripts/smoke-clef-systemone.mts
npx tsx scripts/run-clef-held-out-measure.mts
CLEF_MEASURE=…/clef-v04-held-out-measure.json \
  npx tsx scripts/run-clef-vs-gliner-compare.mts
```

Actions: set repo secret `CLAWQL_CLEF_SYSTEMONE_URL` to a reachable SystemOne
base (runner must network to the GPU host). Marker
`packages/clawql-core/src/classifier/held-out/.run-clef-vs-gliner` with
`v0.4-routing-fresh` triggers `clef-vs-gliner-measure.yml`.

## Honesty

| Pass type           | Meaning                                                                         |
| ------------------- | ------------------------------------------------------------------------------- |
| Measure fill        | Self-host Clef scores on frozen v0.4 labels                                     |
| `productionTrusted` | Still requires live `gliner2` under current gate — Clef `backendId` ≠ `gliner2` |
