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
| 4 | **deadlineAccuracy** | Shared 1s SLA, identical **fired definition**, identical **flush policy** (or each discloses), **schedule shape** disclosed, arrival-rate ramp, **sustainablePerSec**, **scaled bursts** (first size that misses 1s), flush **crash test**, **deadline restart test**. |
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

### Deadline restart test

1. Persist a **full-scale** wake-deadline schedule (agents-at-limit capacity) with live pending deadlines.
2. Kill the process with deadlines still pending.
3. Wait so **some** deadlines fall due during downtime.
4. Restart: **rebuild** the schedule from durable state; report **rebuild time**.
5. Assert **no loss** and **no duplicates**.
6. **Prompt-fire** overdue deadlines (catch-up SLA measured from rebuild completion).

## ClawQL vs Ontologiql gates

| Gate | ClawQL | Ontologiql |
| --- | --- | --- |
| Flush policy named + crash-tested | measured (group_commit) | **pending disclose + crash test** |
| Scaled bursts + first-miss | **this checklist** | publish same sizes |
| Deadline restart (rebuild / no loss / overdue) | **this checklist** | publish same contract |
| Shared host | pending | pending |

Until Ontologiql discloses and crash-tests its flush policy, and both complete scaled bursts + deadline restart on one host, do **not** write win copy.
