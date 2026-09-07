---
name: deep-thinking
description: >-
  Chain-of-thought deep reasoning before consequential decisions: world state,
  assumptions, hypotheses, options, blast radius, and after-action takeaways.
  Use when restarting services, killing processes, launching long evals, choosing
  between known-good vs shortcut paths, debugging intermittent failures, or when
  the user asks for deep thinking, chain of thought, CoT, or postmortems.
---

# Deep thinking (chain of thought)

Externalize a **written reasoning chain** before irreversible or expensive
actions, and a **short after-action** when outcomes falsify assumptions. The
goal is not ceremony — it is to catch shortcut reasoning (e.g. `nohup` in a
dying agent shell) before it burns a run.

This is **thinking on the page**, not a silent checklist. Prefer prose that
shows *why*, then compress for the user-facing reply.

## When to run (gates)

Invoke **before acting** when any of these are true:

- Kill / restart / rebind a long-lived process (inference, MCP, Docker, tunnels)
- Launch a multi-minute/hour eval, train, or data wipe (`rm -rf output/…`)
- Choose a **new** start pattern over a **known-good** one already used this session
- Symptoms could be process-lifecycle vs app-crash vs model-quality
- User asks to “think hard,” “CoT,” “deep think,” or explain a decision
- About to claim a root cause from a single datapoint

Skip for trivial edits, pure Q&A, or when the user already dictated the exact command.

## How to use

1. **Write the chain** (tool scratch, todo note, or a short internal block) using
   the template below — fill every section; mark unknowns as unknowns.
2. **Act** only after the Decision section names the pick and why alternatives lost.
3. **After-action** when the result surprises you or burns >~5 minutes — update
   assumptions and leave one sticky takeaway (optionally `memory_ingest` if vault
   tools are available).

Do **not** dump the full chain into every user reply unless they asked for it.
User-facing: 2–6 sentences of the conclusion + the sticky takeaway. Keep the
full chain in the agent trail.

---

## Chain template (fill in order)

Copy and complete:

```markdown
### CoT — <short decision title>

#### 1. Goal
What success looks like for *this* step (not the whole project).

#### 2. World state (observed, not hoped)
- Processes / ports / terminals still alive:
- What was started how (Cursor background terminal vs nohup vs systemd vs Docker):
- What dies if *this* shell exits:
- Artifacts / run ids / last known-good scores:
- Clock / duration expectations:

#### 3. Evidence so far
Bullet facts with sources (log line, exit code, healthz, pack_errors).
Separate **signal** from **interpretation**.

#### 4. Assumptions (explicit)
| # | Assumption | If false, what breaks? | How to falsify quickly? |
|---|------------|------------------------|-------------------------|
| A1 | … | … | … |

Challenge at least one assumption that feels “obvious.”

#### 5. Hypotheses (competing)
H1: …
H2: …
H3: …
What would we observe if each were true?

#### 6. Options
For each option: steps, durability, blast radius, time cost, reuse of known-good patterns.

| Option | Durability | Blast radius | Time | Notes |
|--------|------------|--------------|------|-------|
| O1 … | | | | |
| O2 … | | | | |

#### 7. Decision
Pick: Ox
Because: …
Rejected: … because …
Risk I am accepting: …
Rollback: …

#### 8. First verification
The smallest probe that proves the decision held (healthz, one smoke chat,
one doc, listener still up after parent shell ends).

#### 9. Stop conditions
Abort / rethink if: …
```

### After-action (when needed)

```markdown
### After-action — <same title>
- Expected:
- Observed:
- Which assumptions died:
- True root cause (lifecycle / crash / logic / data):
- Sticky takeaway (one sentence the future agent must not forget):
- Process change (how we start/stop/monitor next time):
```

---

## Reasoning standards (chain-of-thought style)

Write as if explaining to a skeptical peer:

1. **Narrate causality** — “X happened, therefore Y is possible; Z would look different.”
2. **Prefer mechanisms over vibes** — exit 143 = SIGTERM; connection refused = nothing listening; empty crash log ≠ healthy restart.
3. **Name the process parent** — who owns the listener? What signal kills it? Does `nohup` help against that signal?
4. **Compare to known-good** — if a pattern already worked for hours this session, argue explicitly why a different pattern is better *now*.
5. **Separate layers** — infra lifecycle vs provider logic vs model quality vs eval harness scoring. Do not fix layer N for a layer N−1 failure.
6. **Quantify surprise** — “eval finished in 2m vs ~70m expected ⇒ not a real full run.”
7. **One sticky lesson** — portable across sessions (e.g. “agent short shells SIGTERM the process group; durable services need their own background terminal”).

### Anti-patterns

- Checklist theater (ticks without causal prose)
- Restarting “to be safe” without stating what you are resetting
- Treating `nohup` / `disown` / `&` as immortal under Cursor agent shells
- Declaring model/prompt failure when the symptom is `Connection error`
- Skipping after-action when the same failure repeated twice

---

## Domain hints (common ClawQL / eval traps)

Use these as prompts inside the chain, not as substitutes for thinking:

- **Cursor Shell lifecycle**: finished tool call → often SIGTERM to process group. Background `block_until_ms: 0` terminals outlive the turn. `nohup` ≠ ignore SIGTERM.
- **Inference gateway**: client `Connection error` / empty call-store during a “run” usually means the listener died, not that Qwen failed.
- **Structural seed wins**: high F1 with `llm: 0` proves seed path, not LLM path.
- **Fast “complete” evals**: wall time ≪ historical ⇒ check `_errors.json` and pack_errors before celebrating.
- **Harvey LAB GHA**: `cancel-in-progress` on `harvey-lab-fk-*` — any new workflow on the branch cancels the live matrix. Default PR smoke (no marker) uses **gpt-5.4-mini** judge, not Sonnet; Sonnet + multi-task needs `.run-nemotron-sweep`. OpenRouter free-tier resets **midnight UTC**.

For a worked failure→fix narrative, see [examples.md](examples.md).

---

## Minimal user-facing wrap

After the chain (and action), tell the user:

1. What you decided and the one reason it beat the alternative
2. How you will verify it held
3. If after-action: the sticky takeaway

Keep the full CoT out of the chat unless they ask to see the reasoning.
