# Shared-host contract — durable-agent density

Run both systems on **one host**, same agent shape, same columns, before any win copy.
Methodology is now aligned on both sides (ClawQL PR #1433; Ontologiql #144). Evidence below is still **different hosts** until the shared run.

## Five numbers (side by side)

Once both rows are complete on one host, publish these five under identical definitions:

| #   | Number               | Definition                                                                                                                                                                                                                                                                               |
| --- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **agentsAtLimit**    | First resource exhausted under the shared RSS ceiling (total process RSS). Retained at limit = wake-deadline schedule.                                                                                                                                                                   |
| 2   | **wakeWarmMs p99**   | Cached / warm wake.                                                                                                                                                                                                                                                                      |
| 3   | **wakeColdMs**       | Cold wake — quote **median + range** until orders are locked; no cross-system cold win from a single p99.                                                                                                                                                                                |
| 4   | **deadlineAccuracy** | Shared 1s SLA, identical **fired definition**, identical **flush policy**, **schedule shape + format**, ramp (`sustainablePerSec` + `firstRateMissingSlaPerSec` + `rampWentPastFailure`), **scaled bursts** (first miss; N ≤ agentsAtLimit), flush **crash test**, **deadline restart**. |
| 5   | **restartSurvival**  | Parked bags survive process restart (bag wake).                                                                                                                                                                                                                                          |

## Five deadline arms (shared-host run)

On one host, both systems run:

1. Steady showcase (declared arrival rate)
2. Scaled bursts (first miss; one deadline per agent; N ≤ agentsAtLimit)
3. Sustained-rate ramp (`sustainablePerSec` + first miss rate; `rampWentPastFailure=true`)
4. Flush crash test (SIGKILL mid-drain)
5. Deadline restart (rebuild + overdue catch-up; **disclose schedule format**)

## Methodology status (closed)

| Gate                      | ClawQL                                                                | Ontologiql (#144)                                                                                                              |
| ------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Flush policy + crash test | group_commit 64/10ms; crashTest pass                                  | group_commit 64/10ms; crashTest pass (400 ACK’d, 0 missing/dups). Prior 400k/s was undeclared **os_buffer** — superseded       |
| Scaled bursts             | first miss **250k** @ 2.5e6 agents; N ≤ agentsAtLimit                 | first miss **200k** @ 200k agents (one deadline/agent). Old 400k-at-200k used synthetic ids — superseded                       |
| Ramp past failure         | sustainable **256k**; first miss **384k**; `rampWentPastFailure=true` | sustainable **128k**; first miss **192k**; `rampWentPastFailure=true` (lab @ 200k)                                             |
| Deadline restart          | rebuild ~40–55 ms @ 2.5e6; format disclosed                           | rebuild **80 ms** @ 200k; no loss/dups; overdue prompt 1.0 — **format path still worth compact-array look** before shared-host |
| Shared host               | **pending**                                                           | **pending**                                                                                                                    |

## Reading gaps before shared-host (not win copy)

### Sustained rate ≈ disk fsync rate under group_commit

With `batchMax=64`, durable rate tops out near **64 × fsyncs/sec**. ClawQL’s 256k vs Ontologiql’s 128k lab is ~4k vs ~2k fsyncs/sec — exactly the spread two disks produce. **Do not read the current gap as TypeScript faster than Rust.** On one host the two may converge; if not, the residual means something.

### RebuildMs is still a format column

ClawQL ~40–55 ms for **2.5e6** vs Ontologiql **80 ms** for **200k**. If Ontologiql still parses/sorts individual entries on load, a compact binary array + single-pass heapify should close it. Disclose on-disk + rebuild path next to rebuildMs (ClawQL: `scheduleFormat` in evidence).

## Lab mirror (Ontologiql #144 — different host; not a public deadline claim)

| Field                             | Value                                       |
| --------------------------------- | ------------------------------------------- |
| agentsAtLimit (context)           | 200,000                                     |
| flushPolicy                       | group_commit batchMax=64 flushIntervalMs=10 |
| crashTest.ok                      | true                                        |
| sustainablePerSec                 | 128,000                                     |
| firstRateMissingSlaPerSec         | 192,000                                     |
| rampWentPastFailure               | true                                        |
| firstBurstSizeMissingOneSecondSla | 200,000                                     |
| rebuildFromDiskMs                 | 80                                          |
| noLoss / noDuplicate              | true                                        |
| overdue prompt                    | 1.0                                         |

## Peer artifact (Ontologiql → merge)

Emit JSON matching ClawQL’s `clawql` object in `shared-host-five-arms.json` (same `arms` keys), then:

```bash
# ClawQL on the shared host:
npm run benchmark:program-density-shared-host
# or:
node --expose-gc --import tsx scripts/benchmarks/program-density/run-shared-host-five-arms.mjs \
  --out=docs/benchmarks/program-density/shared-host-five-arms.json

# After Ontologiql writes its peer file on the same host:
CLAWQL_DENSITY_PEER_JSON=/path/to/ontologiql-five-arms.json \
  npm run benchmark:program-density-shared-host
```

Required peer fields: `systemId`, `hostLabel`, `agentsAtLimit`, `flushPolicy`, `scheduleShape`, `scheduleFormat` (onDisk/inMemory/rebuildPath), `arms.{steady,scaledBursts,ramp,crashTest,deadlineRestart}`.

Next: both run all five arms on **one host**. No win copy until then.
