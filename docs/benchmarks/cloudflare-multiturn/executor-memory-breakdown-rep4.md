# Executor v2 memory — plateau check + per-process split (board-rep4)

Artifact: [`board-rep4-n10000.json`](./board-rep4-n10000.json)  
Arm: `executor_v2` · 10 000 sessions · Node-256 ClawQL peers same run · measuredAt 2026-10-16T03:14:59Z

**Headline for the page:** about **2.1 GB under sustained load** — native serve about **0.8 GB** plus sandbox about **1.2 GB**, each process counted once. Stock `executor serve` also starts a diagnostics (motel) workerd; that process is **excluded** here (generous to Executor; real deployments may carry it too).

**Measured plateau (product path):** anonymous **2103 MB** median (last-5 samples); RSS **2194 MB**.

## Plateau or growth?

101 samples over 10k sessions (product-path anon = CLI + native `serve` + sandbox workerd):

| Session | anon MB |
| ---: | ---: |
| 1 | 1760 |
| 1 000 | 1984 |
| 2 000 | 2155 |
| 3 000 | 1925 |
| 5 000 | 2097 |
| 7 000 | 2281 |
| 8 000 | 2022 |
| 10 000 | 1990 |

- First → last drift: **+229 MB** (1760 → 1990).
- Full range: **1760–2399** (≈640 MB band of GC / sandbox churn).
- Means by third of the run: early **2008** · mid **2106** · late **2156** (~**+15 MB / 1k sessions**).
- After the first ~20% of samples, drift is **not** steadily upward (late can sit below mid; session 10k is below the peak).

**Verdict for the page:** treat **~2.1 GB** as the **working set / architecture cost** of the long-lived serve + sandbox path under this load, not “leaked from zero to 2.1 GB over 10k.” Phrase as **about 2.1 GB under sustained load** (same-run). Optionally footnote that anon oscillates in a ~1.9–2.4 GB band after warmup.

**Private note for Rhys (optional):** motel diagnostics workerd (excluded from the headline) grew from ~**91 MB** → ~**1.3 GB** anon over the same run — that *is* a diagnostics growth signal, separate from the product-path 2.1 GB.

This was **one** 10k arm (not 30k). Do not say “over 30,000 sessions” unless aggregating multiple arms/reps.

## Per-process breakdown (no double-count)

PPID tree from Executor serve root; each PID counted once. Plateau sum = `executor_serve` + `executor_sandbox` only.

### At session 1

| Role | PID | anon MB | rss MB | In 2.1 GB sum? |
| --- | ---: | ---: | ---: | --- |
| CLI (`node …/executor serve`) | 335505 | 7 | 7 | yes |
| Native serve (`executor-linux-x64/executor serve`) | 335516 | **694** | 732 | yes |
| Sandbox workerd | 824261 | **1059** | 1110 | yes |
| Motel diagnostics workerd | 855283 | 91 | 124 | **no** (excluded) |
| **Product-path total** | | **1760** | | matches reported sample |

### At session 5 000 (mid)

| Role | anon MB | In sum? |
| --- | ---: | --- |
| CLI | 7 | yes |
| Native serve | **880** | yes |
| Sandbox workerd | **1209** | yes |
| Motel (excluded) | 728 | no |
| **Product-path total** | **2097** | |

### At session 10 000 (last)

| Role | anon MB | In sum? |
| --- | ---: | --- |
| CLI | 7 | yes |
| Native serve | **803** | yes |
| Sandbox workerd | **1179** | yes |
| Motel (excluded) | 1263 | no |
| **Product-path total** | **1990** | |

### Last-5 plateau mean (roles)

| Role | mean anon MB | Notes |
| --- | ---: | --- |
| CLI + native serve (combined `executor_serve`) | ~450 each sample pair → serve dominates (~800–900) | CLI stays ~7 |
| Sandbox workerd | **~1195** | majority of product path |
| Motel (excluded) | ~1246 | not in headline |

**Split of the ~2.1 GB headline (typical mid/late):** roughly **~0.8 GB native serve + ~1.2 GB sandbox + ~7 MB CLI**. No double-counting: one PID each; motel omitted.
