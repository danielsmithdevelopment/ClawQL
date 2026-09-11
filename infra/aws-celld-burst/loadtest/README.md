# Three-arm load test scaffold (§13)

**Status:** Design only — does not run until Arm A/B/C ingest endpoints exist and AWS Cost Explorer tags are wired.

**Spec:** [`docs/streams/aws-celld-burst.md`](../../docs/streams/aws-celld-burst.md) §13

## Files

| Path | Purpose |
| ---- | ------- |
| `burst-1m-gap-2m.js` | k6 script: identical 1M / 10-min zero / 2M stream |
| `RESULT_TEMPLATE.md` | Publishable result template (§13.5) — fill after a real run |

## Usage (when arms exist)

```bash
# Arm A
BASE_URL=https://arm-a.example/webhook/burst \
  ARM=A \
  k6 run infra/aws-celld-burst/loadtest/burst-1m-gap-2m.js

# Repeat with ARM=B / ARM=C against their ingest URLs.
# Never publish until all three arms have same-day Cost Explorer exports.
```

## Pre-run AWS budget estimate (not §13.5)

Rate-card **order-of-magnitude** for one same-day three-arm window in `us-east-1`. Replace with Cost Explorer after the run — this is planning only.

**Assumptions:** one EKS cluster; arms **sequential** (reconfigure between A→B→C); ~6–10 wall-clock hours including bring-up, one full 1M/10m-gap/2M cycle per arm (~12+ min traffic + drain), and teardown; Arm A = 3× `r6g.2xlarge` celld nodes held through the day; Arm B/C = Karpenter Spot/On-Demand burst nodes (peak tens of mid-size instances for ~1–2 minutes per spike, near-zero during gap for B); one ALB; one NAT Gateway; lightweight in-cluster LGTM; k6 from a single `c7g.xlarge` (or equivalent) for ~1 hour of active generation across arms.

| Line item | Low (lean) | Mid (likely) | High (re-runs / larger fleets) |
| --------- | ---------- | ------------ | ------------------------------ |
| EKS control plane (~$0.10/hr × 8–12h) | ~$1 | ~$1 | ~$2 |
| Arm A always-on memory nodes (3× r6g.2xlarge ≈ $0.40/hr each) | ~$8–10 | ~$12–15 | ~$25 (5 nodes / longer day) |
| Arm B/C Karpenter burst EC2 (Spot-heavy) | ~$5–10 | ~$15–30 | ~$60–100 |
| ALB + LCU under ~17k–33k RPS spikes | ~$5 | ~$15–40 | ~$80 |
| NAT Gateway + egress (3M small HTTP bodies × 3 arms) | ~$2–5 | ~$8–15 | ~$30 |
| k6 generator instance | ~$1 | ~$2 | ~$5 |
| S3 / CloudWatch logs / misc | ~$1 | ~$3–5 | ~$15 |
| **Same-day total (planning)** | **~$25–40** | **~$60–120** | **~$200–350** |

**Not included:** multi-day soak, parallel arms (≈3× EKS/NAT), production-size observability retention, GPU/IDP sidecars for a full §2.1 document pipeline (that can dominate — budget separately if the ingest path runs real `run_idp_pipeline`), or human time.

**Cost Explorer caveat:** usable tagged spend often lags ~24h; do not publish §13.5 `$Y` until the tagged window has settled in Cost Explorer.

## Honesty

Do not invent latency or dollar numbers from this scaffold. Unfavorable Arm B/C results must appear in the §13.5 template exactly as measured.
