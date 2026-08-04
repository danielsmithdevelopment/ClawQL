# Evidence: Ouroboros stops strategy thrash

**Claim:** With a cheap coding model and OpenCode’s identical-tool `doom_loop` guard
**disabled**, enabling ClawQL **Ouroboros** MCP tools lets the agent crystallize a
spec and converge, while the same harness **without** Ouroboros flip-flops on
conflicting decoys and fails — under hard spend caps (not a $10 key burn).

**Status:** Verified live A/B · [PR #759](https://github.com/danielsmithdevelopment/ClawQL/pull/759) ·
[Actions run 30863572642](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30863572642)

Full harness design, caps, and repro:
[`openbench-ouroboros-oscillation.md`](./openbench-ouroboros-oscillation.md).

---

## What was held constant

| Factor              | Both arms                                         |
| ------------------- | ------------------------------------------------- |
| Model / harness     | OpenCode + clawql-inference (cheap OpenRouter)    |
| MCP core            | Same ClawQL server; vault **memory disabled**     |
| Task                | `ouroboros-oscillation-escape` (leaky-bucket impl)|
| OpenCode `doom_loop`| **`allow`** (so thrash is observable)             |
| Hard auto-fail caps | **≤50 turns · 180s · ≤8000 tokens**               |

**Only difference:** `ouroboros_*` tools + on-only seed appendix (correct recipe).
Off-arm sees conflicting `decoy/` notes that encourage strategy flip-flop.

---

## Headline result

| Arm             | Score   | Turns | Wall | Observed path                                              |
| --------------- | ------- | ----- | ---- | ---------------------------------------------------------- |
| **ouroboros-on**  | **1.0** | 5     | 78s  | `create_seed` → `run_evolutionary_loop` → `write` → pass |
| **ouroboros-off** | **0.0** | 4+    | 167s | Decoy `read`/`write`/`bash` flip-flop → selftest fail    |

**Why this is value, not a toy win**

1. **Strategy thrash ≠ identical-tool spam.** Off failed by alternating decoy
   strategies, not by repeating the same tool call forever.
2. **Ouroboros did the job.** On-arm used the evolutionary loop to lock a seed
   and land one correct write under the generation/turn caps.
3. **Spend stayed bounded.** Caps + `maxGenerations≤4` kept the thrash study
   cheap even with `doom_loop` allowed (earlier run also showed off bash-spam
   hitting `wall_s>180` before a large bill).

Supporting thrash capture (pre write-nudge, both 0.0, off doom-loop into wall):
[run 30424169516](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30424169516).

---

## What this does *not* claim

- Not a multi-trial Wilson CI yet (n=1 live cell on the final design).
- Not “Ouroboros beats OpenCode `doom_loop`” — that guard was **off** so thrash
  could appear. Production often leaves it on.
- Not a vault-memory win — memory was disabled after an early confound where
  both arms one-shot the answer from the vault ([run 30192620319](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30192620319)).

---

## Claim → evidence matrix

What we say Ouroboros does, and how far that claim is backed today.

| # | Claim (customer-facing) | Unit / package tests | Live agent / OpenBench | Status |
| - | ----------------------- | -------------------- | ---------------------- | ------ |
| 1 | Stops **strategy thrash** when harness `doom_loop` is off | n/a (agent behavior) | on 1.0 / off 0.0 ([30863572642](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30863572642)) | **Verified (n=1)** |
| 2 | Still adds value when OpenCode `doom_loop` is **on** (strategy A↔B ≠ identical spam) | n/a | not run | **Next A/B** |
| 3 | `create_seed` + `run_evolutionary_loop` used end-to-end under hard caps | MCP hooks + loop tests | observed in winning arm | **Verified (path)** |
| 4 | Convergence taxonomy exits: `oscillation` / `spinning` / `diminishing_returns` / `no_drift` | `convergence.test.ts` | live checker does **not** assert `reason_code` | Library yes · agent no |
| 5 | Drift gate blocks premature converge (`drift_exceeded`, combined > 0.3) | `convergence` + `evolutionary-loop` + `drift` tests | no agent task forces measure/reflect on drift | Library yes · agent no |
| 6 | `ouroboros_measure_drift` + lineage expose usable signals to agents | `mcp-hooks.test.ts`, lineage rebuild | skill mentions lineage; OpenBench never requires these tools | MCP yes · agent unused |
| 7 | Multi-generation **Reflect** improves a failing seed (gen1 fail → gen2+ pass) | loop converges with stub engines | no task where first write must fail AC then recover via loop | **Gap** |
| 8 | Hard `maxGenerations` spend bound | loop override test + CI env clamp | capped at ≤4 in thrash A/B | **Verified** |
| 9 | Durable Postgres lineage / event store | optional integration tests (often skipped in CI) | not in OpenBench | Library partial · ops gap |
| 10 | Wonder/Reflect with real LLMs (not stubs) | stubs in package tests | thrash task uses host default engines via MCP | **Thin** |
| 11 | Model-tier / PAL-style escalation inside the loop | foundation in clawql-inference ([#560](https://github.com/danielsmithdevelopment/ClawQL/issues/560)) | not an Ouroboros A/B | Roadmap / foundation |
| 12 | Marketing “ontology graph continuously measures drift” style copy | 3-component drift shipped ([#557](https://github.com/danielsmithdevelopment/ClawQL/issues/557)); not a full graph product | n/a | Keep claims aligned with [upstream roadmap](../ouroboros/upstream-q00-sync-roadmap.md) |

**Separate ClawQL (non-Ouroboros) OpenBench claims** — memory / multi-provider / token-budget A/Bs live under [#758](https://github.com/danielsmithdevelopment/ClawQL/pull/758). Do not mix those wins into the Ouroboros thrash claim.

---

## Evidence backlog (confirm these to back the story)

Prioritized for **honest product claims**, not feature tourism.

### P0 — ship-blocking for “Ouroboros in production agents”

1. **Additive A/B with `doom_loop` deny** (same decoy task, ≥3 trials).  
   Proves value beyond OpenCode’s identical-tool guard.
2. **Lineage / drift tool use in a graded task.**  
   Checker requires on-arm to call `ouroboros_get_lineage_status` (and ideally `ouroboros_measure_drift`) and emit a small `LINEAGE_OK` / `DRIFT_OK` artifact. Backs skill Patterns B/C, not just “run loop once.”
3. **Multi-generation remediation task.**  
   Workspace starts with a **wrong** `limiter.py`; acceptance fails until Reflect/eval loop lands a fix. Assert ≥2 generations or an explicit `reason_code` in sidecar JSON. Backs “self-healing,” not one-shot seed→write.

### P1 — harden the thrash claim

4. **n≥5** on `doom_loop=allow` (and on the deny cell) for Wilson-style intervals.  
5. **Stagnation-only** variant (rewrite same wrong file, no decoy A↔B) so `diminishing_returns` / `spinning` show up in live lineage, matching unit taxonomy.

### P2 — ops / durability claims

6. Turn on **Postgres Ouroboros integration** in CI (or a scheduled job) and cite a green run when claiming durable lineage.  
7. One **real-LLM Wonder/Reflect** smoke (cheap model, capped gens) so we are not only stub-engine confident.

### Explicit non-goals for this evidence track

- Full Q00 PAL / agent-coordination / NSV-SGDOP parity — roadmap, not current claim support.  
- Inflating the marketing post beyond shipped drift + convergence APIs.

---

## Recommended next test (immediate)

**Additive value with `doom_loop` on (default deny).**

| Arm             | `doom_loop` | Ouroboros | Hypothesis                                      |
| --------------- | ----------- | --------- | ------------------------------------------------- |
| ouroboros-on    | deny        | yes       | Still converges on decoy-conflict task            |
| ouroboros-off   | deny        | no        | Still thrashs via **strategy** flip-flop (A↔B)    |

OpenCode’s guard stops *identical* tool spam; it does **not** stop alternating
between two plausible-but-wrong decoys. Same task, same caps,
`CLAWQL_OPENBENCH_DOOM_LOOP` unset/deny; prefer **≥3 trials**.

Then implement P0.2 (lineage/drift graded) and P0.3 (remediation multi-gen)
before leaning hard on “self-healing / ontological tracking” in customer copy.

---

## Links

- Task pack: [`openbench/tasks/ouroboros-oscillation-escape/`](../../openbench/tasks/ouroboros-oscillation-escape/)
- Workflow: [`.github/workflows/openbench-ouroboros-ab.yml`](../../.github/workflows/openbench-ouroboros-ab.yml)
- Package guide: [`docs/ouroboros/clawql-ouroboros.md`](../ouroboros/clawql-ouroboros.md)
- Skill (agent patterns): [`docs/skills/ouroboros.md`](../skills/ouroboros.md)
- Upstream claim hygiene: [`docs/ouroboros/upstream-q00-sync-roadmap.md`](../ouroboros/upstream-q00-sync-roadmap.md)
- OpenBench overview: [`openbench.md`](./openbench.md)
