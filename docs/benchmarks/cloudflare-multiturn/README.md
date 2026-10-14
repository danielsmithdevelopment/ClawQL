# Cloudflare multi-turn gateway benchmark

Spec: [`SPEC.md`](./SPEC.md) · Curated ops (frozen): [`curated-subset.json`](./curated-subset.json) · Fixture hashes: [`MANIFEST.json`](./MANIFEST.json)

## Status

| Piece | State |
| --- | --- |
| Spec + fairness rules | Done |
| Curated ~60-op subset | **Frozen** 2026-10-14 |
| Synthetic fixture + replay mock | Done (label: real schemas, synthetic content) |
| 12-step scripted success checks | Done |
| Direct baseline smoke | Done (`run-zone-audit.mjs`) |
| Live read-only recorder + sanitize | Done (needs token to produce live fixture) |
| ClawQL / Executor / MJ / AG / CF code-mode arms | **Next** |
| Interleaved 3×10k boards + memory | **Next** |
| Real-model 50-session validation | **Next** |

## Quick start (no Cloudflare credentials)

```bash
node scripts/benchmarks/cloudflare-multiturn/generate-synthetic-fixture.mjs
node scripts/benchmarks/cloudflare-multiturn/run-zone-audit.mjs
# optional: CF_MT_ITERS=50 node scripts/benchmarks/cloudflare-multiturn/run-zone-audit.mjs

node --test scripts/benchmarks/cloudflare-multiturn/lib/success-checks.test.mjs
```

## Live recording (once)

```bash
# Read-only token: zones, DNS, Workers scripts, R2 buckets, firewall — no writes
CLOUDFLARE_API_TOKEN=… CLOUDFLARE_ACCOUNT_ID=… AUDIT_ZONE_NAME=example.com \
  node scripts/benchmarks/cloudflare-multiturn/record/record-cloudflare-reads.mjs
# Inspect fixtures/recording.live.sanitized.json → update MANIFEST → FIXTURE=… for runs
```

## Layout

| Path | Role |
| --- | --- |
| `scripts/benchmarks/cloudflare-multiturn/mock/` | Isolated HTTP replay mock |
| `scripts/benchmarks/cloudflare-multiturn/fixtures/` | Recording + curated subset + MANIFEST |
| `scripts/benchmarks/cloudflare-multiturn/code-mode/` | Published JS for CF code-mode / Executor v2 |
| `scripts/benchmarks/cloudflare-multiturn/lib/` | Sanitize, scale, success checks |
| `scripts/benchmarks/cloudflare-multiturn/record/` | One-time read-only recorder |

## Board claims (when complete)

Only: tokens (rebuildable), task success, latency (zero vs recorded), memory (RSS+anon), full-spec feasibility. No live API performance claims; no writes beyond gated proposals.

## Open questions

[`open-questions.md`](./open-questions.md)
