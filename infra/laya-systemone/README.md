# ClawQL Laya SystemOne (self-host, CPU)

Apache-2.0 Convai Laya (~322–421M encoder) served at `POST /v1/systemone`.

CPU-class peer to GLiNER2.5-Decide for held-out measure fills.

## Launch

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install torch --index-url https://download.pytorch.org/whl/cpu
pip install "laya[serve]"
LAYA_DEVICE=cpu LAYA_PRELOAD=0 laya-serve --host 127.0.0.1 --port 8000
# → http://127.0.0.1:8000/v1/systemone
```

## Wire to ClawQL measure

```bash
export CLAWQL_LAYA_SYSTEMONE_URL=http://127.0.0.1:8000
export CLAWQL_LAYA_MODEL=english   # or multilingual / typed-decisions
npx tsx scripts/smoke-laya-systemone.mts
npx tsx scripts/run-laya-held-out-measure.mts
LAYA_MEASURE=…/laya-v04-held-out-measure.json \
  npx tsx scripts/run-laya-vs-gliner-compare.mts
```

## Honesty

| Pass type           | Meaning                                          |
| ------------------- | ------------------------------------------------ |
| Measure fill        | Self-host Laya scores on frozen v0.4 labels      |
| `productionTrusted` | Still requires live `gliner2` under current gate |
