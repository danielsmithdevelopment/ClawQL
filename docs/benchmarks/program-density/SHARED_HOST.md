# Shared-host contract — durable-agent density

Run both systems on **one host**, same agent shape, same columns, before any win copy.
Evidence today is provisional (different hosts). This file is the checklist for the shared run.

## Five numbers (side by side)

Once both rows are complete, publish these five under identical definitions:

| # | Number | Definition |
| --- | --- | --- |
| 1 | **agentsAtLimit** | First resource exhausted under the shared RSS ceiling (total process RSS). Retained at limit = wake-deadline schedule. |
| 2 | **wakeWarmMs p99** | Cached / warm wake. |
| 3 | **wakeColdMs** | Cold wake — quote **median + range** until orders are locked; no cross-system cold win from a single p99. |
| 4 | **deadlineAccuracy** | Shared 1s SLA, identical **fired definition**, identical **flush policy** (or each discloses), **schedule shape + format** disclosed, arrival-rate ramp, **sustainablePerSec**, **scaled bursts** (first size that misses 1s), flush **crash test**, **deadline restart test**. |
| 5 | **restartSurvival** | Parked bags survive process restart (bag wake). |

## Deadline accuracy — required arms

### Flush policy + crash test

- Name the policy: `os_buffer` \| `fsync_each` \| `group_commit(batchMax, flushIntervalMs)`.
- Stamp lateness **after** flush. Unflushed work is never counted.
- **SIGKILL mid-drain:** every ACK’d fire on disk exactly once.

### Scaled bursts (Ontologiql sizes)

Fire **N** deadlines that share one instant (or a negligible offset). Report `% within 1s SLA` and excess p99 for each size. Sizes (at least):

`512`, `10_000`, `100_000`, then continue upward until the host or the SLA fails.

**Headline:** the **first size that misses** the one-second target (`pctWithinSla < slaTargetPct`, default 99%).

**Constraint:** burst size **N must not exceed agents-at-limit** unless the system explains how more deadlines than agents fell due at once (e.g. multi-deadline-per-agent). Otherwise rerun the ladder with `N ≤ agentsAtLimit`.

### Deadline restart test

1. Persist a **full-scale** wake-deadline schedule (agents-at-limit capacity) with live pending deadlines.
2. Kill the process with deadlines still pending.
3. Wait so **some** deadlines fall due during downtime.
4. Restart: **rebuild** the schedule from durable state; report **rebuild time**.
5. Assert **no loss** and **no duplicates**.
6. **Prompt-fire** overdue deadlines (catch-up SLA measured from rebuild completion).

**Schedule format (required disclosure):** rebuildMs is a **storage/rebuild-path** column, not a language column. Each system must record on-disk layout and rebuild algorithm (e.g. compact typed arrays + bottom-up heapify vs per-entry parse + sort). ClawQL: see `scheduleFormat` in evidence (`json_header_plus_live_ndjson_pads_by_count` → `float64`/`int32` → bulk pad + single-pass heapify).

### Sustained-rate ramp

Ramp offered steady arrival until `% within SLA` drops below target. Report the last rate that still met the target (`sustainablePerSec`).

**Honesty check:** if `sustainablePerSec` equals the scaled-burst cliff exactly, state whether the ramp **continued past the first failure** or stopped at first miss. Stopping at first miss is the contract default; matching the burst cliff without a post-failure sample is ambiguous — remeasure or disclose.

## Five deadline arms (shared-host run)

On one host, both systems run:

1. Steady showcase (declared arrival rate)
2. Scaled bursts (first miss)
3. Sustained-rate ramp (`sustainablePerSec`)
4. Flush crash test (SIGKILL mid-drain)
5. Deadline restart (rebuild + overdue catch-up)

## ClawQL vs Ontologiql gates

| Gate | ClawQL | Ontologiql |
| --- | --- | --- |
| Flush policy named + crash-tested | measured (group_commit) | **open — disclose + crash test** |
| Scaled bursts + first-miss | measured (first miss **250k** @ 2.5e6 agents) | **open — explain 400k burst @ 200k agents, or rerun with N ≤ agentsAtLimit** |
| Sustained-rate ramp past failure | measured (3-rep floor 256k; ramp stops at first miss) | **open — confirm ramp went past failure (result matched burst cliff)** |
| Deadline restart + **schedule format** disclosed | measured (~40 ms @ 2.5e6; format in evidence) | **open — publish rebuildMs + on-disk/rebuild path** |
| Shared host | pending | pending |

Until the Ontologiql opens above are closed and both complete the five arms on one host, do **not** write win copy.
