# Harvey LAB right-sizing — frozen criteria

**Frozen:** 2026-11-10 (before any scored rightsizing run)  
**Revision 2026-11-11:** Energy measurement method for local arms: `powermetrics` (software) is the approved method until a hardware logging meter is available (Daniel's decision, 2026-11-11). H1–H4, tolerances, and pass/publish rules are unchanged.  
**Run order locked:** 2026-11-10 — Mac mini A/B → Opus C/D via Cursor after **2026-11-12** usage reset (not OpenRouter paid) → 5090 A/B only after Mac mini done  
**Handoff:** [`harvey-lab-rightsizing-remeasure-handoff.md`](./harvey-lab-rightsizing-remeasure-handoff.md)  
**Stack:** `ts-clawql-data-v2` only · legacy `python-duckdb-v1` quarantined

These definitions are set **before data exists** and are never loosened afterward. Runs are voided only for monitored environment faults recorded at the time, never after seeing results. All arms and all hypotheses are published, including ones that fail. **Phase order is part of the freeze** — do not start 5090 before Mac mini completion, and do not burn OpenRouter paid quota for C/D while Cursor usage after the 12th covers them.

## Task set and harness

| Field | Value |
| --- | --- |
| Tasks | Harvey LAB firm-knowledge **001–025** (Calderwood & Harkness) |
| Harness | Harvey's harness (ClawQL agent-stack arms only where noted) |
| Stack | Shipped ClawQL on `ts-clawql-data-v2` |
| Identity | Every artifact records ClawQL **git commit** + **build hash** + `stack_version` |
| Judge | Same model string for every arm (campaign default: `claude-sonnet-4-6` unless run config pins another) |
| Blind judging | Arm-identifying markers stripped from deliverables before judging |

## Arms (fixed)

| Arm | Model | ClawQL |
| --- | --- | --- |
| A | Nemotron 3.5 Lightning (local) | No |
| B | Nemotron 3.5 Lightning (local) | Yes |
| C | Current Opus via **Cursor** after 2026-11-12 reset — exact string pinned in run config | No |
| D | Same Opus string as C | Yes |

Local phases (strict): (1) Mac mini / MLX **first**, (2) RTX 5090 / vLLM **only after Mac mini A/B done**. Opus C/D between them or after Mac mini, never requiring 5090. Headline local energy uses **batch size 1**. Quantization recorded per host; success measured per platform.

## Hypotheses (report whatever the outcome)

- **H1:** B beats A on all-pass and CPR (ClawQL lifts the small model).
- **H2:** B *matches* C, defined as all-pass within **2 tasks** of C and aggregate CPR within **5 percentage points**. *Beats* means strictly higher on both.
- **H3:** B uses less energy per successful task than C. Stated as **measured (B)** versus **estimated or not measured (C)**, never as a measured comparison unless both sides are measured.
- **H4:** D costs less per successful task than C, at equal or better all-pass.

## Pass / publish rules

1. Validity gates in the handoff (product-path fingerprint, no answer leakage, blind judging, evidence integrity) must all pass before the scored sweep.
2. Unique evidence path per run; no overwrites; traces and judge outputs persisted; public GHA run IDs for every scored run.
3. Energy: report **incremental** and **total** for local arms; API energy estimated-with-source or "not measured"; judge energy excluded.
4. Claim wording templates in the handoff may be filled **only** from these results; quarantined ledger numbers never appear as current.

## Void rule

Void only for monitored environment faults recorded contemporaneously (power sampler (`powermetrics`) failure mid-sweep, host suspend/OOM documented at the time, wrong stack fingerprint). Do not void after inspecting scores.

## Open items (block first scored run; do not change H1–H4 text after clearing)

Tracked in the handoff. Clearing them does **not** re-open H2 tolerances unless a new criteria revision is committed **before** any scored run, with a new date line above.
