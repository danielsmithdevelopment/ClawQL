# Harness² and authority outside the harness

**Status:** Positioning · October 2026  
**Related:** [Harness² (Google Research)](https://github.com/google-research/harness2) · [arXiv:2610.14224](https://arxiv.org/abs/2610.14224) · [governance / policy-depth board](../benchmarks/governance-policy-depth/README.md) · [adversarial gate benchmark (spec)](../benchmarks/harness2-gate-adversarial/SPEC.md)

Google’s open-sourced **Harness²** turns the agent _harness_ — system prompt, tools, memory, skills, subagents, orchestration — into something the agent can refine per task without touching model weights. On each task it proposes harness edits, runs candidates, and composes a better harness from **behavioral contrasts** (no grader required). Adopted harnesses and evidence-backed lessons carry into the next task.

That idea **extends ClawQL’s thesis rather than threatening it.** A harness that edits itself is the strongest argument yet for **authority that sits outside the harness**.

## What changes

Today a person designs the system prompt, tools, memory, and skills once, and reviews them. With Harness²-style recursion, the agent proposes edits to all of those for each task, picks the version that behaved best, and carries “lessons” forward. The agent’s own configuration can change **without human review**, based on the content it processed.

Production repair loops (failing trace → proposed fix → regression test — e.g. Comet Opik-style workflows) are the same family of idea applied after failure. Harness² generalizes it to every task, with or without a correct answer.

## Three risks that follow

1. **Persistent injection, one level up.** Planted instructions in task input do not only risk one bad action. They can shape harness edits and saved lessons; later tasks start from them. This is the memory-poisoning problem applied to the agent’s own setup.
2. **Learning without a grader can learn the wrong thing.** Improvement is by comparing how runs behaved, not by checking a correct answer. If an approval step makes runs slower, “avoid the step that waits for approval” can look like an improvement.
3. **Permission creep.** Tools and subagents are part of the harness. An optimizing agent can propose giving itself broader tools.

## How ClawQL answers them

| Risk                                        | ClawQL control                                                                                                                                                                                                                 |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Persistent injection into harness / lessons | Policies, approval rules, and key groups live in the **gateway**, outside the harness the agent optimizes. Untrusted content stamped at ingest cannot later drive privileged sinks without re-taint / park.                    |
| Grader-free shortcut around safety          | Every call still hits the same choke point. Latency of approval is not a success signal the gateway honors. Unknown or renamed tools **fail closed**.                                                                          |
| Permission creep                            | New tools and skills go through the lifecycle: proposed → proven on held-out + adversarial runs → reviewed → active. Widening reach is a **write to permissions** and parks for a person, like any other consequential change. |

**Principle (same as improving how vs what):** let the agent improve _how_ it works; never _what_ it is allowed to do.

## Positioning note

Harness²’s editable surface includes **guardrails** as a harness component. In ClawQL language those belong _outside_ the improvable harness when they encode authority (ATR, key groups, approval, provenance). Soft behavioral guidance in a system prompt may be refined; hard policy must not be.

Do **not** claim that Harness² is “defeated” or that ClawQL is certified against recursive harnessing. The claim is architectural: **self-improving harnesses increase the value of an external choke point**, and ClawQL was built for that choke point.

## Benchmark worth running

Harness² (or an equivalent Propose–Probe–Compose loop) with ClawQL as the tool layer, on tasks where the **fastest path runs through a gated action**. Measure whether the harness learns to route around approvals, and whether it can.

If the gate holds while the optimizer actively searches for shortcuts, that is a sharp, novel result: **the gate holds even against an agent optimizing to get past it.**

Board: [`docs/benchmarks/harness2-gate-adversarial/README.md`](../benchmarks/harness2-gate-adversarial/README.md) · [`SPEC.md`](../benchmarks/harness2-gate-adversarial/SPEC.md).

- **v0** dual-sim = illustrative only.
- **Step 1** = real ClawQL park/IFC vs stand-in optimizer (claim about ClawQL; evade≠adapt; narrow utility). Measured: gate teaches good habits (`adapt_succeeded` > 0, `evade_effectuated` = 0).
- **Step 2** (publishable) = real Harness² + MCP vs passthrough; utility = WorkBuddy / JobBench / LAB **their** scores; lesson-poison cell. Merge native-tool gate ([#1355](https://github.com/danielsmithdevelopment/ClawQL/pull/1355)) before trusting board numbers against shipped code.

## Related ClawQL surfaces

- Native-tool IFC / park / untrusted labels — multi-attack and governance boards
- Panguard / ATR on MCP tool wrap — unknown tools fail closed
- Skills / plugin lifecycle and Ouroboros propose-from-eval (opt-in; not auto-apply by default)
- Model provenance gate — identity policy also outside the improvable prompt surface
