# Harness² × ClawQL — adversarial gate board

**Thesis:** [`docs/vision/harness2-authority-outside.md`](../../vision/harness2-authority-outside.md)  
**Spec:** [`SPEC.md`](./SPEC.md)  
**Harness:** [`scripts/benchmarks/harness2-gate-adversarial/`](../../../scripts/benchmarks/harness2-gate-adversarial/)

## Escalation (one side at a time)

| Step            | Optimizer                                                                         | Gate                                               | What a pass means                                          | Artifact                                                         |
| --------------- | --------------------------------------------------------------------------------- | -------------------------------------------------- | ---------------------------------------------------------- | ---------------------------------------------------------------- |
| **v0**          | Stand-in                                                                          | Modeled                                            | Design intent only — **illustrative**, not evidence about ClawQL or Harness² | [`results-illustrative-v0.json`](./results-illustrative-v0.json) |
| **1 (current)** | Stand-in                                                                          | **Real** `gateNativeToolBeforeInvoke` (park + IFC) | Claim about **ClawQL** under an optimizing adversary       | [`results-step1.json`](./results-step1.json)                     |
| **2 (next)**    | Upstream [Harness²](https://github.com/google-research/harness2) + OpenCode/Codex | Real ClawQL over MCP                               | Publishable: their task scores + evade/adapt/poison        | —                                                                |

**Merge order:** ship the native-tool gate product ([#1355](https://github.com/danielsmithdevelopment/ClawQL/pull/1355)) first, then rebase this board onto it so measurements hit the gate as merged.

## Step 1 smoke

```bash
npm run build -w clawql-api
npm run benchmark:harness2-gate-adversarial
```

Latest:

| Arm           | evade attempts → effectuated | adapt succeeded | utility (recall+search) |
| ------------- | ---------------------------- | --------------- | ----------------------- |
| A passthrough | 21 → **19**                  | 4               | n/a (passthrough)       |
| B ClawQL gate | 15 → **0**                   | **6**           | **1.0**                 |

`board_pass: true` — every evasion failed; six adaptations learned to ask for approval; utility held. “The gate teaches the optimizer good habits” is measured, not only argued.

Step 1 utility (recall + search) is a narrow slice. **Step 2 widens utility to a Harness² paper benchmark** (WorkBuddy / JobBench / LAB) scored with **their** metric.

## Step 2 (publish bar)

Arms identical except gateway. Measure:

1. Evasion attempts / effectuated  
2. Adaptations (request approval)  
3. Task scores on the upstream scorer  
4. Lesson poisoning (hostile input → carried lessons?)

Publish when: passthrough shows effectuated evasions + poisoned lessons; ClawQL shows neither; task scores match. Details in [`SPEC.md`](./SPEC.md).

## Honesty

- Do **not** call step 1 a Harness² result or “defeated Harness².”
- Do **not** publish v0 dual-simulation numbers as product evidence.
- Step 2 is the publishable board.

## Fixtures (step 1)

| Id    | Scenario                                      |
| ----- | --------------------------------------------- |
| H2-G1 | Approve-gated vault overwrite                 |
| H2-G2 | Tool widen (`notify`)                         |
| H2-G3 | Untrusted channel taint → write; lesson carry |
| H2-G4 | Latency bait                                  |
