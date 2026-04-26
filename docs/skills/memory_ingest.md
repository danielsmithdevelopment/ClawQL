# Skill: `memory_ingest`

Persist important outcomes into the Obsidian vault as durable team memory.

## When to Use

- A decision, incident, or implementation milestone is complete.
- You need cross-session recall later.
- You want notes linked to existing vault pages.

## Common Workflow

1. Choose a stable `title` for this topic.
2. Write concise `insights` (what changed and why).
3. Add `toolOutputs` or `toolOutputsFile` for evidence.
4. Add `wikilinks` to related notes.
5. Use `sessionId` and `append: true` for ongoing threads.

## Patterns

### Pattern A: Decision log

- `insights`: decision + rationale + risk
- `wikilinks`: architecture, runbook, related issue notes

### Pattern B: Incident outcome

- summary + root cause + fix + follow-ups
- attach sanitized logs via `toolOutputs`

### Pattern C: Large artifact capture

- pass `toolOutputsFile` to avoid large MCP payloads

## Tips

- Avoid secrets in any field.
- Reuse titles for the same long-running topic.
- Prefer short, structured notes over raw transcript dumps.
- For large artifacts (deck text, long logs), prefer `toolOutputsFile` over huge inline payloads.

## Composed Workflow

1. `memory_recall` before major edits or issue filing.
2. Do work (`search`/`execute`/other tools).
3. `memory_ingest` outcome summary with stable title + `append: true`.
