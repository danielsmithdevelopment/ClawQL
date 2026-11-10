# Harvey LAB right-sizing remeasure: handoff

**Prepared 2026-11-10 · Owner: Daniel Smith · Status: phased — Mac mini local first; Opus deferred; 5090 after Mac mini**

## Run order (locked 2026-11-10)

Do not reorder these phases. Later phases may start only when the prior phase’s scored artifacts are in place (or explicitly voided).

| Order | Phase | Arms | Host / path | Gate before starting |
| --- | --- | --- | --- | --- |
| 1 | Mac mini local | A, B | Mac mini · MLX · batch 1 · wall energy | Open items for local + green task-001 smoke for B |
| 2 | Opus (frontier) | C, D | **Cursor usage** after the **2026-11-12** reset — not OpenRouter paid spend | Phase 1 Mac mini A/B done (or voided); Opus model string pinned |
| 3 | 5090 local | A, B | RTX 5090 · vLLM · batch 1 (+ optional batched extra) | **Mac mini phase fully done**; meters + quantization recorded |

Rationale: Opus via Cursor after the monthly usage reset avoids hundreds in OpenRouter spend. The 5090 phase waits so Mac mini energy/success numbers exist first and the high-idle GPU is not powered for this board prematurely.

## Purpose

Produce publishable evidence for one claim: **a small open-weight model with ClawQL can match a frontier model on the same legal tasks, at a fraction of the cost and energy per successful task; and when a frontier model is used, ClawQL makes it cheaper per success too.** This board feeds the cost, energy and governance positioning and the whitepaper's regulated-enterprise thesis.

**Frozen criteria (committed before scored runs):** [`harvey-lab-rightsizing-frozen-criteria.md`](./harvey-lab-rightsizing-frozen-criteria.md)  
**Stack lineage:** [`harvey-lab-stack-lineage.md`](./harvey-lab-stack-lineage.md) · **Smoke gate:** [`harvey-lab-ts-v2-smoke-gate.md`](./harvey-lab-ts-v2-smoke-gate.md)  
**Quarantined ledger (do not cite as current):** [`harvey-lab-clawql-results.md`](./harvey-lab-clawql-results.md) · postmortem [`harvey-lab-python-duckdb-postmortem.md`](./harvey-lab-python-duckdb-postmortem.md)

## Why a remeasure

- **The earlier numbers are quarantined.** Nemotron + ClawQL scored 11/25 all-pass vs 0/25 baseline on tasks 001–025 (CPR 64.4% vs 9.4%), and Opus task 001 showed the same 7/7 at about 17.7× lower cost. The postmortem found the scored agent was not using the shipped product: it ran through a throwaway data layer and its traces teach a tool protocol that no longer exists. Those numbers stay labeled quarantined and are never cited as current results.
- **The rebuilt stack is verified but unmeasured.** `ts-clawql-data-v2` passes 25/25 ground-truth SQL assertions with no model in the loop ([`sql-gold-001-025.json`](../../benchmarks/harvey-labs/results/ts-v2/sql-gold-001-025.json)). That proves the retrieval design, not agent performance. The contiguous agent run on v2 has not been done.
- **Before running:** if any public post still cites the quarantined results ("results from the Harvey LAB benchmark", "perfect all-pass"), correct it first.

## Scope

- **Tasks:** Harvey LAB 001–025, Calderwood & Harkness firm-knowledge set, using Harvey's harness.
- **Stack:** the shipped ClawQL product on `ts-clawql-data-v2`. Record the ClawQL commit and build hash in every artifact (`stack-version.json` + fingerprint).
- **Out of scope:** comparisons to externally published LAB numbers (different task sets, harnesses and judges). They may appear only as labeled context, never as head-to-head results.

## Arms

| Arm | Model | ClawQL | Question it answers |
| --- | --- | --- | --- |
| A | Nemotron 3.5 Lightning (local) | No | Small-model baseline |
| B | Nemotron 3.5 Lightning (local) | Yes | Does ClawQL lift a small model? |
| C | Current Opus (via Cursor after 2026-11-12 reset) | No | Frontier baseline |
| D | Current Opus (via Cursor after 2026-11-12 reset) | Yes | Does ClawQL make the frontier model cheaper per success? |

Pin every model string, quantization and runtime in the run config. Use the same judge for every arm (the earlier campaign used Claude Sonnet 4.6), pinned by exact model string.

**Repeats:** three runs per task for arms A and B (local, free). Arms C and D: three runs if Cursor usage allows after the 12th reset, otherwise one, disclosed in the results. **Do not** burn OpenRouter paid quota for C/D while Cursor usage can cover them — earlier per-task OpenRouter figures (~$250 Opus baseline / ~$15 Opus+ClawQL) are why this board waits for the reset.

### Hardware: Mac mini first; 5090 only after Mac mini is done

Arms A and B run on both local machines, in **strict sequence** (see Run order above):

| Phase | Host | Runtime | When |
| --- | --- | --- | --- |
| 1 | Mac mini | MLX | **Now** (after local open items + smoke) — daily-use host; very low idle and peak power |
| 2 | RTX 5090 host | vLLM | **Only after Mac mini A/B scored (or voided)** — faster per task, but idle draw exceeds the Mac mini's peak |

The Mac mini ↔ 5090 comparison is descriptive, not a hypothesis: energy is power multiplied by time, so the 5090's higher power may be offset by finishing tasks faster, or may not. Measure it rather than assume it — and do not start the 5090 phase early.

- **Same model, matched quantization where possible.** If the two runtimes cannot use the same quantization, record each one. Quantization can change accuracy, so success is measured on each platform rather than assumed equal, and energy is compared **per successful task**, which accounts for any accuracy difference.
- **Batch size 1 on both** for the headline comparison, since that matches a single agent's workload. A batched 5090 run (several tasks concurrently) is an optional extra **after** the batch-1 5090 sweep, because batching is where a large GPU's efficiency shows and batch-1 results understate it.
- **Arms C and D** run in the Opus phase (order 2), independent of the 5090 phase, but still after Mac mini local A/B unless a contemporaneous void is recorded.

## Metrics

Per task, per run, per arm:

- All-pass (yes or no) and criterion pass rate (CPR)
- Input and output tokens, turns, wall time
- Cost per task, and **cost per successful task**
- Energy per task, and **energy per successful task**
- Failures and their reasons

Aggregates per arm: all-pass count, aggregate CPR, mean per-task CPR, total and per-success cost and energy, with run-to-run spread.

## Energy protocol

**Local arms (A, B): measured.**

1. Meter the whole host at the wall with a logging power meter; sample at least once per second.
2. Record idle power for 10 minutes before each sweep.
3. Energy per task = (mean power during the task − idle) × task time. Also report total energy including idle.
4. Cross-check with device telemetry (`nvidia-smi` on the 5090, `powermetrics` on the Mac mini).
5. Record hardware, model quantization, and batch size (1).

**Report both incremental and total energy for each host.** Incremental energy (above idle) is what a task costs on a machine that is on anyway; total energy (including idle) is what it costs on a machine powered up just for this work. The 5090's high idle draw makes the two numbers diverge sharply, and which one matters depends on the deployment, so show both and say which a claim uses.

**API arms (C, D): estimated or not reported.** The provider's energy cannot be measured. Report an estimate only if a published per-token or per-request figure exists for that model, with its source and a range, labeled "estimated". Otherwise report energy as "not measured" and compare on tokens and cost.

**Judge energy** is identical across arms and excluded; say so.

## Validity gates (all must pass before the sweep)

1. **Product-path check:** a task 001 smoke run per arm confirms the agent talks to the shipped ClawQL tools, verified by fingerprint, and the artifact records the build hash. See [`harvey-lab-ts-v2-smoke-gate.md`](./harvey-lab-ts-v2-smoke-gate.md).
2. **No answer leakage:** ClawQL arms ingest only corpus documents; the answer key and rubrics are unreachable from the vault and tools.
3. **Blind judging:** strip arm-identifying markers from deliverables before judging.
4. **Evidence integrity:** unique evidence path per run, no overwrites, traces and judge outputs persisted, public GitHub Actions run IDs for every scored run.

## Deliverables

- Frozen criteria file committed before the first scored run — [`harvey-lab-rightsizing-frozen-criteria.md`](./harvey-lab-rightsizing-frozen-criteria.md)
- Results JSON per arm with model strings, build hash, judge, repeats, and per-task metrics (under `benchmarks/harvey-labs/results/ts-v2/rightsizing/`)
- Energy logs and idle baselines for arms A and B
- Public run IDs and persisted traces
- A one-page results summary using the claim wording below

## Claim wording (fill in only from the results)

- "On Harvey LAB tasks 001–025, using Harvey's harness and the same judge for every arm, Nemotron 3.5 Lightning with ClawQL scored \[x\]/25 all-pass versus \[y\]/25 for \[Opus model\] alone."
- "Measured energy per successful task for Nemotron with ClawQL: \[n\] Wh on \[hardware\]. \[Opus model\] energy: \[estimated with source / not measured\]."
- "With ClawQL, \[Opus model\] cost $\[a\] per successful task versus $\[b\] without."
- Always beside the claim: number of runs per arm, judge, task set (25 firm-knowledge tasks, not the full LAB), and a link to the frozen criteria and raw results.

## Open items before first scored run (Mac mini A/B)

- [ ] Confirm the H2 tolerances (2 tasks, 5 points) or set different ones — defaults frozen as stated in criteria file.
- [ ] Get a logging power meter for the **Mac mini**, and confirm MLX quantization for Nemotron.
- [ ] Correct any public post still citing quarantined results.
- [ ] Green task-001 product-path smoke on `ts-clawql-data-v2` for ClawQL arm **B**.

## Open items before Opus phase (C/D) — after 2026-11-12

- [ ] Choose the Opus model string available through **Cursor** (not OpenRouter paid).
- [ ] Confirm Cursor usage budget for repeats (prefer 3; disclose 1 if constrained).
- [ ] Green task-001 product-path smoke for ClawQL arm **D** on the Cursor path.
- [ ] Mac mini phase A/B complete (or voided).

## Open items before 5090 phase — after Mac mini done

- [ ] Logging power meter on the 5090 host; confirm vLLM quantization.
- [ ] Mac mini A/B artifacts committed under `results/ts-v2/rightsizing/`.

## Operator sequence

1. Clear **Mac mini** open items; do not loosen frozen criteria.
2. **Mac mini:** arms A then B (batch 1), energy meters + idle baselines.
3. **Wait for Cursor usage reset (2026-11-12):** arms C then D via Cursor; disclose repeats.
4. Blind judge with pinned Sonnet (or chosen judge string) as arms complete — local can be judged before Opus if desired.
5. **Only after Mac mini is done:** 5090 arms A then B (batch 1); optional batched extra.
6. Publish all arms and all hypotheses, including fails.
