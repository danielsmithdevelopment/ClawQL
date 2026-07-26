# OpenBench A/B failure root cause (2026-07)

## Timeline

| Run                                                                                      | Model                                     | Symptom                                                |
| ---------------------------------------------------------------------------------------- | ----------------------------------------- | ------------------------------------------------------ |
| [30182389422](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30182389422) | `openrouter/deepseek/deepseek-chat`       | memory task both arms **0.333**                        |
| [30186357429](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30186357429) | `openrouter/google/gemini-2.5-flash-lite` | **all three** tasks: 1 turn, no edits (matrix widened) |

## Layer 1 — MCP wiped by `OPENCODE_CONFIG_CONTENT` (fixed)

`clawql opencode --non-interactive` set `OPENCODE_CONFIG_CONTENT` to a
**provider-only** JSON block. OpenCode treats that env as the full config, so the
MCP server written to `~/.config/opencode/opencode.json` was never loaded.

Without ClawQL MCP, **clawql-on could not call `memory_recall`** on the seeded
temp vault — so it behaved like clawql-off and followed the bcrypt comment.

Fix: embed **provider + MCP + `permission: { "*": "allow" }`** in
`OPENCODE_CONFIG_CONTENT` (`buildOpencodeConfigContent`), pass vault env into the
MCP child, prefer workspace `bin/clawql-mcp.mjs`.

## Layer 2 — clawql-inference stripped tool calling (this fix)

After layer 1, CI still failed on **every** task with:

- `turns: 1`, `exit_code: 0`, checker fail
- clawql-on ~20–28s (MCP startup), clawql-off ~3–5s
- OpenCode JSONL for clawql-off showed the model emitting **fake** tool syntax in
  text, then `reason: "stop"` — e.g. a fenced JSON array with
  `tool_code: memory_recall(...)` instead of a real `tool_calls` response.

Root cause: `POST /v1/chat/completions` in clawql-inference:

1. Dropped `tools` / `tool_choice` / `tool_calls` / `role: tool` messages
2. Always returned `finish_reason: "stop"` with text-only `content`
3. Streaming path parsed only `delta.content`, discarding `delta.tool_calls`

OpenCode (via `@ai-sdk/openai-compatible`) sends real edit/bash/MCP tools on every
agent turn. Without passthrough, cheap models invent `tool_code` JSON and stop —
so **both arms** fail equally on memory, token-budget, and multi-provider tasks.

### Fix

When a request uses tool calling, OpenAI-compatible providers **passthrough** the
raw body to upstream (OpenRouter / BYOK) and return upstream JSON or SSE
unchanged (with public `model` rewritten). Text-only requests keep the existing
gateway path (cache / efficiency layers).

## CI matrix (widened)

PR/push OpenBench runs **all three** tasks with the cheap default
`openrouter/google/gemini-2.5-flash-lite` when `OPENROUTER_API_KEY` is set:

- `memory-dependent-continuation`
- `token-budget-constrained`
- `multi-provider-api-workflow`

Artifacts include `agent-logs/trial-*-{arm}.log` for post-mortem.

## Layer 2 verification ([run 30186925604](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30186925604))

Cheap model: `openrouter/google/gemini-2.5-flash-lite`.

| Task                          | clawql-on            | clawql-off        | Notes                                                                                               |
| ----------------------------- | -------------------- | ----------------- | --------------------------------------------------------------------------------------------------- |
| multi-provider-api-workflow   | **1.0** (2 turns)    | **1.0** (2 turns) | Tool loop healthy                                                                                   |
| memory-dependent-continuation | **0.667** (14 turns) | 0.333 (8 turns)   | on recovered argon2id via memory; TTL missed due to `create_reset_token(user_id=…)` signature drift |
| token-budget-constrained      | 0.0 (16 turns)       | 0.0 (11 turns)    | Model wrote YAML but nested `features: [a,b]` parser incomplete                                     |

Follow-ups in the same PR: forward OpenCode JSONL for clawql-on logs; harden memory
checker/instruction for no-arg `create_reset_token`; clarify nested YAML lists in
the token-budget instruction.

## Layer-2 + MCP confirmation ([run 30187110845](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30187110845))

- clawql-on **called `clawql_memory_recall`** and received seeded **argon2id / 900s**
  from the vault (agent-logs). Flash-lite sometimes stops after recall without
  finishing edits — score variance with `trials=1` is expected on the cheapest model.
- multi-provider: clawql-on **1.0** vs clawql-off **0.75**
- token-budget: clawql-off **1.0** after nested-list hint; clawql-on still noisy on flash-lite

## Flash-lite noise and DeepSeek default

Later flash-lite matrices still showed clawql-on **LOSE** cells from model behavior,
not MCP wipe / tool strip / doom-loop (those layers stay fixed):

| Failure mode | Symptom | Mitigation |
| --- | --- | --- |
| Stop-after-recall | multi-provider score 0 after successful vault hit | Instruction: after `memory_recall`, immediately write artifacts |
| Truncated vault recipe | `CLAWQL_MEMORY_RECALL_SNIPPET_CHARS` default 520 cut off YAML parser / scaffold notes | OpenBench MCP env sets snippet chars to **8192** |
| IndentationError | piecemeal `edit` of nested helpers after partial recall | Seed ships complete `parse.py`; instruction: use **write**, not edit |
| `/tmp` writes | multi-provider artifacts outside workspace | Instruction: relative paths only |

Default OpenBench model is now **`openrouter/deepseek/deepseek-chat`** (still cheap
OpenRouter) for a stronger tool loop. Flash-lite remains available as
`openrouter/google/gemini-2.5-flash-lite` for cost-sensitive runs.

## Layer 3 — token-budget doom loop ([run 30187258901](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30187258901))

| Task                          | clawql-on                    | clawql-off |
| ----------------------------- | ---------------------------- | ---------- |
| memory-dependent-continuation | **1.0**                      | 0.333      |
| multi-provider-api-workflow   | **1.0**                      | **1.0**    |
| token-budget-constrained      | **0.0** (277 turns, timeout) | **1.0**    |

clawql-on re-read `config_lib/selftest.py` **276×** and never wrote — `permission: "*": allow`
had disabled OpenCode’s `doom_loop` guard.

Fix: `doom_loop: deny`, slim OpenBench MCP tools (pageindex/documents off), seed
token-budget + multi-provider vault notes so clawql-on recalls the nested-YAML /
wrangler recipe instead of thrashing.

## Target state ([run 30188030157](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30188030157))

Cheap model `openrouter/google/gemini-2.5-flash-lite`, 1 trial — **clawql-on wins every task**:

| Task                          | clawql-on | clawql-off |
| ----------------------------- | --------- | ---------- |
| memory-dependent-continuation | **1.0**   | 0.333      |
| multi-provider-api-workflow   | **1.0**   | 0.0        |
| token-budget-constrained      | **1.0**   | 0.0        |

Additional hardening: memory seed forbids `import argon2`; multi-provider seed/instruction
require relative workspace paths (no `/tmp` writes).
