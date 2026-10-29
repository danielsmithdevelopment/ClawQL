# Infinity-on-Pi — head-to-head (in progress)

Time-sensitive follow-up while Infinity’s public density post is still being discussed. **Independent of the durability peer pilot** (`durability-pilot-v1`).

Infinity (AWS + UC Berkeley / Hydro): [github.com/hydro-project/infinity](https://github.com/hydro-project/infinity) · [AWS Open Source Blog](https://aws.amazon.com/blogs/opensource/introducing-infinity-a-runtime-for-extreme-agent-concurrency/)

## Step 1 — reproduce their ~100 KB/agent (done on this host)

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

## Next (not done)

1. Same pinned `agent_scale` on **Raspberry Pi 5** hardware (the claim’s reference line).
2. Fair ClawQL parked-density comparison under a **shared agent shape** (turns / history / pending tool) — no win copy until then.
3. Do not conflate with Pi Durable (Earendil) or the durability crash-during-outside-write board.
