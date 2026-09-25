# Decide τ=0.80 provenance (honest timeline)

**Purpose:** settle whether τ=0.80 was locked from the off-set **before** the v0.4 four-arm, or selected after the v0.4 miss was known.

**Verdict:** τ=0.80 was selected **after** the four-arm and after the miss at calibrated conf ≈0.739 was known. Therefore **v0.4 is spent for Decide reject selection** as well as for stock T/τ. The 23/40 @ τ=0.80 slice remains a **candidate projection on a spent set**, not evidence that Decide already passed the ship rule.

## Order of events (UTC, 2026-09-25)

| When | What | Decide τ in force |
| --- | --- | --- |
| ~17:06–17:11 | Four-arm GHA [36165019073](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/36165019073) | Fit selected **τ=0.60** under max coverage @ fit prec≥0.9 (**fit FPs allowed**; fit @0.60: 33 fired / 3 errors) |
| ~17:11 | Report published: Decide+reject 34/40, **1** error | still 0.60 |
| After report ingest | Miss pulled: `route-v04-004`, Decide `mcp.search` @ ≈**0.739**, GT `mcp.execute` | diagnosis on spent suite (allowed) |
| After miss known | Stricter fit rule introduced: prec≥0.9 **and** fit `nErrorsFired=0` → max coverage → **τ=0.80** | **0.80** |
| After τ=0.80 set | Spent-v0.4 projection: 23/40, 0 errors, LB ≈85.2% | labeled **candidate / not closeout** |

Sources: GHA job timestamps; commit `dc4e57ca` (Decide v0.5 rule + candidate readout); artifacts `decide-v05-route-v04-004-miss.json`, `decide-v05-fit-zero-err-tau.json`.

## What was true before the four-arm

- Decide **T=0.75** (`temperature_softmax`) was fit on `fast-decision-fit-routing-v0.1` (n=41) during the four-arm **report** phase — off-set only. That T lock stands.
- Decide **τ=0.60** was the only τ locked from fit **before / during** that run (same report phase, same off-set, prior selection rule).

## What is *not* true

- It is **not** true that τ=0.80 was computed from the fit set under the 0-error rule and frozen **before** anyone used the 0.739 miss to move the threshold.
- Reproducibility of “fit-only arithmetic for τ=0.80 under the stricter rule” does **not** clear contamination: the **choice of that stricter rule** was motivated by the v0.4 miss.

## Consequences (locked)

1. Keep stock live: T=4 / τ=0.70, `productionTrusted`.
2. Do **not** promote 23/40 @ 0.80 to a closeout or live swap.
3. Treat τ=0.80 as a **candidate knob** to be **re-locked on the fit set only after v0.5 is frozen** (or re-fit under the predeclared rule with the fit set alone, with the freeze timestamp predating any v0.5 scores). Prefer: freeze v0.5 first → then lock Decide τ from fit under the predeclared 0-error rule → score once.
4. A different drafter’s v0.5 suite is what clears Decide reject for citation.

## Related

- [`V05_DECIDE_PRODUCTION_RULE_PREREGISTERED.md`](./V05_DECIDE_PRODUCTION_RULE_PREREGISTERED.md)
- [`DECIDE_V05_CANDIDATE_READOUT.md`](./DECIDE_V05_CANDIDATE_READOUT.md)
- [`FREEZE-v0.5-routing-fresh.md`](./FREEZE-v0.5-routing-fresh.md)
