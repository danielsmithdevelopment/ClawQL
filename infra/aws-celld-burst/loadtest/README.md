# Three-arm load test scaffold (§13)

**Status:** Design only — does not run until Arm A/B/C ingest endpoints exist and AWS Cost Explorer tags are wired.

**Spec:** [`docs/streams/aws-celld-burst.md`](../../docs/streams/aws-celld-burst.md) §13

## Files

| Path                                | Purpose                                                                                       |
| ----------------------------------- | --------------------------------------------------------------------------------------------- |
| `burst-1m-gap-2m.js`                | k6 script: identical 1M / 10-min zero / 2M stream                                             |
| `RESULT_TEMPLATE.md`                | Publishable result template (§13.5) — fill after a real run                                   |
| `dry-run.mjs`                       | Local mock HTTP burst + `results/dry-run-summary.json` (`status: dry-run`, null metrics/`$Y`) |
| `export-cost-explorer-arms.sh`      | Fail-closed Cost Explorer three-arm CSV export (refuses R2-sync keys)                         |
| `merge-k6-summaries-to-metrics.mjs` | Merge three k6 summaries → metrics.json (spikeSeconds operator-supplied)                      |
| `fill-result-from-exports.mjs`      | Fill §13.5 from CE CSVs + metrics.json (no invented `$Y`)                                     |

```bash
node infra/aws-celld-burst/loadtest/dry-run.mjs
```

**CI:** [`.github/workflows/aws-celld-burst-section13-dry-run.yml`](../../../.github/workflows/aws-celld-burst-section13-dry-run.yml) runs the same harness on path-filtered PRs/`main` pushes and `workflow_dispatch`, asserts `status=dry-run` + null `$Y` / p50/p99, and uploads the summary artifact. A companion credential gate notices `CLAWQL_CE_*` (preferred) / `CLAWQL_CE_ROLE_ARN` (OIDC) / usable AWS secrets. Optional live CE CSV export: `workflow_dispatch` with `run_ce_export=true` or `repository_dispatch` type `section13-ce-export` (fail-closed; never invents `$Y`). Fetch with `bash scripts/fetch-section13-ce-export-artifact.sh`.

**Honesty:** dry-run proves the summary schema and harness wiring only. Do not publish dry-run output as §13.5.

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

| Line item                                                     | Low (lean)  | Mid (likely) | High (re-runs / larger fleets) |
| ------------------------------------------------------------- | ----------- | ------------ | ------------------------------ |
| EKS control plane (~$0.10/hr × 8–12h)                         | ~$1         | ~$1          | ~$2                            |
| Arm A always-on memory nodes (3× r6g.2xlarge ≈ $0.40/hr each) | ~$8–10      | ~$12–15      | ~$25 (5 nodes / longer day)    |
| Arm B/C Karpenter burst EC2 (Spot-heavy)                      | ~$5–10      | ~$15–30      | ~$60–100                       |
| ALB + LCU under ~17k–33k RPS spikes                           | ~$5         | ~$15–40      | ~$80                           |
| NAT Gateway + egress (3M small HTTP bodies × 3 arms)          | ~$2–5       | ~$8–15       | ~$30                           |
| k6 generator instance                                         | ~$1         | ~$2          | ~$5                            |
| S3 / CloudWatch logs / misc                                   | ~$1         | ~$3–5        | ~$15                           |
| **Same-day total (planning)**                                 | **~$25–40** | **~$60–120** | **~$200–350**                  |

**Not included:** multi-day soak, parallel arms (≈3× EKS/NAT), production-size observability retention, GPU/IDP sidecars for a full §2.1 document pipeline (that can dominate — budget separately if the ingest path runs real `run_idp_pipeline`), or human time.

**Cost Explorer caveat:** usable tagged spend often lags ~24h; do not publish §13.5 `$Y` until the tagged window has settled in Cost Explorer.

## Exporting Cost Explorer CSVs (not inventing $Y)

When real AWS credentials (not R2 sync) and tagged arms exist:

```bash
CLAWQL_S13_START=2026-09-20 CLAWQL_S13_END=2026-09-21 \
  bash infra/aws-celld-burst/loadtest/export-cost-explorer-arms.sh ./ce-out
```

Mixed sandboxes that keep Cloudflare R2 sync keys in `AWS_*` can override with
`CLAWQL_CE_ACCESS_KEY_ID` / `CLAWQL_CE_SECRET_ACCESS_KEY` (optional
`CLAWQL_CE_SESSION_TOKEN` / `CLAWQL_CE_REGION`). The script still refuses when the
*effective* access key equals `CLAWQL_SYNC_ACCESS_KEY_ID`.

**GHA OIDC (no static CE keys):** deploy
[`../iam/github-oidc-ce-export-role.yaml`](../iam/github-oidc-ce-export-role.yaml)
(CloudFormation), set repository variable or secret `CLAWQL_CE_ROLE_ARN` to the
`RoleArn` output, then dispatch `section13-ce-export`. Optional
`vars.CLAWQL_CE_REGION` (default `us-east-1`). The workflow assumes that role via
`id-token` and never invents `$Y`.

Fail-closed: refuses missing aws CLI, R2-sync key collision, STS failure, or empty Cost Explorer results.

## Merging k6 summaries → metrics.json

After three arm runs (set `RESULT_DIR=./k6-out` so `handleSummary` writes `k6-arm-{A,B,C}.json`):

```bash
node infra/aws-celld-burst/loadtest/merge-k6-summaries-to-metrics.mjs \
  --arm-a k6-out/k6-arm-A.json --arm-b k6-out/k6-arm-B.json --arm-c k6-out/k6-arm-C.json \
  --spike-b-seconds 45 --spike-c-seconds 20 \
  --out metrics.json
```

`spike-*-seconds` must come from Grafana / operator observation of the post-gap spike — the script refuses to invent them from aggregate k6 JSON.

## Filling §13.5 from real exports (not dry-run)

After Cost Explorer CSVs and metrics.json exist:

```bash
node infra/aws-celld-burst/loadtest/fill-result-from-exports.mjs \
  --arm-a ce-arm-a.csv --arm-b ce-arm-b.csv --arm-c ce-arm-c.csv \
  --metrics metrics.json \
  --out infra/aws-celld-burst/loadtest/results/section13-5-filled.md
```

Fail-closed unit tests (no invented `$Y`):

```bash
node --test infra/aws-celld-burst/loadtest/fill-result-from-exports.test.mjs \
  infra/aws-celld-burst/loadtest/export-cost-explorer-arms.test.mjs \
  infra/aws-celld-burst/loadtest/merge-k6-summaries-to-metrics.test.mjs
```

Fail-closed: missing/non-numeric cost columns or missing `p99Ms` / `drops` / `spikeSeconds` abort without writing invented `$Y`.

## Honesty

Do not invent latency or dollar numbers from this scaffold. Unfavorable Arm B/C results must appear in the §13.5 template exactly as measured.
