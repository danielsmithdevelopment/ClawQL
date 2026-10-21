# Tier C TTL tradeoff — stock vs TTL-only vs preferred (planned)

Machine-readable rows: [`ttl-tradeoff-evidence.json`](./ttl-tradeoff-evidence.json). Narrative: [`AVAILABILITY.md`](./AVAILABILITY.md).

## Why two measured rows (and one planned target)

Resume p50 under stock settings is **~12s** because the survivor waits for the dead node's **10s lease** to expire, plus detection. TTL is the failover floor.

| Row                    | What it is                                                         | Publish as                                                |
| ---------------------- | ------------------------------------------------------------------ | --------------------------------------------------------- |
| `stock_r2_ttl_10s`     | `CELLD_TTL_MS=10000`, R2 leases, celld renew ~⅓ TTL                | **Measured** (N=1000)                                     |
| `ttl_only_30s`         | Same renew + R2, TTL=30000 — **tradeoff demo only**                | **Measured**, small sample (**n=40**) — label n always    |
| `production_preferred` | Keep ~10s failover budget; renew every ⅕ TTL; regional lease store | **Planned** — not a result until run at stock sample size |

Do **not** publish the preferred row as a measured result. It is a target (celld 0.4.0 exposes only `CELLD_TTL_MS`).

### Latest lab numbers (measured rows only)

| Row              | n        | dups | outcome_unknown rate | self-fences | deadline misses | resume p50  | resume p99 | failover claim |
| ---------------- | -------- | ---- | -------------------- | ----------- | --------------- | ----------- | ---------- | -------------- |
| stock_r2_ttl_10s | **1000** | 0    | 0.481                | **6**       | **9**           | **11908ms** | 34292ms    | **~12s**       |
| ttl_only_30s     | **40**   | 0    | 0.55                 | 0           | 0               | **31939ms** | 46488ms    | **~32s**       |

Duplicates stay zero in both. Stretching TTL to 30s moves failover from ~12s to ~32s — the pause customers feel. Stock has **6 self-fences** (0.6%) and **9 resumeDeadlineMisses** (0.9%) — availability costs stated, not hidden. Rule-of-three duplicate upper bound 0.3% @95% on stock. Preferred production (planned) keeps the ~10s budget and fixes renew cadence / lease store, not the TTL alone.

### Preferred production (planned — not measured)

| Field                | Value                                                      |
| -------------------- | ---------------------------------------------------------- |
| Status               | **planned**                                                |
| Target sample size   | Same as stock (N=1000) before any claim                    |
| Intended TTL         | ~10000 ms (keep failover budget)                           |
| Intended renew       | Every ⅕ TTL + slow-renew retry                             |
| Intended lease store | Regional coordination (program state may stay on R2)       |
| Expected vs stock    | Similar resume p50; lower self-fence rate once knobs exist |

## Claim (stock, matches evidence)

> Across 1,000 crashes injected at every phase of a write, programs resumed on another node with no repeated writes (the 95% upper bound on the duplicate rate is 0.3%). The median resume took about 12 seconds, set by the lease timeout. Writes caught mid-flight are marked outcome unknown for a person to resolve. Under stock settings, 0.6% of surviving nodes paused themselves for safety, and 0.9% of resumes missed the recovery deadline.

Every number is measured. See [`AVAILABILITY.md`](./AVAILABILITY.md) for the per-phase outcome_unknown table (aggregate ~48% is a targeting artifact).

## How to regenerate

```bash
# stock (may already be running as FLEET_PHASED_N=1000)
STREAMS_CELLD_FLEET_REQUIRED=1 FLEET_PHASED_N=8 npm run benchmark:fleet-phased-kill

# TTL-only tradeoff arm (alternate ports so it can overlap stock)
STREAMS_CELLD_FLEET_REQUIRED=1 FLEET_PHASED_N=40 CELLD_TTL_MS=30000 \
  PROGRAM_CELL_FLEET_PORT_A=9891 PROGRAM_CELL_FLEET_PORT_B=9892 \
  PROGRAM_CELL_FLEET_INTERNAL_A=9893 PROGRAM_CELL_FLEET_INTERNAL_B=9894 \
  MOCK_PETS_PORT=9895 \
  FLEET_PHASED_EVIDENCE=docs/benchmarks/program-cell-fleet-kill/ttl30-evidence.json \
  npm run benchmark:fleet-phased-kill

npm run benchmark:fleet-ttl-tradeoff
```
