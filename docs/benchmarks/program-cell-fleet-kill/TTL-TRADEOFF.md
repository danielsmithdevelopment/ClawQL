# Tier C TTL tradeoff — stock vs TTL-only vs preferred production

Machine-readable rows: [`ttl-tradeoff-evidence.json`](./ttl-tradeoff-evidence.json). Narrative: [`AVAILABILITY.md`](./AVAILABILITY.md).

## Why two measured rows (and one target)

Resume p50 under stock settings is **~12s** because the survivor waits for the dead node's **10s lease** to expire, plus detection. TTL is the failover floor.

| Row                    | What it is                                                         | Measure?                          |
| ---------------------- | ------------------------------------------------------------------ | --------------------------------- |
| `stock_r2_ttl_10s`     | `CELLD_TTL_MS=10000`, R2 leases, celld renew ~⅓ TTL                | Yes (phased board)                |
| `ttl_only_30s`         | Same renew + R2, TTL=30000 — **tradeoff demo only**                | Yes (short arm)                   |
| `production_preferred` | Keep ~10s failover budget; renew every ⅕ TTL; regional lease store | Target — knobs not in celld 0.4.0 |

### Latest lab numbers (three columns)

| Row              | n                     | dups | outcome_unknown rate | self-fences | deadline misses | resume p50  | resume p99 | failover claim |
| ---------------- | --------------------- | ---- | -------------------- | ----------- | --------------- | ----------- | ---------- | -------------- |
| stock_r2_ttl_10s | 830 (partial of 1000) | 0    | 0.4759036144578313   | **6**       | **8**           | **11960ms** | 34292ms    | **~12s**       |
| ttl_only_30s     | 40                    | 0    | 0.55                 | 0           | 0               | **31939ms** | 46488ms    | **~32s**       |

Duplicates stay zero in both. Stretching TTL to 30s moves failover from ~12s to ~32s — the pause customers feel. Fence-rate comparison is not fair at n=40 vs n=830; stock already showed a counted self-fence under R2. Stock also has **8 resumeDeadlineMisses** (availability) — not hidden. Preferred production keeps the ~10s budget and fixes renew cadence / lease store, not the TTL alone.

## Claim (per row)

> Programs survive a node crash, resuming on another node in about **N** seconds, with no repeated writes; …

**N** = measured `resumeMs.p50` rounded to seconds for that row.

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
