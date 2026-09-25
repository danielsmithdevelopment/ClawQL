# Fit / τ freeze v0.1 (after three-set protocol)

## Locked parameters

| Knob              | Value                 | Source                                                            |
| ----------------- | --------------------- | ----------------------------------------------------------------- |
| Calibration mode  | `temperature_softmax` | fit grid on `fast-decision-fit-routing-v0.1`                      |
| Temperature **T** | **4**                 | minimizes fit MCE among passing modes (softmax preferred on ties) |
| Routing τ         | **0.70**              | FP-costly rule: precision ≥ 0.90 → max coverage; ties → higher τ  |
| Enrichment        | off                   | not selected here                                                 |

Supersedes prior default T=3 (Harvey-only, n=24). See also [`CALIBRATION_FREEZE_v0.1.md`](./CALIBRATION_FREEZE_v0.1.md) (historical).

## Fit set

| Source              | n      |
| ------------------- | ------ |
| Spent v0.3 routing  | 34     |
| Harvey v0.2 routing | 7      |
| **Total**           | **41** |

File: `fast-decision-fit-routing-v0.1.json`. Exact query overlap with v0.4: 0.

### Fit calibration @ T=4

| Acc   | MCE   | §7   |
| ----- | ----- | ---- |
| 0.707 | 0.033 | pass |

### Fit τ selection

| τ                 | coverage  | nAccepted | precision | FP  |
| ----------------- | --------- | --------- | --------- | --- |
| **0.70 (locked)** | **0.488** | 20        | **0.900** | 2   |
| 0.75              | 0.439     | 18        | 0.889     | 2   |
| 0.80              | 0.366     | 15        | 0.933     | 1   |
| 0.85              | 0.244     | 10        | 1.000     | 0   |

## Eval once — frozen v0.4 (provisional GT)

Scored **once** after (T, τ) locked. `adjudicated=false`.

### Calibration

| Acc   | MCE   | §7       | buckets (n)                                                |
| ----- | ----- | -------- | ---------------------------------------------------------- |
| 0.800 | 0.118 | **pass** | 0.5–0.6:17 · 0.6–0.7:4 · 0.7–0.8:3 · 0.8–0.9:6 · 0.9–1.0:9 |

### Fast path @ locked τ=0.70

| Metric                  | Value             |
| ----------------------- | ----------------- |
| Coverage                | **18/40 = 0.450** |
| Accuracy among accepted | **18/18 = 1.000** |
| False positives         | 0                 |

At builtin-old 0.75: coverage 0.400, among-accepted 1.000 (16/16).

**Weight:** provisional GT; frontier adjudication can move these. nAccepted=18 is still modest for a 90%+ claim.

## productionTrusted

**false** — needs live frontier labels on v0.4. Calibration + τ criteria pass on provisional GT.

## Artifact

`/opt/cursor/artifacts/fast-decision-fit-and-score-v04-once.json`  
Harness: `scripts/fit-and-score-v04-once.mts`

## Related

- [`THREE_SET_PROTOCOL.md`](./THREE_SET_PROTOCOL.md)
- [`FREEZE-v0.4-routing-fresh.md`](./FREEZE-v0.4-routing-fresh.md)
- [`FIT_SET_SCAFFOLD.md`](./FIT_SET_SCAFFOLD.md)
