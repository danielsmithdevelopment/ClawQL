# Infinity same-host density (Pi hardware deferred)

Time-sensitive follow-up while Infinity’s public density post is still being discussed. **Independent of the durability peer pilot** (`durability-pilot-v1`).

Infinity (AWS + UC Berkeley / Hydro): [github.com/hydro-project/infinity](https://github.com/hydro-project/infinity) · [AWS Open Source Blog](https://aws.amazon.com/blogs/opensource/introducing-infinity-a-runtime-for-extreme-agent-concurrency/)

**Framing:** same cloud host first — same pattern as other density peers. Raspberry Pi 5 numbers land later when hardware is available; do not block the comparison on Pi.

## Step 1 — reproduce their ~100 KB/agent (done)

Pin their `agent_scale` example and match the published shape before any ClawQL comparison.

| Field    | Value                                                                                             |
| -------- | ------------------------------------------------------------------------------------------------- |
| Commit   | `341f6c2` (blog-era pin also used by independent reruns)                                          |
| Command  | `AGENTS=10000 TURNS=20 WAVE=500 cargo run --release -p infinity-agent-core --example agent_scale` |
| Result   | **~103.1 KiB per idle agent** (10k agents × 20 turns, 400k completions, ~29.7s)                   |
| Evidence | [`evidence-agent-scale.json`](./evidence-agent-scale.json)                                        |

**Honesty:** in-memory stores + scripted model; RSS after agents are idle. Matches the public ~100 KB/agent claim. This run was on a **cloud x86_64 host**, not a Raspberry Pi 5 — their “~75k agents in 8 GB” line is still an extrapolation until measured on Pi hardware.

```bash
git clone https://github.com/hydro-project/infinity.git
cd infinity && git checkout 341f6c2
AGENTS=10000 TURNS=20 WAVE=500 \
  cargo run --release -p infinity-agent-core --example agent_scale
```

## Step 2 — same-host ClawQL fair parked column (done; Pi deferred)

Shared shape: **≈20 turns + pending tool**. Infinity keeps that history **in RAM**; ClawQL parks fair-v2 bags **on disk** (ids-only resident). Report both columns — do not collapse to one KiB contest.

| System   | N   | Resident (total RSS / N) | RSS Δ / N (after park) | Disk / agent    | Storage   |
| -------- | --- | ------------------------ | ---------------------- | --------------- | --------- |
| Infinity | 10k | **103.1 KiB**            | (history-dominated)    | n/a (in-memory) | in-memory |
| ClawQL   | 10k | **~31.6 KiB**            | **~0.2 KiB**           | **~32.1 KiB**   | disk bags |

Evidence: [`evidence-same-host-density.json`](./evidence-same-host-density.json)

```bash
npm run benchmark:infinity-same-host-density
# optional: CLAWQL_INFINITY_COMPARE_NS=1000,5000,10000
```

**Honesty:**

- Infinity column is their `agent_scale` at pinned `341f6c2` on this host (step 1).
- ClawQL column is fair-v2 parked bags (`ParkedBagApi`); `residentKiBPerAgent` uses the same total-RSS/N board definition; `rssDeltaKiBPerAgent` shows the ids-only park cost once the Node baseline is already warm.
- History for ClawQL is the **disk** column (~32 KiB/agent), not the RSS column.
- No win copy. Adjacent mechanisms; Pi 5 measurement deferred.

## Later — Raspberry Pi 5

1. Same pinned `agent_scale` on Pi 5 hardware (their reference line / 75k@8GB check).
2. Optional: repeat ClawQL fair parked sample on the same Pi if a head-to-head on that board is useful.
3. Do not conflate with Pi Durable (Earendil) or the durability crash-during-outside-write board.
